"""Адаптер локальной модели: вырезание <think>, JSON по схеме, маскирование, бюджет, таймаут, журнал ai_calls."""
import json

import httpx
import pytest
from sqlalchemy import select

from app.ai.llm import extract_json, llm, mask_pii, strip_think
from app.config import settings
from app.db import SessionLocal
from app.models import AiCall, IntakeSession, User


def fake_model(content: str | None = None, *, delay_exc: Exception | None = None, seen: list | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if seen is not None:
            seen.append(body)
        if delay_exc:
            raise delay_exc
        return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": content}}]})
    return httpx.MockTransport(handler)


@pytest.fixture
def llm_on():
    settings.llm_enabled = True
    yield
    settings.llm_enabled = False
    llm.set_transport(None)


def _session(db):
    u = db.scalar(select(User).where(User.email == "ivan@demo.ru"))
    s = IntakeSession(owner_id=u.id, text="t")
    db.add(s)
    db.flush()
    return s


def test_strip_think_and_extract_json():
    raw = '<think>рассуждаю {"field":"x"}</think>\n```json\n{"field": "amount", "question": "Сколько?"}\n```'
    assert extract_json(raw) == {"field": "amount", "question": "Сколько?"}
    assert strip_think("до <think>без конца") == "до "
    assert extract_json("нет json") is None and extract_json("[1,2]") is None


def test_mask_pii():
    t = mask_pii("ИНН 7804123453, тел. +7 (900) 111-22-33, Иванов Пётр Сергеевич, a@b.ru, ИП Волков Андрей, нужно 1500000")
    for leak in ("7804123453", "111-22-33", "Иванов", "a@b.ru", "Волков"):
        assert leak not in t
    assert "1500000" in t  # суммы не трогаем


def test_disabled_by_default_returns_none(client):
    assert settings.llm_enabled is False
    with SessionLocal() as db:
        assert llm.complete_json(db, purpose="question", user="x", validate=lambda d: d) is None


def test_valid_answer_masked_and_logged(client, llm_on):
    seen = []
    llm.set_transport(fake_model('<think>…</think>{"ok": 1}', seen=seen))
    with SessionLocal() as db:
        s = _session(db)
        out = llm.complete_json(db, purpose="question", user="Звоните +7 900 111 22 33", validate=lambda d: d, session=s)
        assert out == {"ok": 1} and s.ai_calls_used == 1
        assert "111 22 33" not in seen[0]["messages"][1]["content"]
        assert seen[0]["messages"][0]["role"] == "system" and seen[0]["model"] == settings.llm_model
        db.flush()
        assert db.scalar(select(AiCall.status).where(AiCall.session_id == s.id)) == "ok"
        db.rollback()


def test_budget_timeout_and_invalid(client, llm_on):
    with SessionLocal() as db:
        s = _session(db)
        llm.set_transport(fake_model(delay_exc=httpx.ReadTimeout("slow")))
        assert llm.complete_json(db, purpose="q1", user="a", validate=lambda d: d, session=s) is None
        llm.set_transport(fake_model('{"field": "inn"}'))

        def only_amount(d):
            if d.get("field") != "amount":
                raise ValueError("поле не из белого списка")
            return d
        assert llm.complete_json(db, purpose="q2", user="b", validate=only_amount, session=s) is None
        llm.set_transport(fake_model('{"field": "amount"}'))
        assert llm.complete_json(db, purpose="q3", user="c", validate=only_amount, session=s) == {"field": "amount"}
        assert s.ai_calls_used == settings.llm_max_calls == 3
        assert llm.complete_json(db, purpose="q4", user="d", validate=lambda d: d, session=s) is None  # бюджет исчерпан
        db.flush()
        statuses = db.scalars(select(AiCall.status).where(AiCall.session_id == s.id).order_by(AiCall.id)).all()
        assert statuses == ["timeout", "invalid", "ok"]
        db.rollback()


def test_catalog_loaded_and_frontend_copy_in_sync(client):
    from pathlib import Path

    from app.catalog import DATA_DIR
    from app.models import CatalogItem
    with SessionLocal() as db:
        kinds = db.scalars(select(CatalogItem.kind)).all()
    assert kinds.count("product") == 4 and kinds.count("field") >= 6
    fe = Path(__file__).resolve().parents[2] / "frontend" / "src" / "config"
    if fe.exists():
        for name in ("products.json", "fields.json"):
            assert json.loads((fe / name).read_text()) == json.loads((DATA_DIR / name).read_text()), name


def test_openapi_file_in_sync_with_app(client):
    """docs/openapi.json выгружается скриптом scripts/export_docs.py — тест ловит забытую выгрузку."""
    from pathlib import Path

    from app.main import app
    f = Path(__file__).resolve().parents[2] / "docs" / "openapi.json"
    if f.exists():
        assert set(json.loads(f.read_text())["paths"]) == set(app.openapi()["paths"]), "запустите: PYTHONPATH=. python scripts/export_docs.py"
