"""Модель данных (см. docs/data-model.md)."""
from datetime import datetime, timezone

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20))  # client | operator | underwriter
    password_hash: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Company(Base):
    __tablename__ = "companies"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    inn: Mapped[str] = mapped_column(String(12), index=True)
    ogrn: Mapped[str | None] = mapped_column(String(15), nullable=True)
    name: Mapped[str] = mapped_column(String(250))
    legal_form: Mapped[str] = mapped_column(String(20), default="ООО")
    okved: Mapped[str | None] = mapped_column(String(200), nullable=True)
    reg_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    director: Mapped[str | None] = mapped_column(String(150), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Application(Base):
    __tablename__ = "applications"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    # пусто, пока клиент не дошёл до шага «Компания» в мастере
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    product_code: Mapped[str] = mapped_column(String(30))
    amount: Mapped[int] = mapped_column(Integer)
    term_months: Mapped[int] = mapped_column(Integer)
    purpose: Mapped[str | None] = mapped_column(Text, nullable=True)
    has_collateral: Mapped[bool] = mapped_column(Boolean, default=False)
    collateral_note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    financials: Mapped[dict] = mapped_column(JSON, default=dict)
    contact: Mapped[dict] = mapped_column(JSON, default=dict)

    status: Mapped[str] = mapped_column(String(30), default="DRAFT", index=True)
    resume_to: Mapped[str | None] = mapped_column(String(30), nullable=True)  # куда вернуться после NEEDS_INFO
    processing: Mapped[bool] = mapped_column(Boolean, default=False)
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    risk_grade: Mapped[str | None] = mapped_column(String(2), nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    decision: Mapped[str | None] = mapped_column(String(30), nullable=True)  # approved|counteroffer|rejected
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision_by: Mapped[str | None] = mapped_column(String(40), nullable=True)  # auto | user:<id>
    version: Mapped[int] = mapped_column(Integer, default=1)
    wizard_step: Mapped[int] = mapped_column(Integer, default=1)  # шаг мастера для «Продолжить с шага N»

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)

    company: Mapped[Company | None] = relationship()
    owner: Mapped[User] = relationship(foreign_keys=[owner_id])
    assignee: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id])
    documents: Mapped[list["Document"]] = relationship(back_populates="application", cascade="all, delete-orphan")
    info_requests: Mapped[list["InfoRequest"]] = relationship(back_populates="application", cascade="all, delete-orphan")
    events: Mapped[list["Event"]] = relationship(
        back_populates="application", cascade="all, delete-orphan", order_by="Event.id"
    )
    enrichments: Mapped[list["Enrichment"]] = relationship(cascade="all, delete-orphan")
    scores: Mapped[list["ScoreResult"]] = relationship(cascade="all, delete-orphan", order_by="ScoreResult.id")
    offers: Mapped[list["Offer"]] = relationship(cascade="all, delete-orphan", order_by="Offer.id")
    loan: Mapped["Loan | None"] = relationship(uselist=False, cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"), index=True)
    kind: Mapped[str] = mapped_column(String(40))
    filename: Mapped[str] = mapped_column(String(250))
    stored_name: Mapped[str] = mapped_column(String(80))
    size: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[str] = mapped_column(String(20), default="uploaded")  # uploaded|verified|rejected
    review_comment: Mapped[str | None] = mapped_column(String(300), nullable=True)
    extracted: Mapped[dict] = mapped_column(JSON, default=dict)  # {status: ok|partial|not_available, method, note}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    application: Mapped[Application] = relationship(back_populates="documents")
    extractions: Mapped[list["DocExtraction"]] = relationship(back_populates="document", cascade="all, delete-orphan",
                                                              order_by="DocExtraction.id")


class InfoRequest(Base):
    __tablename__ = "info_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"), index=True)
    created_by: Mapped[str] = mapped_column(String(60))  # system | user:<id>
    message: Mapped[str] = mapped_column(Text)
    items: Mapped[list] = mapped_column(JSON, default=list)  # [{type: field|document, key, label}]
    status: Mapped[str] = mapped_column(String(10), default="open")  # open|answered
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    application: Mapped[Application] = relationship(back_populates="info_requests")


class Event(Base):
    """Единый журнал: и таймлайн для клиента, и аудит для банка."""

    __tablename__ = "events"
    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(250))
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor: Mapped[str] = mapped_column(String(80), default="system")
    from_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    client_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    application: Mapped[Application] = relationship(back_populates="events")


