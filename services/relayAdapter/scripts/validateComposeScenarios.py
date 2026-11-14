import json
import time
import urllib.request
from pathlib import Path

root=Path.cwd()
output=root/'results/composeComparisons'
output.mkdir(parents=True,exist_ok=True)

def longestBlackout(values):
    current=longest=0
    for value in values:
        current=0 if value else current+1
        longest=max(longest,current)
    return longest*120

rows=[]
for site in ['CR1','GR1','SR1']:
    for date in ['2025-01-06','2025-01-18','2025-01-28']:
        query=dict(siteId=site,startUtc=date+'T00:00:00Z',durationS=86400)
        request=urllib.request.Request('http://127.0.0.1:8080/api/relay-engineering/compare',data=json.dumps(query).encode(),headers={'Content-Type':'application/json'})
        start=time.perf_counter()
        with urllib.request.urlopen(request,timeout=110) as stream:
            response=json.load(stream)
        assert response['dataState']=='computed'
        result=response['relayScience']['result']
        assert result['timesS']==list(range(0,86400,120))
        direct=result['directAvailable']
        assisted=result['assistedAvailable']
        siteLeg=result['siteRelayAvailable']
        earthLeg=result['relayEarthAvailable']
        reconstructed=[direct[index] or any(siteLeg[relay][index] and earthLeg[relay][index] for relay in range(2)) for index in range(720)]
        assert assisted==reconstructed
        missionMargins=response['missionScience']['result']['bodies']['EARTH']['clearanceDeg']
        assert direct==[value>=0 for value in missionMargins[:-1]]
        for name,values in [('direct',direct),('assisted',assisted)]:
            assert response[name]['fraction']==sum(values)/len(values)
            assert response[name]['maximumBlackoutS']==longestBlackout(values)
        assert all(assisted)
        elapsed=time.perf_counter()-start
        (output/f'{site}-{date}.json').write_text(json.dumps(response))
        row=dict(site=site,date=date,wallS=elapsed,directFraction=response['direct']['fraction'],assistedFraction=response['assisted']['fraction'],directBlackoutS=response['direct']['maximumBlackoutS'],assistedBlackoutS=response['assisted']['maximumBlackoutS'],directParityMismatches=0,legCompositionMismatches=0)
        rows.append(row)
        print(json.dumps(row),flush=True)
        (output/'summary.json').write_text(json.dumps(rows,indent=2))
print('All nine Compose comparisons independently verified',flush=True)
