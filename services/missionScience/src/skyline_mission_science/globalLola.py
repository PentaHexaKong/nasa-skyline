"""Label-validated global LOLA grid for explicitly coarse exploratory horizons."""
from pathlib import Path
import re
import numpy as np
from pyproj import CRS

from .terrainHorizon import LUNAR_RADIUS_M, TerrainCoverageError, unitVector, azimuthElevation

sourceBase = 'https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG/'


class GlobalLolaDem:
    def __init__(self, path):
        self.path = Path(path).with_suffix('.IMG')
        self.labelPath = self.path.with_suffix('.LBL')
        if not self.path.is_file() or not self.labelPath.is_file():
            raise TerrainCoverageError('Global LOLA requires both LDEM_16.IMG and LDEM_16.LBL')
        text = self.labelPath.read_text(encoding='ascii').replace('\r', '')
        def number(name):
            match = re.search(r'\b'+name+r'\s*=\s*([-+0-9.]+)', text)
            if match is None:
                raise TerrainCoverageError('Missing global LOLA label field '+name)
            return float(match.group(1))
        for token in ['MEAN EARTH/POLAR AXIS OF DE421', 'SIMPLE CYLINDRICAL', 'LSB_INTEGER',
                      'LRO-L-LOLA-4-GDR-V1.0', '"LDEM_16"', '"V3.1"', '"EAST"']:
            if token not in text:
                raise TerrainCoverageError('Unreconciled global LOLA frame, datum or product identity')
        if not re.search(r'\bUNIT\s*=\s*METER\b', text):
            raise TerrainCoverageError('Global LOLA heights require meter units')
        expected = dict(A_AXIS_RADIUS=1737.4, B_AXIS_RADIUS=1737.4, C_AXIS_RADIUS=1737.4,
                        MAXIMUM_LATITUDE=90, MINIMUM_LATITUDE=-90, WESTERNMOST_LONGITUDE=0, EASTERNMOST_LONGITUDE=360, LINES=2880, LINE_SAMPLES=5760, SAMPLE_BITS=16, SCALING_FACTOR=.5,
                        OFFSET=1737400, MAP_RESOLUTION=16, CENTER_LONGITUDE=180,
                        LINE_PROJECTION_OFFSET=1439.5, SAMPLE_PROJECTION_OFFSET=2879.5)
        if any(number(key) != value for key, value in expected.items()) or self.path.stat().st_size != 2880*5760*2:
            raise TerrainCoverageError('Unsupported global LOLA pixel registration or binary layout')
        self.minimum, self.maximum = number('MINIMUM'), number('MAXIMUM')
        self.data = np.memmap(self.path, mode='r', dtype='<i2', shape=(2880,5760))

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.data._mmap.close()

    def metadata(self):
        radius = LUNAR_RADIUS_M
        return dict(frame='MOON_ME_DE421', radialReferenceM=radius,
                    resolutionM=[radius*np.pi/2880]*2,
                    boundsM=[-np.pi*radius, -np.pi*radius/2, np.pi*radius, np.pi*radius/2],
                    crsWkt=CRS.from_proj4('+proj=eqc +lat_ts=0 +lon_0=180 +R=1737400 +units=m').to_wkt(),
                    sourceUrl=sourceBase+self.path.name, heightDatum='radial meters above 1737400 m sphere',
                    registration='PDS pixel centers; 16 pixels per degree',
                    quality='coarse exploratory global terrain; unresolved subpixel topography',
                    longitudeSpacing='equatorial nominal spacing; local spacing scales with cosine latitude')

    def heights(self, latitudeDeg, longitudeDeg):
        lat, lon = np.broadcast_arrays(latitudeDeg, longitudeDeg)
        if np.any(~np.isfinite(lat)) or np.any(~np.isfinite(lon)):
            raise TerrainCoverageError('Nonfinite global terrain coordinate')
        rows = (90-lat)*16-.5
        columns = np.mod(lon,360)*16-.5
        top, left = np.floor(rows).astype(int), np.floor(columns).astype(int)
        if np.any((top<0)|(top+1>=2880)):
            raise TerrainCoverageError('Global LOLA bilinear footprint exceeds polar coverage')
        y, x = rows-top, columns-left
        values = np.zeros(lat.shape)
        for dy,dx,weight in [(0,0,(1-y)*(1-x)),(0,1,(1-y)*x),(1,0,y*(1-x)),(1,1,y*x)]:
            sample = self.data[top+dy,(left+dx)%5760]
            if np.any((sample<self.minimum)|(sample>self.maximum)):
                raise TerrainCoverageError('NoData/invalid DN in required global LOLA interpolation cells')
            values += sample*weight
        return values*.5

    def accumulateHorizon(self, site, position, basis, innerM, outerM, horizon, config):
        theta = outerM/LUNAR_RADIUS_M
        latitude = np.radians(site.latitudeDeg)
        if abs(latitude)+theta >= np.pi/2-np.radians(1/32):
            raise TerrainCoverageError('Global exploratory search cap reaches unsupported polar interpolation edge')
        deltaLon = np.degrees(np.arcsin(np.sin(theta)/np.cos(latitude)))
        deltaLat = np.degrees(theta)
        firstRow = max(0,int(np.floor((90-site.latitudeDeg-deltaLat)*16-.5)))
        lastRow = min(2879,int(np.ceil((90-site.latitudeDeg+deltaLat)*16-.5)))
        columns = np.arange(int(np.floor((site.longitudeDeg-deltaLon)*16-.5)),
                            int(np.ceil((site.longitudeDeg+deltaLon)*16-.5))+1)%5760
        count = 0
        for start in range(firstRow,lastRow+1,64):
            rows = np.arange(start,min(start+64,lastRow+1))
            lon,lat = np.meshgrid((columns+.5)/16,90-(rows+.5)/16)
            units = unitVector(lat,lon)
            arc = np.arccos(np.clip(units@basis[2],-1,1))*LUNAR_RADIUS_M
            keep = (arc>=innerM)&(arc<=outerM)
            if not np.any(keep):
                continue
            samples = np.asarray(self.data[np.ix_(rows,columns)])[keep]
            if np.any((samples<self.minimum)|(samples>self.maximum)):
                raise TerrainCoverageError('NoData/invalid DN in required global terrain search cells')
            heights = samples*.5
            if np.any(np.abs(heights)>config.globalMaxHeightM):
                raise TerrainCoverageError('Global terrain exceeds declared height envelope')
            directions = units[keep]*(LUNAR_RADIUS_M+heights[:,None])-position
            azimuth,elevation = azimuthElevation(directions,basis)
            indices = np.floor(azimuth/config.azimuthStepDeg).astype(int)%len(horizon)
            np.maximum.at(horizon,indices,elevation)
            count += int(keep.sum())
        return count
