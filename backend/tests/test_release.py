"""Regression gates for the issues reproduced during final audit."""
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.db import SessionLocal
from app.main import app
from app.models import Application
from app.services import pipeline


def draft(client, ivan):
    r = client.post('/api/applications/draft', headers=ivan, json={'product_code': 'working_capital'})
    assert r.status_code == 200, r.text
    return r.json()


def test_demo_disabled_and_client_only(client, monkeypatch):
    monkeypatch.setattr(settings, 'demo_access_enabled', False)
    assert client.post('/api/auth/demo', json={}).status_code == 404
    monkeypatch.setattr(settings, 'demo_access_enabled', True)
    monkeypatch.setattr(settings, 'seed_demo', False)
    assert client.post('/api/auth/demo', json={}).status_code == 404
    monkeypatch.setattr(settings, 'seed_demo', True)
    r = client.post('/api/auth/demo', json={})
    assert r.status_code == 200 and r.json()['user']['role'] == 'client'
    h = {'Authorization': 'Bearer ' + r.json()['token']}
    assert client.get('/api/me', headers=h).json()['email'] == 'ivan@demo.ru'
    assert client.get('/api/bank/applications', headers=h).status_code == 403
    for body in [{'role': 'underwriter'}, {'email': 'risk@demo.ru'}, {'user_id': 5}]:
        assert client.post('/api/auth/demo', json=body).status_code == 422


@pytest.mark.parametrize('role', ['bank', 'operator', 'underwriter', 'admin'])
def test_cannot_self_register_bank(client, role):
    r = client.post('/api/auth/register', json={'name': 'Test User', 'email': f'{role}@release.test', 'password': 'test-password', 'role': role})
    assert r.status_code == 422


def test_register_logout_login_after_restart(client):
    body = {'name': 'Release User', 'email': 'Persist@Release.Test', 'password': 'persist-password'}
    r = client.post('/api/auth/register', json=body)
    assert r.status_code == 200
    with TestClient(app) as restarted:
        r = restarted.post('/api/auth/login', json={'email': 'persist@release.test', 'password': body['password']})
        assert r.status_code == 200
        h = {'Authorization': 'Bearer ' + r.json()['token']}
        assert restarted.get('/api/me', headers=h).json()['role'] == 'client'
        assert restarted.get('/api/applications', headers=h).json() == []


@pytest.mark.parametrize('patch', [{'amount': None}, {'term_months': None}, {'product_code': None}, {'has_collateral': None}, {'wizard_step': None}])
def test_required_patch_null_is_validation_error(client, ivan, patch):
    a = draft(client, ivan)
    assert client.patch(f"/api/applications/{a['id']}", headers=ivan, json=patch).status_code == 422


def test_bank_can_open_incomplete_draft(client, ivan, risk):
    a = draft(client, ivan)
    r = client.get(f"/api/bank/applications/{a['id']}", headers=risk)
    assert r.status_code == 200 and r.json()['company'] is None


def test_calculator_enforces_product_limits(client, ivan):
    for amount, term in [(99_000_000, 24), (1_000_000, 120), (299_999, 12)]:
        assert client.post('/api/calculator', headers=ivan, json={'product_code': 'working_capital', 'amount': amount, 'term_months': term}).status_code == 422
    assert client.post('/api/calculator', headers=ivan, json={'product_code': 'working_capital', 'amount': 300_000, 'term_months': 12}).status_code == 200
    assert client.post('/api/calculator', headers=ivan, json={'product_code': 'overdraft', 'amount': 300_000, 'term_months': 12}).status_code == 422


def test_answer_cannot_inject_negative_obligations(client, ivan):
    a = draft(client, ivan)
    aid = a['id']
    client.patch(f'/api/applications/{aid}', headers=ivan, json={'company_inn': '7804123453', 'purpose': 'Test', 'contact': {'name': 'Test', 'phone': '+7 900 000-00-00'}, 'financials': {'revenue_year': 60000000, 'net_profit_year': 9000000, 'monthly_turnover': 5000000}})
    for kind in ['tax_return', 'bank_statement']:
        client.post(f'/api/applications/{aid}/documents', headers=ivan, data={'kind': kind}, files={'file': (kind + '.pdf', b'%PDF-demo')})
    a = client.post(f'/api/applications/{aid}/submit', headers=ivan).json()
    rid = a['info_requests'][-1]['id']
    for value in [-100, 'NaN', 10**12]:
        r = client.post(f'/api/applications/{aid}/info-requests/{rid}/answer', headers=ivan, json={'fields': {'financials.monthly_obligations': value}})
        assert r.status_code == 422
    assert client.get(f'/api/applications/{aid}', headers=ivan).json()['financials'].get('monthly_obligations') is None


def test_completed_docs_locked(client, risk):
    a = client.get('/api/bank/applications/1', headers=risk).json()
    assert a['status'] == 'DISBURSED'
    assert not a['bank']['can_edit_docs']
    assert client.post(f"/api/bank/applications/1/documents/{a['documents'][0]['id']}/review", headers=risk, json={'status': 'rejected'}).status_code == 409


@pytest.mark.parametrize('sub', ['not-a-number', None])
def test_invalid_jwt_subject_is_401(client, sub):
    t = jwt.encode({'sub': sub, 'exp': datetime.now(timezone.utc) + timedelta(hours=1)}, settings.jwt_secret, algorithm='HS256')
    assert client.get('/api/me', headers={'Authorization': 'Bearer ' + t}).status_code == 401


def test_recover_interrupted_processing(client, ivan):
    a = draft(client, ivan)
    with SessionLocal() as db:
        row = db.get(Application, a['id'])
        # Simulates the last committed state when the process was interrupted.
        row.company_id = db.get(Application, 1).company_id
        row.status, row.processing = 'SUBMITTED', True
        db.commit()
    pipeline.recover_pending()
    a = client.get(f"/api/applications/{a['id']}", headers=ivan).json()
    assert a['status'] == 'NEEDS_INFO' and not a['processing']
    assert any(e['kind'] == 'recovery' for e in a['events'])


def test_weak_secret_rejected_in_production(monkeypatch):
    monkeypatch.setattr(settings, 'environment', 'production')
    monkeypatch.setattr(settings, 'jwt_secret', 'dev-only-secret')
    with pytest.raises(RuntimeError, match='JWT_SECRET'):
        settings.validate()
