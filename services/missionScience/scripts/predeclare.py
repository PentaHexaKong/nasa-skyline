import json
from pathlib import Path
plan=dict(version='1.0',hypothesis='Schedule-robust selection may reduce held-out constraint violations. No assumed superiority.',
          sites=['CR1','GR1','SR1'],selectionDates=['2025-01-01','2025-01-08','2025-01-15','2025-01-22'],
          durationS=86400,selectionCadenceS=3600,evaluationCadenceS=1800,
          selectionDelays=[0,7,14,30],heldOutDelays=[3,10,21,45],
          constraints=dict(minimumSolar=.5,minimumEarth=.25,maximumSolarOutageS=43200,maximumEarthOutageS=43200),
          profile='geometric',solarDefinition='anyDisk',earthDefinition='center',
          tieRule='Baseline A selects input-first maximum nominal solar. Baseline B selects input-first nominal Pareto entry. Robust selects input-first robust-feasible Pareto entry.',
          endpoints=['held-out feasible fraction','held-out violation frequency','maximum Earth outage','maximum solar deficit'],
          emptySelection='Report no selection and no performance estimate. Do not assign perfect performance.',
          benchmark=dict(count=100,durationS=14400,cadenceS=3600,sites=['CR1','GR1','SR1']),
          stopRule='Fixed grid, no tuning after held-out outcomes')
Path('experiments/broadPlan.json').write_text(json.dumps(plan,indent=2))
