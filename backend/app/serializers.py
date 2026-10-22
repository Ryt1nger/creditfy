"""Сборка JSON для фронтенда (формы совпадают с frontend/src/api/types.ts)."""
from datetime import datetime, timezone

from .ai import get_provider
from .documents.parsers import FIELD_LABELS
from .documents.service import has_open_conflicts, review_fields
from .models import Application, User, now
from .products import DOC_KINDS, PRODUCTS, REJECT_REASONS
from .services import offers as offers_svc
from .services.pipeline import _latest
from .services.workflow import CLIENT_STEPS, status_info


def iso(d: datetime | None):
    if d is None:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.isoformat()


def current_offer(a: Application):
    for o in reversed(a.offers):
        if o.status in ("proposed", "accepted"):
            return o
    return None


def offer_dict(o):
    return {"id": o.id, "kind": o.kind, "amount": o.amount, "term_months": o.term_months, "rate": o.rate,
            "monthly_payment": o.monthly_payment, "total_payment": o.total_payment, "fee": o.fee,
            "explanation": o.explanation, "status": o.status, "valid_until": iso(o.valid_until)}


def summary(a: Application) -> dict:
    o, sc = current_offer(a), (a.scores[-1] if a.scores else None)
    return {
        "id": a.id, "number": a.number, "company_name": a.company.name if a.company else "Компания не указана", "product_code": a.product_code,
        "product_name": PRODUCTS[a.product_code]["name"], "amount": a.amount, "term_months": a.term_months,
        **{k: v for k, v in status_info(a.status).items()}, "status_label": status_info(a.status)["label"],
        "processing": a.processing, "wizard_step": a.wizard_step, "created_at": iso(a.created_at), "updated_at": iso(a.updated_at), "decision": a.decision,
        "offer": {"amount": o.amount, "term_months": o.term_months, "rate": o.rate, "monthly_payment": o.monthly_payment} if o else None,
        "assigned_to": a.assignee.name if a.assignee else None, "risk_grade": a.risk_grade, "score": a.score,
        "route": sc.route if sc else None, "open_requests": sum(1 for r in a.info_requests if r.status == "open"),
    }


def _company(a: Application) -> dict | None:
    eg = _latest(a, "egrul")
    c = a.company
    if c is None:
        return None
    return {"inn": c.inn, "name": c.name, "legal_form": c.legal_form, "ogrn": c.ogrn, "okved": c.okved, "reg_date": c.reg_date,
            "address": c.address, "director": c.director, "status": eg.get("status", "active"), "age_months": eg.get("age_months")}


def _score(sr):
    if not sr:
        return None
    return {"score": sr.score, "grade": sr.grade, "pd": sr.pd, "dscr": sr.dscr, "route": sr.route, "model_version": sr.model_version,
            "factors": sr.factors, "stop_factors": sr.stop_factors, "flags": sr.flags}


def ai_summary(a: Application, sc: dict | None) -> dict:
    ctx = {"company": {**_company(a)}, "application": {"amount": a.amount, "term_months": a.term_months, "product": PRODUCTS[a.product_code]["name"]}, "score": sc}
    r = get_provider().summarize_for_underwriter(ctx)
    return {"text": r.text, "source": r.source, "is_stub": r.is_stub}


def detail(a: Application, user: User) -> dict:
    bank = user.role != "client"
    have = {d.kind for d in a.documents if d.status != "rejected"}
    need = list(PRODUCTS[a.product_code]["docs"]) + (["collateral_doc"] if a.has_collateral else [])
    hint = status_info(a.status)["hint"]
    expl = get_provider().explain_status_for_client({"fallback": hint})
    d = {
        **summary(a), "steps": CLIENT_STEPS, "company": _company(a), "purpose": a.purpose, "has_collateral": a.has_collateral,
        "collateral_note": a.collateral_note, "financials": a.financials, "contact": a.contact,
        "documents": [{"id": x.id, "kind": x.kind, "label": DOC_KINDS.get(x.kind, x.kind), "filename": x.filename, "size": x.size,
                       "status": x.status, "review_comment": x.review_comment, "extraction": x.extracted.get("status", "not_available"),
                       "extraction_note": x.extracted.get("note"),
                       "extractions": [{"id": e.id, "field": e.field, "label": FIELD_LABELS.get(e.field, e.field), "value": e.value,
                                        "original_value": e.original_value, "source": e.source, "source_label": e.source_label,
                                        "confidence": e.confidence, "status": e.status, "note": e.note} for e in x.extractions]}
                      for x in a.documents],
        "review": {"fields": review_fields(a), "has_conflicts": has_open_conflicts(a)},
        "required_documents": [{"kind": k, "label": DOC_KINDS[k], "uploaded": k in have} for k in need],
        "info_requests": [{"id": r.id, "message": r.message, "items": r.items, "status": r.status, "answer": r.answer,
                           "created_by": "Система" if r.created_by == "system" else r.created_by, "created_at": iso(r.created_at)} for r in a.info_requests],
        "offers": [offer_dict(o) for o in a.offers],
        "events": [{"id": e.id, "ts": iso(e.ts), "kind": e.kind, "title": e.title, "detail": e.detail, "actor": e.actor,
                    "client_visible": e.client_visible, "to_status": e.to_status} for e in a.events if bank or e.client_visible],
        "loan": None, "decision_reason": a.decision_reason, "ai_explanation": {"text": expl.text, "source": expl.source, "is_stub": expl.is_stub},
    }
    if a.loan:
        l = a.loan
        from datetime import date
        d["loan"] = {"contract_number": l.contract_number, "amount": l.amount, "rate": l.rate, "term_months": l.term_months,
                     "signed_at": iso(l.signed_at), "disbursed_at": iso(l.disbursed_at),
                     "schedule": offers_svc.schedule(l.amount, l.term_months, l.rate, l.disbursed_at.date())}
    if bank:
        sc = _score(a.scores[-1] if a.scores else None)
        sug = None
        if sc and a.status in ("MANUAL_REVIEW", "NEEDS_INFO"):
            from .services.pipeline import _suggest
            c = _suggest(a, a.scores[-1])
            if c:
                sug = {"amount": c.amount, "term_months": c.term_months, "rate": c.rate, "monthly_payment": c.monthly_payment,
                       "kind": c.kind, "dscr": c.dscr, "explanation": c.explanation}
        d["bank"] = {
            "enrichment": {"egrul": _latest(a, "egrul") or None, "bki": _latest(a, "bki") or None, "pb": _latest(a, "pb") or None},
            "score": sc, "ai_summary": ai_summary(a, sc), "suggested_offer": sug,
            "reject_reasons": [{"code": k, "label": v} for k, v in REJECT_REASONS.items()],
            "can_decide": user.role == "underwriter" and a.status == "MANUAL_REVIEW",
            "can_edit_docs": a.status not in ("DISBURSED", "REJECTED", "CANCELLED"),
        }
    return d
