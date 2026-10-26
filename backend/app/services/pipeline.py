"""Кредитный конвейер: полнота данных → обогащение из реестров → скоринг → маршрутизация решения.

Каждый шаг фиксируется в БД и журнале событий, поэтому клиент и банк видят статус «вживую».
Конвейер возобновляем: после ответа клиента на запрос он продолжается с нужного места.
"""
import logging
import threading
import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal
from ..integrations import bki_lookup, egrul_lookup, pb_lookup
from ..models import Application, Enrichment, InfoRequest, Offer, ScoreResult, now
from ..products import DOC_KINDS, PRODUCTS, REJECT_REASONS
from ..product_snapshot import product_for
from . import offers as offers_svc
from .scoring import MODEL_VERSION, score_application
from .workflow import AUTO_STATUSES, log, notify, transition

logger = logging.getLogger("creditfy.pipeline")

FIELD_LABELS = {
    "financials.revenue_year": "Выручка за последний год, ₽",
    "financials.net_profit_year": "Чистая прибыль за последний год, ₽",
    "financials.monthly_turnover": "Среднемесячный оборот по счёту, ₽",
    "financials.monthly_obligations": "Ежемесячные платежи по действующим кредитам, ₽",
    "contact.name": "Контактное лицо",
    "contact.phone": "Телефон для связи",
    "purpose": "Цель кредита",
}


# ───────────── полнота ─────────────
def missing_items(app: Application) -> list[dict]:
    items: list[dict] = []
    for key, label in FIELD_LABELS.items():
        scope, _, name = key.partition(".")
        val = (app.financials if scope == "financials" else app.contact if scope == "contact" else {"purpose": app.purpose}).get(
            name if name else "purpose"
        )
        if val is None or val == "":
            items.append({"type": "field", "key": key, "label": label})
    have = {d.kind for d in app.documents if d.status != "rejected"}
    need = list(product_for(app)["docs"]) + (["collateral_doc"] if app.has_collateral else [])
    for kind in need:
        if kind not in have:
            items.append({"type": "document", "key": kind, "label": DOC_KINDS[kind]})
    return items


def _open_request(db: Session, app: Application, message: str, items: list[dict], created_by: str) -> InfoRequest:
    req = InfoRequest(application_id=app.id, created_by=created_by, message=message, items=items)
    db.add(req)
    app.info_requests.append(req)
    return req


# ───────────── шаги ─────────────
def _pause():
    if settings.pipeline_step_delay > 0:
        time.sleep(settings.pipeline_step_delay)


def step_completeness(db: Session, app: Application) -> bool:
    items = missing_items(app)
    if items:
        _open_request(db, app, "Для рассмотрения заявки не хватает данных. Пожалуйста, дополните их.", items, "system")
        app.resume_to = "COMPLETENESS_CHECK"
        transition(db, app, "NEEDS_INFO", "Нужны уточнения",
                   "Не хватает: " + "; ".join(i["label"] for i in items))
        notify(db, app.owner_id, app, f"Заявка {app.number}: нужны уточнения")
        return False
    log(db, app, "check", "Данные и документы полные", client_visible=True)
    transition(db, app, "ENRICHMENT", "Проверяем компанию в реестрах")
    return True


def step_enrichment(db: Session, app: Application) -> None:
    inn = app.company.inn
    egrul, bki, pb = egrul_lookup(inn), bki_lookup(inn), pb_lookup(inn)
    for src, payload in (("egrul", egrul), ("bki", bki), ("pb", pb)):
        db.add(Enrichment(application_id=app.id, source=src, ok=payload is not None, payload=payload or {}))
    log(db, app, "enrichment", "Данные о компании подтверждены в реестрах",
        "ЕГРЮЛ/ЕГРИП, бюро кредитных историй, «Прозрачный бизнес» (симуляторы)", client_visible=True)
    transition(db, app, "SCORING", "Оцениваем кредитный риск")


def _latest(app: Application, source: str) -> dict:
    rows = [e for e in app.enrichments if e.source == source]
    return rows[-1].payload if rows else {}


def run_scoring(db: Session, app: Application) -> ScoreResult:
    egrul, bki, pb = _latest(app, "egrul"), _latest(app, "bki"), _latest(app, "pb")
    out = score_application(app.product_code, app.amount, app.has_collateral, app.financials, egrul, bki, pb, product=product_for(app))
    bki_pay = sum(l["monthly_payment"] for l in bki.get("active_loans", []))
    _, _, free = offers_svc.available_cash(app.financials, bki_pay)
    rate = offers_svc.rate_for(product_for(app), out.grade, app.has_collateral)
    d = offers_svc.dscr(app.amount, app.term_months, rate, free)
    sr = ScoreResult(application_id=app.id, model_version=MODEL_VERSION, score=out.score, grade=out.grade, pd=out.pd,
                     dscr=d, route=out.route, stop_factors=out.stop_factors, factors=out.factors, flags=out.flags)
    db.add(sr)
    app.scores.append(sr)
    app.score, app.risk_grade = out.score, out.grade
    log(db, app, "scoring", f"Скоринг: {out.score} баллов, класс {out.grade}",
        f"Маршрут: {out.route}; DSCR по запросу: {d}", client_visible=False)
    return sr


def _suggest(app: Application, sr: ScoreResult):
    bki_pay = sum(l["monthly_payment"] for l in _latest(app, "bki").get("active_loans", []))
    _, _, free = offers_svc.available_cash(app.financials, bki_pay)
    return offers_svc.find_offer(app.product_code, app.amount, app.term_months, sr.grade, app.has_collateral, free, product=product_for(app))


