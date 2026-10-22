import hashlib
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import serializers as ser
from ..ai import get_provider, provider_status
from ..config import settings
from ..db import get_db
from ..integrations import DEMO_SCENARIOS, egrul_lookup, inn_is_valid
from ..models import Application, Company, Document, Event, InfoRequest, Loan, Notification, User, now
from ..products import DISCLAIMER, DOC_KINDS, PRODUCTS, REJECT_REASONS
from ..schemas import (AnswerIn, ApplicationIn, ApplicationPatch, CalcIn, DeclineIn, DecisionIn, DocReviewIn, LoginIn,
                       RecommendIn, RequestInfoIn, SignIn)
from ..security import (bank_only, client_only, create_token, current_user, underwriter_only, verify_password)
from ..services import offers as offers_svc
from ..services import pipeline
from ..services.workflow import log, notify, transition

router = APIRouter(prefix="/api")
ALLOWED_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".xlsx", ".docx", ".csv"}
ALLOWED_FIELDS = {"financials.revenue_year", "financials.net_profit_year", "financials.monthly_turnover",
                  "financials.monthly_obligations", "contact.name", "contact.phone", "purpose"}
BANK_GROUPS = {
    "manual": ["MANUAL_REVIEW"], "waiting": ["NEEDS_INFO"], "auto": ["SUBMITTED", "COMPLETENESS_CHECK", "ENRICHMENT", "SCORING"],
    "offers": ["OFFER_READY", "SIGNING"], "done": ["DISBURSED", "REJECTED", "DECLINED_BY_CLIENT", "EXPIRED", "CANCELLED"],
}
HINTS = {"operator@demo.ru": "Оператор: проверка полноты и документов", "risk@demo.ru": "Андеррайтер: принимает решения",
         "ivan@demo.ru": "ООО «Север-Логистика» — сильный клиент", "volkov@demo.ru": "ИП Волков — пограничный случай",
         "maria@demo.ru": "ООО «Пекарня №1» — встречное предложение"}


# ───────── служебное ─────────
@router.get("/health", tags=["service"])
def health(db: Session = Depends(get_db)):
    db.execute(select(1))
    return {"status": "ok", "ai": provider_status()["provider"]}


@router.post("/auth/login", tags=["auth"])
def login(body: LoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Неверный логин или пароль")
    return {"token": create_token(u), "user": {"id": u.id, "name": u.name, "email": u.email, "role": u.role}}


@router.get("/auth/demo-accounts", tags=["auth"])
def demo_accounts(db: Session = Depends(get_db)):
    if not settings.seed_demo:
        return []
    return [{"email": u.email, "name": u.name, "role": u.role, "hint": HINTS.get(u.email, "")} for u in db.scalars(select(User).order_by(User.id))]


@router.get("/me", tags=["auth"])
def me(u: User = Depends(current_user)):
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role}


@router.get("/products", tags=["catalog"])
def products(_: User = Depends(current_user)):
    return [{k: v for k, v in {**p, "docs": [{"kind": d, "label": DOC_KINDS[d]} for d in p["docs"]], "disclaimer": DISCLAIMER}.items()
             if k not in ("auto_limit", "keywords")} for p in PRODUCTS.values()]


@router.get("/demo/inns", tags=["catalog"])
def demo_inns(_: User = Depends(current_user)):
    return [{"inn": v["inn"], "name": v["name"], "title": v["title"]} for v in DEMO_SCENARIOS.values()]


@router.get("/companies/lookup/{inn}", tags=["catalog"])
def lookup(inn: str, _: User = Depends(current_user)):
    if not inn_is_valid(inn):
        raise HTTPException(422, "Некорректный ИНН: проверьте цифры (10 для организаций, 12 для ИП)")
    return egrul_lookup(inn)


@router.post("/products/recommend", tags=["catalog"])
def recommend(body: RecommendIn, _: User = Depends(current_user)):
    p = get_provider()
    items = p.recommend_products(body.text, body.amount, list(PRODUCTS.values()))
    return {"source": p.name, "is_stub": p.is_stub, "items": [{"code": i.code, "score": i.score, "reason": i.reason} for i in items]}


