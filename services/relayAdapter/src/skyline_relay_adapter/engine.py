import csv
from dataclasses import asdict
from datetime import datetime,timezone
import hashlib
import json
import os
from pathlib import Path
import threading
import numpy as np
import spiceypy as spice
from . import orbit
from .schemas import RelayRequest,epoch,replayDays
from .legacy import loadSpice,southPoleSites,earthPositions,frameRotations,moonRadius,relayToEarth
from .legacy.terrainHorizon import cachedHorizon,HorizonConfig

lock=threading.Lock()
coverageBodies=(301,399)
moonPaFrame=31006

def fileHash(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()

def metrics(available,timesS,stepS=120):
    available=np.asarray(available,dtype=bool)
    intervals=[]
    outages=[]
    begin=0
    for index in range(1,len(available)+1):
        if index==len(available) or available[index]!=available[begin]:
            interval=[float(timesS[begin]),float(timesS[index-1]+stepS)]
            (intervals if available[begin] else outages).append(interval)
            begin=index
    return dict(fraction=float(available.mean()),maximumBlackoutS=max((b-a for a,b in outages),default=0.),
                availableIntervalsS=intervals,blackoutIntervalsS=outages)

def kernelCoverage(kernels):
    '''Intersection of the loaded SPK (Moon, Earth) and lunar PCK coverage, as (start, end) ET seconds.'''
    paths={path.name:str(path) for path in kernels}
    windows=[]
    for body in coverageBodies:
        cover=spice.cell_double(200)
        spice.spkcov(paths['de440s.bsp'],body,cover)
        windows.append(cover)
    cover=spice.cell_double(200)
    spice.pckcov(paths['moon_pa_de421_1900-2050.bpc'],moonPaFrame,cover)
    windows.append(cover)
    start=max(window[0] for window in windows)
    end=min(window[2*spice.wncard(window)-1] for window in windows)
    return float(start),float(end)

def utc(et):
    return spice.et2utc(et,'ISOC',0)+'Z'

class RelayEngine:
    def __init__(self,assetRoot=None):
        self.root=Path(os.environ.get('RELAY_PROJECT_ROOT',Path.cwd())).resolve()
        self.assets=Path(assetRoot or os.environ.get('RELAY_ASSET_ROOT',self.root/'data/raw'))
        self.horizons={}
        self.window=None

    def kernelWindowUtc(self):
        '''Kernel-bounded [start, end) UTC for propagated requests, or None while kernels are unreadable.'''
        if self.window is None:
            with lock:
                try:
                    with loadSpice(self.assets/'spice') as kernels:
                        self.window=tuple(utc(value) for value in kernelCoverage(kernels))
                except (ValueError,OSError,spice.utils.exceptions.SpiceyError):
                    return None
        return self.window

    def evaluate(self,request):
        request=RelayRequest.model_validate(request)
        if not lock.acquire(blocking=False):
            return dict(schemaVersion='1.0',dataState='unavailable',error={'code':'busy'})
        try:
            return self.compute(request)
        except (ValueError,OSError,spice.utils.exceptions.SpiceyError) as error:
            return dict(schemaVersion='1.0',dataState='unavailable',error={'code':'scientific_unavailable','message':str(error)})
        finally:
            lock.release()

    def compute(self,request):
        site=next(site for site in southPoleSites if site.siteId==request.siteId)
        statePath=self.root/'data/states/candidate2States.csv'
        manifest=json.loads((self.root/'docs/sourceManifest.json').read_text())
        expectedHash=next(item['sha256'] for item in manifest if item['path'].endswith('candidate2States.csv'))
        if fileHash(statePath)!=expectedHash:
            raise ValueError('Verified trajectory identity mismatch')
        sourceHashes={path.name:fileHash(path) for path in [statePath,self.assets/'lola/LDEM_80S_80MPP_ADJ.TIF',self.assets/'lola/LDEM_60S_240MPP_ADJ.TIF']}
        with loadSpice(self.assets/'spice') as kernels:
            sourceHashes.update({path.name:fileHash(path) for path in kernels})
            horizonKey=json.dumps(dict(site=asdict(site),sources=sourceHashes),sort_keys=True)
            if horizonKey not in self.horizons:
                if len(self.horizons)>=3:
                    self.horizons.clear()
                self.horizons[horizonKey]=cachedHorizon(site,self.assets/'lola/LDEM_80S_80MPP_ADJ.TIF',self.assets/'lola/LDEM_60S_240MPP_ADJ.TIF',self.root/'data/cache',HorizonConfig())
            horizon=self.horizons[horizonKey]
            offset=int((request.startUtc-epoch).total_seconds())
            cadence=request.cadenceS
            verified=0<=offset and offset+request.durationS<=replayDays*86400 and request.satellites==2 and cadence==120
            if verified:
                allTimes=np.arange(0,28*86400,120.)
                records=np.genfromtxt(statePath,delimiter=',',skip_header=1)
                states=[]
                for satellite in [0,1]:
                    rows=records[records[:,0]==satellite]
                    if not np.array_equal(rows[:,1],allTimes):
                        raise ValueError('Export grid mismatch')
                    states.append(rows[:,2:])
                states=np.stack(states)
                left=offset//120
                right=left+request.durationS//120
                positions=states[:,left:right,:3]
                timesS=np.arange(right-left)*120.
                et=spice.str2et('2025-01-01T00:00:00Z')+allTimes[left:right]
            else:
                timesS=np.arange(request.durationS//cadence)*float(cadence)
                et=spice.str2et('2025-01-01T00:00:00Z')+offset+timesS
                first,last=kernelCoverage(kernels)
                if et[0]<first or et[-1]+cadence>last:
                    raise ValueError(f'Requested window is outside SPICE kernel coverage ({utc(first)} to {utc(last)})')
                positions=orbit.states(offset,timesS,request.satellites,statePath)[:,:,:3]
            earth=earthPositions(et,'MOON_ME_DE421')
            relays=np.einsum('tij,rtj->rti',frameRotations(et,toFrame='MOON_ME_DE421'),positions)
            siteLeg=horizon.margins(relays*1000)>=0
            earthLeg=relayToEarth(relays,earth,moonRadius())
            viaRelay=np.any(siteLeg&earthLeg,axis=0)
            directMargin=horizon.margins(earth*1000)
            direct=directMargin>=0
            assisted=direct|viaRelay
            provenance=dict(request=request.model_dump(mode='json'),sources=sourceHashes,
                implementation={path.name:fileHash(path) for path in Path(__file__).parent.rglob('*.py')},
                site=asdict(site),sitePositionM=horizon.sitePositionM.tolist(),terrainConfig=asdict(HorizonConfig()),
                frame='MOON_ME_DE421',correction='NONE',earthDefinition='center',observerHeightM=0,
                epochEt=float(et[0]),
                sampleUtc=[spice.et2utc(float(value),'ISOC',6)+'Z' for value in et],
                endUtc=spice.et2utc(float(et[-1]+cadence),'ISOC',6)+'Z',
                minimumElevationDeg=0,execution='live geometry over precomputed trajectory',
                dynamics='saved two-body states, no new propagation',rfQualified=False,
                interval='half-open left-endpoint 120-second bins',validity='2025-01-01 through 2025-01-29 exclusive',
                tier='verified-replay',satellites=2,
                limitations=['Sampled connectivity','No operational RF qualification','Spherical relay-Earth occultation','Sampled terrain skyline'])
            if not verified:
                provenance.update(execution='live geometry over two-body propagated relay states',
                    dynamics='Two-body Moon-centered propagation of the verified Candidate 2 orbital elements, with extra satellites phased on the same orbit. No Earth third-body or lunar gravity harmonics.',
                    interval=f'half-open left-endpoint {cadence}-second bins',
                    validity='Any date inside the loaded SPICE kernel coverage. Accuracy is unvalidated away from January 2025.',
                    tier='propagated-two-body',satellites=request.satellites)
            result=dict(timesS=timesS.tolist(),directAvailable=direct.tolist(),viaRelayAvailable=viaRelay.tolist(),
                        assistedAvailable=assisted.tolist(),siteRelayAvailable=siteLeg.tolist(),relayEarthAvailable=earthLeg.tolist(),
                        direct=metrics(direct,timesS,cadence),assisted=metrics(assisted,timesS,cadence),
                        improvementFraction=float(assisted.mean()-direct.mean()),rfAvailability=None)
            return dict(schemaVersion='1.0',dataState='computed',result=result,provenance=provenance)
