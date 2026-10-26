"""API квиза: опишите задачу → вопросы карточками → портрет → подбор → черновик заявки."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import serializers as ser
from ..catalog import field_registry
from ..config import settings
from ..db import get_db
from ..intake import engine
from ..intake.recommend import recommend as do_recommend
from ..models import Application, IntakeSession, User
from ..products import PRODUCTS
from ..security import client_only
from ..services.workflow import log

router = APIRouter(prefix="/api/intake", tags=["intake"])


class StartIn(BaseModel):
    text: str = Field(default="", max_length=1000)


class AnswerIn(BaseModel):
    field: str
    value: str | int | float


class ApplyIn(BaseModel):
    product_code: str


def _get(db: Session, u: User, sid: int) -> IntakeSession:
    s = db.get(IntakeSession, sid)
    if not s or s.owner_id != u.id:
        raise HTTPException(404, "Сессия не найдена")
    return s


def session_dict(s: IntakeSession) -> dict:
    t = engine.open_turn(s)
    reg = field_registry()
    answered = sum(1 for x in s.turns if x.answer is not None and x.kind != "edit")
    left = 0 if s.status != "questions" else len(engine.missing_fields(s)) or (1 if t else 0)
    q = None
    if t is not None:
        f = reg[t.field]
        q = {"turn_id": t.id, "field": t.field, "kind": t.kind, "text": t.question, "hint": t.hint, "options": t.options,
             "custom": f["question"].get("custom"), "type": f["type"], "min": f.get("min"), "max": f.get("max"),
             "source": t.source, "simulated": False}
    return {
        "id": s.id, "text": s.text, "status": s.status, "question": q,
        "known": {k: {"value": v, "label": engine.option_label(k, v),
                      "source": "answer" if k in s.answers else s.extracted.get(k, {}).get("source", "text")}
                  for k, v in engine.known(s).items()},
        "progress": {"done": answered, "total": answered + max(left, 1 if t else 0)},
        "portrait": s.portrait or None, "recommendations": s.recommendations or None, "application_id": s.application_id,
        "ai": {"enabled": settings.llm_enabled, "calls_used": s.ai_calls_used, "max_calls": settings.llm_max_calls},
        "history": [{"field": x.field, "kind": x.kind, "question": x.question, "source": x.source,
                     "answer": x.answer["label"] if x.answer else None} for x in s.turns if x.answer is not None],
    }


@router.post("/start")
def start(body: StartIn, u: User = Depends(client_only), db: Session = Depends(get_db)):
    s = engine.start(db, u.id, body.text)
    db.commit()
    return session_dict(s)


@router.get("/{sid}")
def get(sid: int, u: User = Depends(client_only), db: Session = Depends(get_db)):
    return session_dict(_get(db, u, sid))


@router.post("/{sid}/answer")
def answer(sid: int, body: AnswerIn, u: User = Depends(client_only), db: Session = Depends(get_db)):
    s = _get(db, u, sid)
    if body.field not in field_registry():
        raise HTTPException(422, "Неизвестное поле")
    try:
        engine.answer(db, s, body.field, body.value)
    except ValueError as e:
        raise HTTPException(422, str(e))
    db.commit()
    return session_dict(s)


@router.post("/{sid}/recommend")
def recommend(sid: int, u: User = Depends(client_only), db: Session = Depends(get_db)):
    s = _get(db, u, sid)
    if s.status == "questions":
        raise HTTPException(409, "Сначала ответьте на вопросы")
    s.recommendations = do_recommend(s)
    db.commit()
    return session_dict(s)


@router.post("/{sid}/application")
def create_application(sid: int, body: ApplyIn, u: User = Depends(client_only), db: Session = Depends(get_db)):
    """Черновик заявки из сессии: сумма, срок, цель и залог переносятся, повторно вводить не нужно."""
    s = _get(db, u, sid)
    if body.product_code == "overdraft":
        raise HTTPException(422, "Овердрафт доступен для ознакомления")
    p = PRODUCTS.get(body.product_code)
    if not p:
        raise HTTPException(422, "Неизвестный продукт")
    if s.status == "questions":
        raise HTTPException(409, "Сначала ответьте на вопросы")
    if s.application_id:
        a = db.get(Application, s.application_id)
        if a and a.status == "DRAFT":
            if a.product_code != p["code"]:
                a.product_code = p["code"]
                a.product_snapshot = dict(p)
                a.amount = min(max(a.amount, p["min_amount"]), p["max_amount"])
                a.term_months = min(max(a.term_months, p["min_term"]), p["max_term"])
                a.has_collateral = a.has_collateral and p["allows_collateral"]
                log(db, a, "product", f"Выбран продукт: {p['name']}", actor=u.name)
                db.commit()
            return ser.detail(a, u)
    v = engine.known(s)
    amount = min(max(v.get("amount", p["min_amount"]), p["min_amount"]), p["max_amount"])
    term = min(max(v.get("term", p["max_term"]), p["min_term"]), p["max_term"])
    goal = engine.option_label("goal", v["goal"]) if "goal" in v else None
    purpose = (s.text or goal or p["tagline"])[:1000]
    a = Application(number="tmp-" + uuid.uuid4().hex[:8], owner_id=u.id, company_id=None, product_code=p["code"],
                    amount=amount, term_months=term, purpose=purpose,
                    has_collateral=v.get("collateral") == "yes" and p["allows_collateral"], financials={}, contact={"name": u.name},
                    wizard_step=1)
    db.add(a)
    db.flush()
    a.number = f"АБ-{datetime.now().year}-{a.id:05d}"
    log(db, a, "created", "Черновик заявки создан по итогам подбора", f"Продукт: {p['name']}", actor=u.name)
    s.application_id, s.status = a.id, "applied"
    db.commit()
    return ser.detail(a, u)