@router.post("/calculator", tags=["catalog"])
def calculator(body: CalcIn, _: User = Depends(current_user)):
    p = PRODUCTS.get(body.product_code)
    if not p:
        raise HTTPException(422, "Неизвестный продукт")
    rate = offers_svc.rate_for(p, "A", body.has_collateral)
    pay = offers_svc.annuity(body.amount, body.term_months, rate)
    return {"rate_from": rate, "monthly_payment": round(pay), "total_payment": round(pay * body.term_months),
            "fee": round(body.amount * p["fee_pct"] / 100)}


@router.get("/ai/status", tags=["ai"])
def ai_status():
    return provider_status()


# ───────── вспомогательное ─────────
def _get(db: Session, user: User, app_id: int, bank: bool = False) -> Application:
    a = db.get(Application, app_id)
    if not a or (user.role == "client" and (bank or a.owner_id != user.id)):
        raise HTTPException(404, "Заявка не найдена")
    _expire(db, a)
    return a


def _expire(db: Session, a: Application) -> None:
    if a.status != "OFFER_READY":
        return
    o = next((x for x in a.offers if x.status == "proposed"), None)
    if o:
        vu = o.valid_until if o.valid_until.tzinfo else o.valid_until.replace(tzinfo=timezone.utc)
        if vu < now():
            transition(db, a, "EXPIRED", "Срок предложения истёк")
            db.commit()


def _busy(a: Application) -> None:
    if a.processing:
        raise HTTPException(409, "Заявка обрабатывается, подождите несколько секунд")


def _editable(a: Application) -> None:
    if a.status not in ("DRAFT", "NEEDS_INFO"):
        raise HTTPException(409, "Заявку уже нельзя менять")


def _set_company(db: Session, owner: User, inn: str) -> Company:
    e = egrul_lookup(inn)
    if not e:
        raise HTTPException(422, "Некорректный ИНН")
    c = db.scalar(select(Company).where(Company.owner_id == owner.id, Company.inn == inn))
    if not c:
        c = Company(owner_id=owner.id, inn=inn, name=e["name"], legal_form=e["legal_form"], ogrn=e["ogrn"], okved=e["okved"],
                    reg_date=e["reg_date"], address=e["address"], director=e["director"])
        db.add(c)
        db.flush()
    return c


def _limits(code: str, amount: int, term: int) -> None:
    p = PRODUCTS.get(code)
    if not p:
        raise HTTPException(422, "Неизвестный продукт")
    if not (p["min_amount"] <= amount <= p["max_amount"]):
        raise HTTPException(422, f"Сумма для этого продукта: {p['min_amount']}–{p['max_amount']} ₽")
    if not (p["min_term"] <= term <= p["max_term"]):
        raise HTTPException(422, f"Срок для этого продукта: {p['min_term']}–{p['max_term']} мес.")


# ───────── клиент ─────────
@router.get("/applications", tags=["client"])
def my_apps(u: User = Depends(client_only), db: Session = Depends(get_db)):
    apps = db.scalars(select(Application).where(Application.owner_id == u.id).order_by(Application.id.desc())).all()
    for a in apps:
        _expire(db, a)
    return [ser.summary(a) for a in apps]


@router.post("/applications", tags=["client"])
def create_app(body: ApplicationIn, u: User = Depends(client_only), db: Session = Depends(get_db)):
    _limits(body.product_code, body.amount, body.term_months)
    c = _set_company(db, u, body.company_inn)
    a = Application(number="tmp-" + uuid.uuid4().hex[:8], owner_id=u.id, company_id=c.id, product_code=body.product_code,
                    amount=body.amount, term_months=body.term_months, purpose=body.purpose, has_collateral=body.has_collateral,
                    collateral_note=body.collateral_note, financials=body.financials.model_dump(), contact=body.contact.model_dump())
    db.add(a)
    db.flush()
    a.number = f"АБ-{datetime.now().year}-{a.id:05d}"
    log(db, a, "created", "Черновик заявки создан", actor=u.name)
    db.commit()
    return ser.detail(a, u)


