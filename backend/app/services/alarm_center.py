"""Persistent alarm episodes. A missing observation is never a recovery."""
import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone

from app.db import transaction

logger = logging.getLogger(__name__)
DEFAULT_RULE = {"severity": None, "masked": False, "silenced_until": 0, "raise_seconds": 0, "clear_seconds": 0}


def stamp(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat()


def initialize_alarms():
    with transaction() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS alarm_episodes (
          id TEXT PRIMARY KEY, testbed TEXT NOT NULL, scenario TEXT NOT NULL,
          condition_key TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL,
          first_seen REAL NOT NULL, last_seen REAL NOT NULL, cleared_at REAL,
          acknowledged_by TEXT, acknowledged_at REAL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS alarm_one_active ON alarm_episodes(testbed,scenario,condition_key) WHERE state='active';
        CREATE INDEX IF NOT EXISTS alarm_scope_time ON alarm_episodes(testbed,scenario,first_seen);
        CREATE TABLE IF NOT EXISTS alarm_rules (
          testbed TEXT NOT NULL, scenario TEXT NOT NULL, condition_key TEXT NOT NULL,
          settings TEXT NOT NULL, modified_by TEXT NOT NULL, modified_at REAL NOT NULL,
          PRIMARY KEY(testbed,scenario,condition_key)
        );
        CREATE TABLE IF NOT EXISTS alarm_conditions (
          testbed TEXT NOT NULL, scenario TEXT NOT NULL, condition_key TEXT NOT NULL,
          payload TEXT NOT NULL, bad_since REAL, good_since REAL, checked_at REAL,
          PRIMARY KEY(testbed,scenario,condition_key)
        );
        CREATE TABLE IF NOT EXISTS alarm_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT, testbed TEXT NOT NULL, scenario TEXT NOT NULL,
          episode_id TEXT, condition_key TEXT NOT NULL, at REAL NOT NULL,
          action TEXT NOT NULL, actor TEXT NOT NULL, detail TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS alarm_event_episode ON alarm_events(episode_id,id);
        CREATE TABLE IF NOT EXISTS alarm_observer (
          testbed TEXT NOT NULL, scenario TEXT NOT NULL, attempted_at REAL,
          succeeded_at REAL, error TEXT, PRIMARY KEY(testbed,scenario)
        );
        ''')


def event(db, scope, scenario, key, episode, action, actor, detail, now):
    db.execute('INSERT INTO alarm_events(testbed,scenario,condition_key,episode_id,at,action,actor,detail) VALUES(?,?,?,?,?,?,?,?)',
               (scope, scenario, key, episode, now, action, actor, detail))


def ingest(scope, scenario, alarms, evaluated, now=None):
    now = time.time() if now is None else now
    incoming = {a['id']: a for a in alarms}
    with transaction() as db:
        db.execute('BEGIN IMMEDIATE')
        for key in evaluated | incoming.keys():
            previous = db.execute('SELECT * FROM alarm_conditions WHERE testbed=? AND scenario=? AND condition_key=?', (scope, scenario, key)).fetchone()
            alarm = incoming.get(key)
            if not previous and not alarm:
                continue
            rule_row = db.execute('SELECT settings FROM alarm_rules WHERE testbed=? AND scenario=? AND condition_key=?', (scope, scenario, key)).fetchone()
            rule = {**DEFAULT_RULE, **(json.loads(rule_row[0]) if rule_row else {})}
            active = db.execute("SELECT * FROM alarm_episodes WHERE testbed=? AND scenario=? AND condition_key=? AND state='active'", (scope, scenario, key)).fetchone()
            # Continuity breaks after an observation gap; timers do not count downtime.
            continuous = previous and previous['checked_at'] is not None and now - previous['checked_at'] <= 60
            bad_since = (previous['bad_since'] if continuous and previous['bad_since'] is not None else now) if alarm else None
            good_since = (previous['good_since'] if continuous and previous['good_since'] is not None else now) if not alarm else None
            payload = json.dumps(alarm, ensure_ascii=False) if alarm else previous['payload']
            db.execute('INSERT OR REPLACE INTO alarm_conditions VALUES(?,?,?,?,?,?,?)', (scope, scenario, key, payload, bad_since, good_since, now))
            if alarm and active:
                db.execute('UPDATE alarm_episodes SET last_seen=?,payload=? WHERE id=?', (now, payload, active['id']))
            elif alarm and now - bad_since >= rule['raise_seconds']:
                episode = str(uuid.uuid4())
                db.execute("INSERT INTO alarm_episodes VALUES(?,?,?,?,?,'active',?,?,NULL,NULL,NULL)", (episode, scope, scenario, key, payload, bad_since, now))
                event(db, scope, scenario, key, episode, 'opened', 'collector', 'Condición detectada', now)
            elif not alarm and active and now - good_since >= rule['clear_seconds']:
                db.execute("UPDATE alarm_episodes SET state='cleared',cleared_at=? WHERE id=?", (now, active['id']))
                event(db, scope, scenario, key, active['id'], 'cleared', 'collector', 'Recuperación observada', now)
        # Unknown domains must restart debounce; never clear their active episodes.
        for row in db.execute('SELECT condition_key FROM alarm_conditions WHERE testbed=? AND scenario=?', (scope, scenario)).fetchall():
            if row[0] not in evaluated and row[0] not in incoming:
                db.execute('UPDATE alarm_conditions SET bad_since=NULL,good_since=NULL,checked_at=NULL WHERE testbed=? AND scenario=? AND condition_key=?', (scope, scenario, row[0]))
        db.execute('INSERT INTO alarm_observer VALUES(?,?,?,?,NULL) ON CONFLICT(testbed,scenario) DO UPDATE SET attempted_at=excluded.attempted_at,succeeded_at=excluded.succeeded_at,error=NULL', (scope, scenario, now, now))


def observe_error(scope, scenario):
    with transaction() as db:
        db.execute("INSERT INTO alarm_observer VALUES(?,?,?,NULL,?) ON CONFLICT(testbed,scenario) DO UPDATE SET attempted_at=excluded.attempted_at,error=excluded.error", (scope, scenario, time.time(), 'No se pudo completar la observación del testbed.'))
        db.execute('UPDATE alarm_conditions SET bad_since=NULL,good_since=NULL,checked_at=NULL WHERE testbed=? AND scenario=?', (scope, scenario))


def list_alarms(scope, scenario, *, view='active', search='', component='', severity='', ack='', visibility='all', state='', start=None, end=None, page=1, size=25):
    now = time.time()
    where = ['e.testbed=?', 'e.scenario=?']
    params = [scope, scenario]
    if view != 'history':
        where.append("e.state='active'")
    elif state in {'active', 'cleared'}:
        where.append('e.state=?'); params.append(state)
    if search:
        where.append("(e.condition_key LIKE ? ESCAPE '\\' OR json_extract(e.payload,'$.message') LIKE ? ESCAPE '\\')")
        safe = search.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        params.extend(['%' + safe + '%'] * 2)
    if component:
        where.append("json_extract(e.payload,'$.component')=?")
        params.append(component)
    if severity:
        where.append("COALESCE(json_extract(r.settings,'$.severity'),json_extract(e.payload,'$.severity'))=?")
        params.append(severity)
    if ack in {'yes', 'no'}:
        where.append('e.acknowledged_at IS ' + ('NOT NULL' if ack == 'yes' else 'NULL'))
    if visibility == 'visible':
        where.append("COALESCE(json_extract(r.settings,'$.masked'),0)=0")
    elif visibility == 'masked':
        where.append("json_extract(r.settings,'$.masked')=1")
    elif visibility == 'silenced':
        where.append("json_extract(r.settings,'$.silenced_until')>?")
        params.append(now)
    if start is not None:
        where.append('e.first_seen>=?'); params.append(start)
    if end is not None:
        where.append('e.first_seen<=?'); params.append(end)
    base = ' FROM alarm_episodes e LEFT JOIN alarm_rules r ON r.testbed=e.testbed AND r.scenario=e.scenario AND r.condition_key=e.condition_key WHERE ' + ' AND '.join(where)
    with transaction() as db:
        total = db.execute('SELECT COUNT(*)' + base, params).fetchone()[0]
        rows = db.execute('SELECT e.*,r.settings' + base + ' ORDER BY e.first_seen DESC,e.id LIMIT ? OFFSET ?', [*params, size, (page - 1) * size]).fetchall()
        observer = db.execute('SELECT * FROM alarm_observer WHERE testbed=? AND scenario=?', (scope, scenario)).fetchone()
        counts = {r['severity']: r['n'] for r in db.execute("SELECT COALESCE(json_extract(r.settings,'$.severity'),json_extract(e.payload,'$.severity')) severity, COUNT(*) n FROM alarm_episodes e LEFT JOIN alarm_rules r ON r.testbed=e.testbed AND r.scenario=e.scenario AND r.condition_key=e.condition_key WHERE e.testbed=? AND e.scenario=? AND e.state='active' GROUP BY severity", (scope, scenario))}
        items = []
        for row in rows:
            rule = {**DEFAULT_RULE, **(json.loads(row['settings']) if row['settings'] else {})}
            payload = json.loads(row['payload'])
            checked = db.execute('SELECT checked_at FROM alarm_conditions WHERE testbed=? AND scenario=? AND condition_key=?', (scope, scenario, row['condition_key'])).fetchone()
            items.append({**payload, **{k: row[k] for k in ('id','state','condition_key','first_seen','last_seen','cleared_at','acknowledged_by','acknowledged_at')},
                          'original_severity': payload['severity'], 'severity': rule['severity'] or payload['severity'],
                          'masked': rule['masked'], 'silenced_until': rule['silenced_until'],
                          'stale': row['state'] == 'active' and (not checked or checked[0] is None or now - checked[0] > 60),
                          'duration_seconds': max(0, (row['cleared_at'] or now) - row['first_seen'])})
    health = dict(observer) if observer else {'succeeded_at': None, 'error': None}
    health['stale'] = not health['succeeded_at'] or now - health['succeeded_at'] > 60 or bool(health['error'])
    return {'items': items, 'total': total, 'page': page, 'size': size, 'counts': {**dict.fromkeys(('critical','major','minor','warning'), 0), **counts}, 'observer': health}


def rules(scope, scenario):
    with transaction() as db:
        rows = db.execute('SELECT c.*, r.settings, r.modified_by,r.modified_at FROM alarm_conditions c LEFT JOIN alarm_rules r ON r.testbed=c.testbed AND r.scenario=c.scenario AND r.condition_key=c.condition_key WHERE c.testbed=? AND c.scenario=? ORDER BY c.condition_key', (scope, scenario)).fetchall()
        return [{**json.loads(row['payload']), 'condition_key': row['condition_key'], 'settings': {**DEFAULT_RULE, **(json.loads(row['settings']) if row['settings'] else {})}, 'modified_by': row['modified_by'], 'modified_at': row['modified_at']} for row in rows]


def save_rule(scope, scenario, key, settings, actor, reason):
    now = time.time()
    with transaction() as db:
        db.execute('BEGIN IMMEDIATE')
        if not db.execute('SELECT 1 FROM alarm_conditions WHERE testbed=? AND scenario=? AND condition_key=?', (scope, scenario, key)).fetchone():
            raise KeyError(key)
        old = db.execute('SELECT settings FROM alarm_rules WHERE testbed=? AND scenario=? AND condition_key=?', (scope, scenario, key)).fetchone()
        db.execute('INSERT OR REPLACE INTO alarm_rules VALUES(?,?,?,?,?,?)', (scope, scenario, key, json.dumps(settings), actor, now))
        event(db, scope, scenario, key, None, 'rule_changed', actor, json.dumps({'before': json.loads(old[0]) if old else DEFAULT_RULE, 'after': settings, 'reason': reason}, ensure_ascii=False), now)


def action(scope, scenario, ids, operation, actor, note):
    now = time.time()
    with transaction() as db:
        db.execute('BEGIN IMMEDIATE')
        records = []
        for episode in dict.fromkeys(ids):
            row = db.execute('SELECT * FROM alarm_episodes WHERE id=? AND testbed=? AND scenario=?', (episode, scope, scenario)).fetchone()
            if not row:
                raise KeyError(episode)
            records.append(row)
        for row in records:
            if operation == 'acknowledge':
                if row['acknowledged_at'] is not None: continue
                db.execute('UPDATE alarm_episodes SET acknowledged_by=?,acknowledged_at=? WHERE id=?', (actor, now, row['id']))
            elif operation == 'unacknowledge':
                if row['acknowledged_at'] is None: continue
                db.execute('UPDATE alarm_episodes SET acknowledged_by=NULL,acknowledged_at=NULL WHERE id=?', (row['id'],))
            event(db, scope, scenario, row['condition_key'], row['id'], operation, actor, note, now)


def timeline(scope, scenario, episode):
    with transaction() as db:
        row = db.execute('SELECT condition_key FROM alarm_episodes WHERE id=? AND testbed=? AND scenario=?', (episode, scope, scenario)).fetchone()
        if not row: raise KeyError(episode)
        return [dict(item) for item in db.execute('SELECT at,action,actor,detail FROM alarm_events WHERE testbed=? AND scenario=? AND (episode_id=? OR (episode_id IS NULL AND condition_key=?)) ORDER BY id DESC LIMIT 200', (scope, scenario, episode, row[0]))]


class AlarmObserver:
    def __init__(self):
        self.task = None

    async def start(self):
        initialize_alarms()
        seed_catalog()
        self.task = asyncio.create_task(self.run())

    async def stop(self):
        if self.task:
            self.task.cancel()
            try: await self.task
            except asyncio.CancelledError: pass
            self.task = None

    async def run(self):
        from app.services.observability import collect_alarms
        from app.services.scenarios import CATALOG
        while True:
            for scenario in CATALOG:
                try:
                    evaluated = set()
                    snapshot = await asyncio.wait_for(collect_alarms(scenario, evaluated), timeout=40)
                    ingest('local', scenario, snapshot, evaluated)
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.warning('Alarm observation unavailable for %s', scenario)
                    observe_error('local', scenario)
            await asyncio.sleep(15)


alarm_observer = AlarmObserver()


def seed_catalog():
    from app.services.scenarios import CATALOG
    with transaction() as db:
        for scenario, config in CATALOG.items():
            for component in config['components']:
                base = {'scenario_id': scenario, 'component': component['id'], 'network_function': component['label'],
                        'node_id': component['node_id'], 'interfaces': component.get('interfaces', []),
                        'procedures': component.get('procedures', []), 'evidence': '', 'recommendation': '', 'probable_cause': 'serviceUnavailable'}
                definitions = [(f"{scenario}:{component['id']}:service-down", f"{component['label']} no está activo", 'critical' if component['kind'] in {'core', 'database'} else 'major')]
                for endpoint in component.get('expected_endpoints', []):
                    definitions.append((f"{scenario}:{component['id']}:port:{endpoint['protocol']}:{endpoint['port']}", f"Endpoint {endpoint.get('interface', '')} de {component['label']} no está en escucha", 'major'))
                if component['id'] == 'upf':
                    definitions.append((f'{scenario}:ops-f01:forwarding-disabled', 'Reenvío IPv4 deshabilitado', 'critical'))
                for key, message, severity in definitions:
                    payload = json.dumps({**base, 'id': key, 'message': message, 'severity': severity}, ensure_ascii=False)
                    db.execute('INSERT OR IGNORE INTO alarm_conditions VALUES(?,?,?,?,NULL,NULL,NULL)', ('local', scenario, key, payload))