def issue_offer(db: Session, app: Application, calc: offers_svc.OfferCalc, by: str, note: str | None = None) -> Offer:
    for o in app.offers:
        if o.status == "proposed":
            o.status = "superseded"
    off = Offer(application_id=app.id, kind=calc.kind, amount=calc.amount, term_months=calc.term_months, rate=calc.rate,
                monthly_payment=calc.monthly_payment, total_payment=calc.total_payment, fee=calc.fee,
                explanation=note or calc.explanation, valid_until=offers_svc.valid_until())
    db.add(off)
    app.offers.append(off)
    app.decision = "approved" if calc.kind == "initial" else "counteroffer"
    app.decision_by = by
    app.decision_reason = off.explanation
    title = "Банк одобрил заявку" if calc.kind == "initial" else "Банк предлагает изменённые условия"
    transition(db, app, "OFFER_READY", title, off.explanation, actor=by)
    notify(db, app.owner_id, app, f"Заявка {app.number}: {title.lower()}")
    return off


def reject(db: Session, app: Application, reason_code: str, by: str, comment: str | None = None) -> None:
    reason = REJECT_REASONS.get(reason_code, reason_code)
    app.decision, app.decision_by = "rejected", by
    app.decision_reason = reason + (f". {comment}" if comment else "")
    transition(db, app, "REJECTED", "Банк не готов одобрить заявку", app.decision_reason, actor=by)
    notify(db, app.owner_id, app, f"Заявка {app.number}: отказ — {reason.lower()}")


def step_scoring_and_route(db: Session, app: Application) -> None:
    sr = run_scoring(db, app)
    if sr.route == "reject":
        code = sr.stop_factors[0]["code"] if sr.stop_factors else "high_risk"
        reject(db, app, code, "auto")
        return
    suggestion = _suggest(app, sr)
    if sr.route == "auto_approve":
        if suggestion:
            issue_offer(db, app, suggestion, "auto")
            return
        reject(db, app, "insufficient_capacity", "auto")
        return
    # manual
    transition(db, app, "MANUAL_REVIEW", "Заявку рассматривает кредитный специалист",
               "Случай выходит за рамки автоматического решения.")
    notify(db, app.owner_id, app, f"Заявка {app.number}: передана кредитному специалисту")


# ───────────── оркестрация ─────────────
def advance(db: Session, app: Application) -> None:
    while True:
        s = app.status
        if s == "SUBMITTED":
            _pause()
            transition(db, app, "COMPLETENESS_CHECK", "Проверяем полноту данных")
        elif s == "COMPLETENESS_CHECK":
            _pause()
            if not step_completeness(db, app):
                return
        elif s == "ENRICHMENT":
            _pause()
            step_enrichment(db, app)
        elif s == "SCORING":
            _pause()
            step_scoring_and_route(db, app)
            return
        else:
            return
        db.commit()


_active: set[int] = set()
_active_lock = threading.Lock()


def _run(app_id: int) -> None:
    try:
        for attempt in range(3):
            with SessionLocal() as db:
                app = db.get(Application, app_id)
                if app is None:
                    return
                try:
                    advance(db, app)
                    app.processing = False
                    db.commit()
                    return
                except Exception:
                    logger.exception("Сбой конвейера заявки %s, попытка %s", app_id, attempt + 1)
                    db.rollback()
                    if attempt == 2:
                        app = db.get(Application, app_id)
                        app.processing = False
                        log(db, app, "error", "Обработка временно приостановлена",
                            "Повторить обработку можно кнопкой в карточке заявки.")
                        db.commit()
            time.sleep(0.1 * (attempt + 1))
    finally:
        with _active_lock:
            _active.discard(app_id)


def launch(db: Session, app: Application) -> None:
    """Один обработчик заявки на процесс. В MVP API запускается одним worker."""
    with _active_lock:
        if app.id in _active:
            return
        _active.add(app.id)
    try:
        app.processing = True
        db.commit()
        if settings.pipeline_step_delay == 0:
            _run(app.id)
            db.refresh(app)
        else:
            threading.Thread(target=_run, args=(app.id,), daemon=True).start()
    except Exception:
        with _active_lock:
            _active.discard(app.id)
        raise


def recover_pending() -> None:
    """После рестарта продолжаем с последнего зафиксированного этапа."""
    with SessionLocal() as db:
        pending = db.scalars(select(Application).where(Application.status.in_(AUTO_STATUSES))).all()
        for app in pending:
            log(db, app, "recovery", "Обработка продолжена после перезапуска")
            launch(db, app)
        for app in db.scalars(select(Application).where(Application.processing.is_(True), Application.status.not_in(AUTO_STATUSES))):
            app.processing = False
        db.commit()


def resume_after_answer(db: Session, app: Application) -> None:
    """Клиент ответил на запрос -> возвращаем заявку туда, откуда её «остановили»."""
    target = app.resume_to or "COMPLETENESS_CHECK"
    app.resume_to = None
    if target == "MANUAL_REVIEW":
        transition(db, app, "MANUAL_REVIEW", "Клиент ответил на запрос, заявка вернулась специалисту")
        if app.assigned_to_id:
            notify(db, app.assigned_to_id, app, f"Заявка {app.number}: клиент ответил на запрос")
        db.commit()
    else:
        transition(db, app, "COMPLETENESS_CHECK", "Получили уточнения, продолжаем проверку")
        launch(db, app)