@router.get("/applications/{app_id}", tags=["client"])
def get_app(app_id: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    return ser.detail(_get(db, u, app_id), u)


@router.patch("/applications/{app_id}", tags=["client"])
def patch_app(app_id: int, body: ApplicationPatch, u: User = Depends(client_only), db: Session = Depends(get_db)):
    a = _get(db, u, app_id)
    _editable(a)
    data = body.model_dump(exclude_unset=True)
    code, amount, term = data.get("product_code", a.product_code), data.get("amount", a.amount), data.get("term_months", a.term_months)
    _limits(code, amount, term)
    a.product_code, a.amount, a.term_months = code, amount, term
    for k in ("purpose", "has_collateral", "collateral_note"):
        if k in data:
            setattr(a, k, data[k])
    if "financials" in data and data["financials"] is not None:
        a.financials = {**a.financials, **{k: v for k, v in data["financials"].items() if v is not None}}
    if "contact" in data and data["contact"] is not None:
        a.contact = {**a.contact, **{k: v for k, v in data["contact"].items() if v is not None}}
    if data.get("company_inn") and data["company_inn"] != a.company.inn:
        a.company_id = _set_company(db, u, data["company_inn"]).id
        db.flush()
        db.refresh(a)
    a.updated_at = now()
    db.commit()
    return ser.detail(a, u)


@router.post("/applications/{app_id}/documents", tags=["client"])
async def upload_doc(app_id: int, kind: str = Form(...), file: UploadFile = File(...),
                     u: User = Depends(client_only), db: Session = Depends(get_db)):
    a = _get(db, u, app_id)
    _editable(a)
    if kind not in DOC_KINDS:
        raise HTTPException(422, "Неизвестный тип документа")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(422, "Допустимые форматы: pdf, jpg, png, xlsx, docx, csv")
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(413, "Файл больше 5 МБ")
    stored = uuid.uuid4().hex + ext
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    (Path(settings.upload_dir) / stored).write_bytes(content)
    for d in [d for d in a.documents if d.kind == kind and d.status == "rejected"]:
        db.delete(d)
    ex = get_provider().extract_document(kind, file.filename or stored, content)
    name = Path(file.filename or stored).name[:200]
    a.documents.append(Document(kind=kind, filename=name, stored_name=stored, size=len(content), sha256=hashlib.sha256(content).hexdigest(),
                                extracted={"status": ex.status, "fields": ex.fields}))
    log(db, a, "document", f"Загружен документ: {DOC_KINDS[kind]}", name, u.name)
    db.commit()
    db.refresh(a)
    return ser.detail(a, u)


@router.delete("/applications/{app_id}/documents/{doc_id}", tags=["client"])
def delete_doc(app_id: int, doc_id: int, u: User = Depends(client_only), db: Session = Depends(get_db)):
    a = _get(db, u, app_id)
    _editable(a)
    d = next((x for x in a.documents if x.id == doc_id), None)
    if not d:
        raise HTTPException(404, "Документ не найден")
    db.delete(d)
    db.commit()
    db.refresh(a)
    return ser.detail(a, u)


@router.post("/applications/{app_id}/submit", tags=["client"])
def submit(app_id: int, u: User = Depends(client_only), db: Session = Depends(get_db)):
    a = _get(db, u, app_id)
    if a.status != "DRAFT":
        raise HTTPException(409, "Заявка уже отправлена")
    if a.company is None:
        raise HTTPException(422, "Укажите компанию по ИНН")
    transition(db, a, "SUBMITTED", "Заявка отправлена в банк", actor=u.name)
    a.submitted_at = now()
    db.commit()
    pipeline.launch(db, a)
    return ser.detail(a, u)


@router.post("/applications/{app_id}/info-requests/{rid}/answer", tags=["client"])
def answer(app_id: int, rid: int, body: AnswerIn, u: User = Depends(client_only), db: Session = Depends(get_db)):
    a = _get(db, u, app_id)
    r = next((x for x in a.info_requests if x.id == rid), None)
    if not r or r.status != "open" or a.status != "NEEDS_INFO":
        raise HTTPException(409, "Запрос уже закрыт")
    for k, v in body.fields.items():
        if k not in ALLOWED_FIELDS:
            raise HTTPException(422, f"Поле {k} нельзя изменить")
        scope, _, name = k.partition(".")
        if scope == "financials":
            try:
                a.financials = {**a.financials, name: None if v in (None, "") else int(float(v))}
            except ValueError:
                raise HTTPException(422, "Сумма должна быть числом")
        elif scope == "contact":
            a.contact = {**a.contact, name: v}
        else:
            a.purpose = str(v)
    have = {d.kind for d in a.documents if d.status != "rejected"}
    left = []
    for it in r.items:
        if it["type"] == "document" and it.get("key") not in have:
            left.append(it["label"])
        elif it["type"] == "field":
            scope, _, name = it["key"].partition(".")
            val = a.financials.get(name) if scope == "financials" else a.contact.get(name) if scope == "contact" else a.purpose
            if val in (None, ""):
                left.append(it["label"])
        elif it["type"] == "text" and not (body.answer or "").strip():
            left.append(it["label"])
    if left:
        raise HTTPException(422, "Не всё заполнено: " + "; ".join(left))
    r.status, r.answer, r.answered_at = "answered", body.answer, now()
    log(db, a, "answer", "Клиент ответил на запрос банка", body.answer, u.name)
    pipeline.resume_after_answer(db, a)
    db.commit()
    db.refresh(a)
    return ser.detail(a, u)


@router.post("/applications/{app_id}/offer/accept", tags=["client"])
def accept(app_id: int, u: User = Depends(client_only), db: Session = Depends(get_db)):
    a = _get(db, u, app_id)
    o = next((x for x in a.offers if x.status == "proposed"), None)
    if a.status != "OFFER_READY" or not o:
        raise HTTPException(409, "Предложение недоступно")
    o.status = "accepted"
    transition(db, a, "SIGNING", "Вы приняли предложение банка", actor=u.name)
    db.commit()
    return ser.detail(a, u)


@router.post("/applications/{app_id}/offer/decline", tags=["client"])
def decline(app_id: int, body: DeclineIn | None = None, u: User = Depends(client_only), db: Session = Depends(get_db)):
    a = _get(db, u, app_id)
    o = next((x for x in a.offers if x.status == "proposed"), None)
    if a.status != "OFFER_READY" or not o:
        raise HTTPException(409, "Предложение недоступно")
    o.status = "declined"
    transition(db, a, "DECLINED_BY_CLIENT", "Вы отказались от предложения", body.reason if body else None, actor=u.name)
    db.commit()
    return ser.detail(a, u)


def sign_loan(db: Session, a: Application) -> None:
    o = next(x for x in a.offers if x.status == "accepted")
    a.loan = Loan(application_id=a.id, contract_number=f"АБ-КД-{datetime.now().year}-{a.id:05d}", amount=o.amount, rate=o.rate, term_months=o.term_months)
    log(db, a, "sign", "Договор подписан электронной подписью (демо)", actor=a.company.name)
    transition(db, a, "DISBURSED", "Кредит выдан", f"Сумма {o.amount} ₽ зачислена на расчётный счёт (симуляция)")
    notify(db, a.owner_id, a, f"Заявка {a.number}: кредит выдан")


@router.post("/applications/{app_id}/sign", tags=["client"])
def sign(app_id: int, body: SignIn, u: User = Depends(client_only), db: Session = Depends(get_db)):
    a = _get(db, u, app_id)
    if a.status != "SIGNING":
        raise HTTPException(409, "Подписание недоступно")
    if not body.consent:
        raise HTTPException(422, "Подтвердите согласие с условиями")
    sign_loan(db, a)
    db.commit()
    db.refresh(a)
    return ser.detail(a, u)


@router.post("/applications/{app_id}/cancel", tags=["client"])
def cancel(app_id: int, u: User = Depends(client_only), db: Session = Depends(get_db)):
    a = _get(db, u, app_id)
    _busy(a)
    transition(db, a, "CANCELLED", "Заявка отменена клиентом", actor=u.name)
    db.commit()
    return ser.detail(a, u)


@router.get("/notifications", tags=["client"])
def notifications(u: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Notification).where(Notification.user_id == u.id).order_by(Notification.id.desc()).limit(30)).all()
    return [{"id": n.id, "application_id": n.application_id, "text": n.text, "read": n.read, "created_at": ser.iso(n.created_at)} for n in rows]