class Enrichment(Base):
    __tablename__ = "enrichments"
    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"), index=True)
    source: Mapped[str] = mapped_column(String(20))  # egrul | bki | pb
    ok: Mapped[bool] = mapped_column(Boolean, default=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ScoreResult(Base):
    __tablename__ = "score_results"
    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"), index=True)
    model_version: Mapped[str] = mapped_column(String(20))
    score: Mapped[int] = mapped_column(Integer)
    grade: Mapped[str] = mapped_column(String(2))
    pd: Mapped[float] = mapped_column(Float)
    dscr: Mapped[float | None] = mapped_column(Float, nullable=True)
    route: Mapped[str] = mapped_column(String(20))  # auto_approve | manual | reject
    stop_factors: Mapped[list] = mapped_column(JSON, default=list)
    factors: Mapped[list] = mapped_column(JSON, default=list)
    flags: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Offer(Base):
    __tablename__ = "offers"
    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"), index=True)
    kind: Mapped[str] = mapped_column(String(12))  # initial | counter
    amount: Mapped[int] = mapped_column(Integer)
    term_months: Mapped[int] = mapped_column(Integer)
    rate: Mapped[float] = mapped_column(Float)
    monthly_payment: Mapped[int] = mapped_column(Integer)
    total_payment: Mapped[int] = mapped_column(Integer)
    fee: Mapped[int] = mapped_column(Integer, default=0)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="proposed")  # proposed|accepted|declined|superseded
    valid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Loan(Base):
    __tablename__ = "loans"
    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"), unique=True)
    contract_number: Mapped[str] = mapped_column(String(40))
    amount: Mapped[int] = mapped_column(Integer)
    rate: Mapped[float] = mapped_column(Float)
    term_months: Mapped[int] = mapped_column(Integer)
    signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    disbursed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    application_id: Mapped[int | None] = mapped_column(ForeignKey("applications.id"), nullable=True)
    text: Mapped[str] = mapped_column(String(300))
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class DocExtraction(Base):
    """Значение, извлечённое из документа. Клиент видит его с подписью источника и может поправить или подтвердить."""

    __tablename__ = "doc_extractions"
    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), index=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"), index=True)
    field: Mapped[str] = mapped_column(String(40))  # revenue_year | net_profit_year | monthly_turnover | ...
    value: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    original_value: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    source: Mapped[str] = mapped_column(String(20))  # parser_pdf | parser_xlsx | parser_csv | ai | client
    source_label: Mapped[str] = mapped_column(String(200))  # «Отчёт о финансовых результатах, строка 2110»
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    status: Mapped[str] = mapped_column(String(12), default="ok")  # ok | edited | conflict | confirmed
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    document: Mapped[Document] = relationship(back_populates="extractions")


class IntakeSession(Base):
    """Квиз «опишите задачу»: что клиент написал, что из этого поняли, что спросили, какой портрет получился."""

    __tablename__ = "intake_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    text: Mapped[str] = mapped_column(Text, default="")
    extracted: Mapped[dict] = mapped_column(JSON, default=dict)  # поле -> {value, source: text|answer|ai}
    answers: Mapped[dict] = mapped_column(JSON, default=dict)  # поле -> значение (ответы карточками)
    portrait: Mapped[dict] = mapped_column(JSON, default=dict)
    recommendations: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(12), default="questions")  # questions | ready | applied
    ai_calls_used: Mapped[int] = mapped_column(Integer, default=0)
    application_id: Mapped[int | None] = mapped_column(ForeignKey("applications.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    turns: Mapped[list["IntakeTurn"]] = relationship(back_populates="session", cascade="all, delete-orphan",
                                                     order_by="IntakeTurn.id")


class IntakeTurn(Base):
    __tablename__ = "intake_turns"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("intake_sessions.id"), index=True)
    field: Mapped[str] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(10), default="question")  # question | clarify
    question: Mapped[str] = mapped_column(String(300))
    hint: Mapped[str | None] = mapped_column(String(300), nullable=True)
    options: Mapped[list] = mapped_column(JSON, default=list)
    source: Mapped[str] = mapped_column(String(10), default="bank")  # bank | ai
    answer: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {value, label}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    session: Mapped[IntakeSession] = relationship(back_populates="turns")


class AiCall(Base):
    """Журнал обращений к модели: для бюджета (LLM_MAX_CALLS на сессию) и аудита. Текст запроса не храним."""

    __tablename__ = "ai_calls"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("intake_sessions.id"), nullable=True, index=True)
    application_id: Mapped[int | None] = mapped_column(ForeignKey("applications.id"), nullable=True, index=True)
    purpose: Mapped[str] = mapped_column(String(30))  # parse | question | clarify | extract
    model: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(12))  # ok | invalid | timeout | error | cached
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    prompt_chars: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class CatalogItem(Base):
    """Копия конфигурации (продукты, реестр полей) в БД — грузится из JSON при старте."""

    __tablename__ = "catalog_items"
    __table_args__ = (UniqueConstraint("kind", "code"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))  # product | field
    code: Mapped[str] = mapped_column(String(40))
    version: Mapped[int] = mapped_column(Integer, default=1)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
