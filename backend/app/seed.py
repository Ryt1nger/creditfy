"""Синтетические демо-данные: пользователи и заявки во всех ключевых состояниях."""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .integrations import DEMO_SCENARIOS
from .models import Application, Company, Document, User, now
from .products import DOC_KINDS, PRODUCTS
from .routers.api import _set_company, sign_loan
from .security import hash_password
from .services import pipeline
from .services.workflow import log, transition

FIN = {
    "strong": dict(revenue_year=60_000_000, net_profit_year=9_000_000, monthly_turnover=5_000_000, monthly_obligations=150_000),
    "tight": dict(revenue_year=18_000_000, net_profit_year=1_800_000, monthly_turnover=1_500_000, monthly_obligations=25_000),
    "gray": dict(revenue_year=9_000_000, net_profit_year=1_000_000, monthly_turnover=750_000, monthly_obligations=18_000),
    "bad": dict(revenue_year=25_000_000, net_profit_year=900_000, monthly_turnover=2_000_000, monthly_obligations=40_000),
}
USERS = [("Иван Соколов", "ivan@demo.ru", "client"), ("Андрей Волков", "volkov@demo.ru", "client"), ("Мария Пекарева", "maria@demo.ru", "client"),
         ("Елена Крылова", "operator@demo.ru", "operator"), ("Дмитрий Орлов", "risk@demo.ru", "underwriter")]


def seed_demo(db: Session) -> None:
    if db.scalar(select(User.id).limit(1)):
        return
    users = {}
    for name, email, role in USERS:
        u = User(name=name, email=email, role=role, password_hash=hash_password("demo123"))
        db.add(u)
        users[email] = u
    db.flush()
    from .config import settings
    saved_delay, settings.pipeline_step_delay = settings.pipeline_step_delay, 0  # сидирование без пауз

    def mk(owner, sc, code, amount, term, docs=None, collateral=False):
        c = _set_company(db, owner, DEMO_SCENARIOS[sc]["inn"])
        a = Application(number="tmp", owner_id=owner.id, company_id=c.id, product_code=code, amount=amount, term_months=term,
                        purpose="Демонстрационная заявка", has_collateral=collateral, financials=FIN[sc],
                        contact={"name": owner.name, "phone": "+7 900 000-00-00"})
        db.add(a)
        db.flush()
        a.number = f"АБ-{now().year}-{a.id:05d}"
        log(db, a, "created", "Черновик заявки создан", actor=owner.name)
        kinds = docs if docs is not None else PRODUCTS[code]["docs"] + (["collateral_doc"] if collateral else [])
        for k in kinds:
            a.documents.append(Document(kind=k, filename=f"{k}.pdf", stored_name="demo", size=200_000, sha256="demo", extracted={"status": "not_available"}))
        transition(db, a, "SUBMITTED", "Заявка отправлена в банк", actor=owner.name)
        a.submitted_at = now()
        db.commit()
        pipeline.launch(db, a)
        db.refresh(a)
        return a

    ivan, volkov, maria, risk = users["ivan@demo.ru"], users["volkov@demo.ru"], users["maria@demo.ru"], users["risk@demo.ru"]
    a1 = mk(ivan, "strong", "equipment", 1_800_000, 36)
    o = next(x for x in a1.offers if x.status == "proposed")
    o.status = "accepted"
    transition(db, a1, "SIGNING", "Клиент принял предложение", actor=a1.company.name)
    sign_loan(db, a1)
    mk(ivan, "strong", "investment", 4_000_000, 48, docs=["bank_statement", "tax_return"])
    mk(ivan, "strong", "working_capital", 2_500_000, 24)
    g = mk(volkov, "gray", "working_capital", 1_200_000, 18)
    g.assigned_to_id = risk.id
    mk(volkov, "gray", "overdraft", 600_000, 12)
    mk(volkov, "bad", "working_capital", 3_000_000, 24)
    mk(maria, "tight", "equipment", 4_000_000, 36)
    for i, a in enumerate(db.scalars(select(Application).order_by(Application.id)).all()):
        shift = timedelta(hours=3.1 * (8 - i))
        a.created_at, a.updated_at = now() - shift - timedelta(hours=4), now() - shift
    db.commit()
    settings.pipeline_step_delay = saved_delay