@router.post("/notifications/read-all", tags=["client"])
def read_all(u: User = Depends(current_user), db: Session = Depends(get_db)):
    for n in db.scalars(select(Notification).where(Notification.user_id == u.id, Notification.read.is_(False))):
        n.read = True
    db.commit()
    return {"ok": True}


# ───────── банк ─────────
@router.get("/bank/applications", tags=["bank"])
def bank_list(group: str = "all", q: str = "", u: User = Depends(bank_only), db: Session = Depends(get_db)):
    apps = db.scalars(select(Application).where(Application.status != "DRAFT").order_by(Application.updated_at.desc())).all()
    out = []
    for a in apps:
        _expire(db, a)
        if group not in ("all", "") and a.status not in BANK_GROUPS.get(group, []):
            continue
        if q and q.lower() not in ((a.company.name + a.company.inn if a.company else "") + a.number).lower():
            continue
        out.append(ser.summary(a))
    return out


@router.get("/bank/applications/{app_id}", tags=["bank"])
def bank_get(app_id: int, u: User = Depends(bank_only), db: Session = Depends(get_db)):
    return ser.detail(_get(db, u, app_id), u)


@router.post("/bank/applications/{app_id}/take", tags=["bank"])
def take(app_id: int, u: User = Depends(bank_only), db: Session = Depends(get_db)):
    a = _get(db, u, app_id)
    a.assigned_to_id = u.id
    log(db, a, "assign", f"Заявку взял в работу: {u.name}", actor=u.name, client_visible=False)
    db.commit()
    db.refresh(a)
    return ser.detail(a, u)


