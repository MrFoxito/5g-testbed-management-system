import time
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import db
from app.api.deps import current_user
from app.api.v1.endpoints.alarm_center import router
from app.models import UserPublic
from app.services import alarm_center as center


@pytest.fixture(autouse=True)
def database(tmp_path, monkeypatch):
    monkeypatch.setattr(db, 'get_settings', lambda: SimpleNamespace(database_path=tmp_path / 'alarms.db'))
    center.initialize_alarms()


def alarm(key='5g-sa:amf:service-down'):
    return dict(id=key, component='amf', network_function='AMF', node_id='vm', severity='critical', message='AMF no está activo', evidence='unit stopped', interfaces=['N2'], procedures=['Registration'], probable_cause='serviceUnavailable', recommendation='Revisar servicio')


def listing(**kwargs):
    return center.list_alarms('local', '5g-sa', **kwargs)


def test_persistent_episode_dedup_ack_recovery_recurrence():
    a = alarm(); t = time.time()
    center.ingest('local','5g-sa',[a],{a['id']},t)
    episode = listing()['items'][0]['id']
    center.action('local','5g-sa',[episode],'acknowledge','docente','')
    center.ingest('local','5g-sa',[a],{a['id']},t+15)
    center.initialize_alarms()  # restart/migration preserves data
    item = listing()['items'][0]
    assert item['id'] == episode and item['first_seen'] == t and item['last_seen'] == t+15
    assert item['acknowledged_by'] == 'docente'
    center.ingest('local','5g-sa',[],{a['id']},t+30)
    assert listing()['total'] == 0
    assert listing(view='history')['items'][0]['cleared_at'] == t+30
    center.ingest('local','5g-sa',[a],{a['id']},t+45)
    assert listing()['items'][0]['id'] != episode
    assert listing()['items'][0]['acknowledged_by'] is None
    assert listing(view='history')['total'] == 2


def test_unknown_and_unreachable_do_not_recover():
    a=alarm()
    center.ingest('local','5g-sa',[a],{a['id']})
    center.ingest('local','5g-sa',[],set())
    assert listing()['items'][0]['stale']
    center.observe_error('local','5g-sa')
    assert listing()['observer']['stale']
    assert listing()['total'] == 1


def test_mask_silence_severity_and_audit_do_not_remove_history():
    a=alarm()
    center.ingest('local','5g-sa',[a],{a['id']})
    center.save_rule('local','5g-sa',a['id'],{**center.DEFAULT_RULE,'masked':True,'severity':'warning','silenced_until':time.time()+60},'docente','Mantenimiento')
    assert listing(visibility='visible')['total'] == 0
    assert listing(visibility='masked')['total'] == 1
    item=listing(view='history')['items'][0]
    assert item['state']=='active' and item['original_severity']=='critical' and item['severity']=='warning'
    assert any(e['action']=='rule_changed' for e in center.timeline('local','5g-sa',item['id']))
    assert listing(visibility='silenced')['total']==1
    center.save_rule('local','5g-sa',a['id'],center.DEFAULT_RULE,'docente','Restaurar')
    assert listing(visibility='visible')['total']==1


def test_debounce_and_recovery_stability_with_unknown_reset():
    a=alarm();t=time.time()
    center.ingest('local','5g-sa',[a],{a['id']},t)
    center.ingest('local','5g-sa',[],{a['id']},t+1)
    center.save_rule('local','5g-sa',a['id'],{**center.DEFAULT_RULE,'raise_seconds':30,'clear_seconds':30},'docente','Prueba')
    center.ingest('local','5g-sa',[a],{a['id']},t+5)
    center.ingest('local','5g-sa',[a],{a['id']},t+20)
    assert listing()['total']==0
    center.ingest('local','5g-sa',[a],{a['id']},t+35)
    assert listing()['total']==1
    center.ingest('local','5g-sa',[],{a['id']},t+40)
    center.ingest('local','5g-sa',[],set(),t+50)
    center.ingest('local','5g-sa',[],{a['id']},t+75)
    assert listing()['total']==1  # unknown interval cannot count as healthy
    center.ingest('local','5g-sa',[],{a['id']},t+105)
    assert listing()['total']==0


def test_cross_scope_and_batch_actions_atomic():
    a=alarm();center.ingest('local','5g-sa',[a],{a['id']})
    episode=listing()['items'][0]['id']
    with pytest.raises(KeyError): center.action('other','5g-sa',[episode],'acknowledge','teacher','')
    with pytest.raises(KeyError): center.action('local','5g-sa',[episode,'missing'],'acknowledge','teacher','')
    assert listing()['items'][0]['acknowledged_by'] is None
    assert center.list_alarms('other','5g-sa')['total']==0


def test_api_permissions_filters_export_and_comments():
    app=FastAPI();app.include_router(router)
    user=UserPublic(username='student',role='student',testbed='local')
    app.dependency_overrides[current_user]=lambda:user
    a=alarm();center.ingest('local','5g-sa',[a],{a['id']})
    episode=listing()['items'][0]['id']
    with TestClient(app) as client:
        assert client.get('/alarm-center/5g-sa').status_code==200
        payload={'ids':[episode],'action':'comment','note':'Revisado'}
        assert client.post('/alarm-center/5g-sa/actions',json=payload).status_code==403
        user=UserPublic(username='teacher',role='teacher',testbed='local')
        assert client.post('/alarm-center/5g-sa/actions',json=payload).status_code==200
        assert client.get('/alarm-center/5g-sa?search=AMF').json()['total']==1
        assert client.get('/alarm-center/5g-sa?search=%25').json()['total']==0
        assert client.get('/alarm-center/5g-sa?start=100&end=10').status_code==422
        assert 'AMF' in client.get('/alarm-center/5g-sa/export').text
        assert client.get('/alarm-center/5g-sa/events/'+episode).json()[0]['action']=='comment'
        user=UserPublic(username='teacher',role='teacher',testbed='other')
        assert client.get('/alarm-center/5g-sa').status_code==403


def test_pagination_and_state_filter():
    for index in range(30):
        a=alarm(f'5g-sa:amf:condition-{index}')
        center.ingest('local','5g-sa',[a],set())
    assert len(listing()['items'])==25
    assert len(listing(page=2)['items'])==5
    assert listing(view='history',state='cleared')['total']==0


def test_gap_does_not_satisfy_debounce():
    a=alarm();t=time.time()
    center.ingest('local','5g-sa',[a],{a['id']},t)
    center.save_rule('local','5g-sa',a['id'],{**center.DEFAULT_RULE,'clear_seconds':30},'docente','Prueba')
    center.ingest('local','5g-sa',[],{a['id']},t+5)
    center.ingest('local','5g-sa',[],{a['id']},t+100)
    assert listing()['total']==1
