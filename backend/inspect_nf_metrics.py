import asyncio
import json
from app.db import initialize
from app.services.scenarios import CATALOG, scenario_manager
from app.services.nf_metrics import nf_metrics
from app.services.performance import metrics_collector, performance_service
from app.models import UserPublic, Role

async def main():
    initialize()
    probe = await nf_metrics.probe(scenario_manager.adapter, CATALOG['5g-sa']['components'])
    print(json.dumps([{k: v for k, v in c.items() if k != 'metrics'} for c in probe['components']], indent=2))
    print('cli', probe['cli'])
    print('samples inserted', await metrics_collector.collect_once())
    catalog = await performance_service.catalog('5g-sa', UserPublic(username='docente',role=Role.teacher,testbed=None))
    print('catalog', len(catalog['counters']), [(o['id'],o.get('counter_count')) for o in catalog['objects'] if o['type']=='nf'])

asyncio.run(main())