@router.post("/bank/applications/{app_id}/documents/{doc_id}/review", tags=["bank"])
def review_doc(app_id: int, doc_id: int, body: DocReviewIn, u: User = Depends(bank_only), db: Session = Depends(get_db)):
    a = _get(db, u, app_id)
    d = next((x for x in a.documents if x.id == doc_id), None)
    if not d:
        raise HTTPException(404, "Документ не найден")
    d.status, d.review_comment = body.status, body.comment
    log(db, a, "doc_review", f"Документ «{DOC_KINDS[d.kind]}»: {'принят' if d.status == 'verified' else 'отклонён'}", body.comment, u.name,
        client_visible=d.status == "rejected")
    db.commit()
    return ser.detail(a, u)


@router.post("/bank/applications/{app_id}/request-info", tags=["bank"])
def request_info(app_id: int, body: RequestInfoIn, u: User = Depends(bank_only), db: Session = Depends(get_db)):
    a = _get(db, u, app_id)
    if a.status != "MANUAL_REVIEW":
        raise HTTPException(409, "Запрос можно отправить только по заявке на рассмотрении")
    items = [i.model_dump() for i in body.items] or [{"type": "text", "label": "Пояснение"}]
    a.info_requests.append(InfoRequest(application_id=a.id, created_by=u.name, message=body.message, items=items))
    a.resume_to = "MANUAL_REVIEW"
    transition(db, a, "NEEDS_INFO", "Банк запросил уточнения", body.message, actor=u.name)
    notify(db, a.owner_id, a, f"Заявка {a.number}: нужны уточнения")
    db.commit()
    return ser.detail(a, u)


