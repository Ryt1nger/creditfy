"""Машина состояний заявки — единственное место, где разрешены переходы (диаграмма: docs/state-diagram.md)."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import Application, Event, Notification, now

S = dict(
    DRAFT="DRAFT", SUBMITTED="SUBMITTED", COMPLETENESS_CHECK="COMPLETENESS_CHECK", NEEDS_INFO="NEEDS_INFO",
    ENRICHMENT="ENRICHMENT", SCORING="SCORING", MANUAL_REVIEW="MANUAL_REVIEW", OFFER_READY="OFFER_READY",
    REJECTED="REJECTED", SIGNING="SIGNING", DISBURSED="DISBURSED", DECLINED_BY_CLIENT="DECLINED_BY_CLIENT",
    EXPIRED="EXPIRED", CANCELLED="CANCELLED",
)

TRANSITIONS: dict[str, set[str]] = {
    "DRAFT": {"SUBMITTED", "CANCELLED"},
    "SUBMITTED": {"COMPLETENESS_CHECK"},
    "COMPLETENESS_CHECK": {"NEEDS_INFO", "ENRICHMENT"},
    "NEEDS_INFO": {"COMPLETENESS_CHECK", "MANUAL_REVIEW", "CANCELLED"},
    "ENRICHMENT": {"SCORING"},
    "SCORING": {"OFFER_READY", "MANUAL_REVIEW", "REJECTED"},
    "MANUAL_REVIEW": {"OFFER_READY", "REJECTED", "NEEDS_INFO"},
    "OFFER_READY": {"SIGNING", "DECLINED_BY_CLIENT", "EXPIRED", "CANCELLED"},
    "SIGNING": {"DISBURSED", "CANCELLED"},
    "REJECTED": set(), "DISBURSED": set(), "DECLINED_BY_CLIENT": set(), "EXPIRED": set(), "CANCELLED": set(),
}
TERMINAL = {k for k, v in TRANSITIONS.items() if not v}
AUTO_STATUSES = {"SUBMITTED", "COMPLETENESS_CHECK", "ENRICHMENT", "SCORING"}

# Для клиента: 5 крупных шагов
CLIENT_STEPS = ["Заявка", "Проверка данных", "Оценка риска", "Решение", "Подписание и выдача"]

# status -> (подпись, шаг 0..4, группа, подсказка клиенту «что дальше»)
STATUS_META: dict[str, tuple[str, int, str, str]] = {
    "DRAFT": ("Черновик", 0, "draft", "Заполните заявку и отправьте её в банк."),
    "SUBMITTED": ("Заявка принята", 0, "progress", "Заявка получена, сейчас начнём проверку."),
    "COMPLETENESS_CHECK": ("Проверяем полноту данных", 1, "progress", "Сверяем данные и документы. Ничего делать не нужно."),
    "NEEDS_INFO": ("Нужны уточнения", 1, "action", "Банку не хватает данных — ответьте на запрос ниже, и мы продолжим."),
    "ENRICHMENT": ("Проверяем компанию в реестрах", 2, "progress", "Подтверждаем данные о компании в государственных реестрах и кредитной истории."),
    "SCORING": ("Оцениваем кредитный риск", 2, "progress", "Считаем оценку и подбираем условия."),
    "MANUAL_REVIEW": ("Заявку рассматривает кредитный специалист", 3, "progress", "Случай требует внимания специалиста. Обычно это занимает до одного рабочего дня."),
    "OFFER_READY": ("Банк одобрил — выберите решение", 3, "action", "Ознакомьтесь с условиями и примите или отклоните предложение."),
    "REJECTED": ("Банк не готов одобрить заявку", 3, "final", "Посмотрите причину ниже. Вы можете оформить новую заявку с другими параметрами."),
    "SIGNING": ("Подписание договора", 4, "action", "Проверьте договор и подпишите его электронной подписью."),
    "DISBURSED": ("Кредит выдан", 4, "final", "Деньги зачислены на расчётный счёт. График платежей — ниже."),
    "DECLINED_BY_CLIENT": ("Вы отказались от предложения", 3, "final", "Заявка закрыта по вашему решению."),
    "EXPIRED": ("Срок предложения истёк", 3, "final", "Оформите новую заявку, если потребность сохраняется."),
    "CANCELLED": ("Заявка отменена", 0, "final", "Заявка закрыта."),
}


def status_info(status: str) -> dict:
    label, step, group, hint = STATUS_META[status]
    return {"status": status, "label": label, "step": step, "group": group, "hint": hint}


def log(db: Session, app: Application, kind: str, title: str, detail: str | None = None, actor: str = "system",
        client_visible: bool = True, from_status: str | None = None, to_status: str | None = None) -> Event:
    ev = Event(application_id=app.id, kind=kind, title=title, detail=detail, actor=actor,
               client_visible=client_visible, from_status=from_status, to_status=to_status)
    db.add(ev)
    return ev


def notify(db: Session, user_id: int, app: Application, text: str) -> None:
    db.add(Notification(user_id=user_id, application_id=app.id, text=text))


def transition(db: Session, app: Application, to: str, title: str, detail: str | None = None, actor: str = "system",
               client_visible: bool = True) -> None:
    allowed = TRANSITIONS.get(app.status, set())
    if to not in allowed:
        raise HTTPException(409, f"Недопустимый переход статуса: {app.status} → {to}")
    frm = app.status
    app.status = to
    app.version += 1
    app.updated_at = now()
    log(db, app, "status", title, detail, actor, client_visible, frm, to)