@router.post("/bank/applications/{app_id}/rescore", tags=["bank"])
def rescore(app_id: int, u: User = Depends(bank_only), db: Session = Depends(get_db)):
    a = _get(db, u, app_id)
    if a.status != "MANUAL_REVIEW":
        raise HTTPException(409, "Пересчёт доступен на рассмотрении")
    pipeline.run_scoring(db, a)
    log(db, a, "rescore", "Скоринг пересчитан", actor=u.name, client_visible=False)
    db.commit()
    db.refresh(a)
    return ser.detail(a, u)


@router.post("/bank/applications/{app_id}/decision", tags=["bank"])
def decision(app_id: int, body: DecisionIn, u: User = Depends(underwriter_only), db: Session = Depends(get_db)):
    a = _get(db, u, app_id)
    if a.status != "MANUAL_REVIEW":
        raise HTTPException(409, "Решение уже принято или заявка не на рассмотрении")
    by = f"user:{u.id}"
    if body.type == "reject":
        if body.reason_code not in REJECT_REASONS:
            raise HTTPException(422, "Укажите причину отказа")
        pipeline.reject(db, a, body.reason_code, by, body.comment)
    else:
        sc = a.scores[-1]
        amount = a.amount if body.type == "approve" else body.amount
        term = a.term_months if body.type == "approve" else body.term_months
        if not amount or not term:
            raise HTTPException(422, "Укажите сумму и срок")
        _limits(a.product_code, amount, term)
        p = PRODUCTS[a.product_code]
        rate = body.rate if body.rate is not None else offers_svc.rate_for(p, sc.grade, a.has_collateral)
        bki_pay = sum(l["monthly_payment"] for l in pipeline._latest(a, "bki").get("active_loans", []))
        _, _, free = offers_svc.available_cash(a.financials, bki_pay)
        kind = "initial" if body.type == "approve" else "counter"
        calc = offers_svc.build_offer(p, amount, term, rate, free, kind,
                                      body.comment or ("Одобрено кредитным специалистом на запрошенных условиях." if kind == "initial" else "Кредитный специалист скорректировал условия."))
        pipeline.issue_offer(db, a, calc, by, body.comment or None)
    db.commit()
    db.refresh(a)
    return ser.detail(a, u)


@router.get("/bank/stats", tags=["bank"])
def stats(u: User = Depends(bank_only), db: Session = Depends(get_db)):
    apps = db.scalars(select(Application).where(Application.status != "DRAFT")).all()

    def count(f):
        return sum(1 for a in apps if f(a))
    decided = count(lambda a: a.decision)
    auto = count(lambda a: a.decision_by == "auto")
    route = lambda a: a.scores[-1].route if a.scores else None  # noqa: E731
    funnel = [("Подано", lambda a: True), ("Прошли проверку данных", lambda a: bool(a.scores) or a.status not in ("SUBMITTED", "COMPLETENESS_CHECK", "NEEDS_INFO")),
              ("Оценены скорингом", lambda a: bool(a.scores)), ("Получили решение", lambda a: bool(a.decision)),
              ("Одобрены", lambda a: a.decision in ("approved", "counteroffer")), ("Кредит выдан", lambda a: a.status == "DISBURSED")]
    return {"total": len(apps), "auto_rate": round(auto / decided * 100) if decided else 0,
            "avg_amount": round(sum(a.amount for a in apps) / len(apps)) if apps else 0,
            "funnel": [{"status": l, "label": l, "count": count(f)} for l, f in funnel],
            "by_route": [{"route": r, "label": l, "count": count(lambda a, r=r: route(a) == r)}
                         for r, l in (("auto_approve", "Автоматически"), ("manual", "Ручной андеррайтинг"), ("reject", "Автоотказ"))]}
