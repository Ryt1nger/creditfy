"""Портрет задачи и подбор продуктов — только правила и шаблоны (без модели).

Подбор — подсказка, а не кредитное решение: решение принимается после проверки заявки.
"""
from ..catalog import field_registry
from ..models import IntakeSession
from ..products import DISCLAIMER, DOC_KINDS, PRODUCTS
from ..services.offers import annuity

ORDER = ["goal", "amount", "term", "legal_form", "business_age_months", "collateral"]
NOTE = "Подбор — подсказка, а не решение банка. Решение принимается после проверки заявки."


def _rub(n: int) -> str:
    if n >= 1_000_000:
        s = f"{n / 1_000_000:.1f}".rstrip("0").rstrip(".").replace(".", ",")
        return f"{s} млн ₽"
    if n >= 1_000:
        return f"{round(n / 1000)} тыс. ₽"
    return f"{n} ₽"


def _term(m: int) -> str:
    if m % 12 == 0:
        y = m // 12
        return f"{y} {'год' if y == 1 else 'года' if 2 <= y <= 4 else 'лет'}"
    return f"{m} мес."


def _age(m: int) -> str:
    return "меньше 6 месяцев" if m < 6 else "6–12 месяцев" if m < 12 else "1–3 года" if m < 36 else "больше 3 лет"


def portrait(s: IntakeSession) -> dict:
    from .engine import known, option_label
    vals = known(s)
    reg = field_registry()
    src = {k: ("answer" if k in s.answers else s.extracted.get(k, {}).get("source", "text")) for k in vals}
    items = [{"field": k, "label": reg[k]["label"], "value": vals[k], "value_label": option_label(k, vals[k]), "source": src[k]}
             for k in ORDER if k in vals]
    parts = []
    if "legal_form" in vals:
        parts.append(vals["legal_form"] + (f", бизнесу {_age(vals['business_age_months'])}" if "business_age_months" in vals else ""))
    need = "Нужно"
    if "amount" in vals:
        need += f" {_rub(vals['amount'])}"
    if "term" in vals:
        need += f" на {_term(vals['term'])}"
    if "goal" in vals:
        need += f" — {option_label('goal', vals['goal']).lower()}"
    parts.append(need)
    if vals.get("collateral") == "yes":
        parts.append("есть залог")
    elif vals.get("collateral") == "no":
        parts.append("без залога")
    return {"items": items, "summary": ". ".join(p[0].upper() + p[1:] for p in parts) + ".", "values": vals}


def _evaluate(p: dict, v: dict, text: str) -> dict:
    el = p["eligibility"]
    amount, term = v.get("amount"), v.get("term")
    goal, form, age, coll = v.get("goal"), v.get("legal_form"), v.get("business_age_months"), v.get("collateral")
    blockers, reasons, caveats, score = [], [], [], 0.0

    if form and form not in el["forms"]:
        blockers.append(f"Продукт доступен только для: {', '.join(el['forms'])}")
    if age is not None and age < el["min_business_age_months"]:
        blockers.append(f"Нужно, чтобы бизнесу было от {el['min_business_age_months']} мес.")
    req_from = el.get("collateral_required_from")
    if req_from and amount and amount >= req_from:
        if coll == "no":
            blockers.append(f"Для суммы от {_rub(req_from)} нужен залог")
        elif coll != "yes":
            caveats.append(f"Для суммы от {_rub(req_from)} понадобится залог")

    goal_label = None
    if goal:
        from .engine import option_label
        goal_label = option_label("goal", goal).lower()
        if p["goals"][0] == goal:
            score += 3
            reasons.append(f"Создан для задачи «{goal_label}»")
        elif goal in p["goals"]:
            score += 1.5
            reasons.append(f"Тоже решает задачу «{goal_label}»")
        else:
            score -= 1
    hits = [k for k in p["keywords"] if k in text.lower()]
    score += min(len(hits), 3) * 0.2

    s_amount = amount or p["min_amount"]
    if amount:
        if amount > p["max_amount"]:
            s_amount = p["max_amount"]
            score -= 1
            caveats.append(f"Максимум по продукту {_rub(p['max_amount'])} — остальное можно закрыть другим продуктом")
        elif amount < p["min_amount"]:
            s_amount = p["min_amount"]
            score -= 0.5
            caveats.append(f"Минимальная сумма {_rub(p['min_amount'])}")
        else:
            score += 1
            reasons.append(f"Сумма {_rub(amount)} в пределах продукта ({_rub(p['min_amount'])}–{_rub(p['max_amount'])})")
    s_term = min(max(term or p["max_term"], p["min_term"]), p["max_term"])
    if term:
        if p["min_term"] <= term <= p["max_term"]:
            score += 0.5
            reasons.append(f"Срок {_term(term)} подходит")
        else:
            caveats.append(f"Срок по продукту {_term(p['min_term'])}–{_term(p['max_term'])}, предложим {_term(s_term)}")
    if form and age is not None and not blockers:
        reasons.append(f"Доступен для {form}, бизнесу от {el['min_business_age_months']} мес.")
    if el["collateral"] == "none":
        reasons.append("Без залога и поручительств")
    elif coll == "yes" and p["allows_collateral"]:
        reasons.append("Залог снизит ставку на 1 п.п.")
    rate = round(p["base_rate"] - (1.0 if coll == "yes" and p["allows_collateral"] else 0), 2)
    pay = round(annuity(s_amount, s_term, rate))
    return {
        "code": p["code"], "name": p["name"], "tagline": p["tagline"], "score": round(score, 2),
        "amount": s_amount, "term_months": s_term, "rate_from": rate, "monthly_payment": pay,
        "reasons": reasons[:4], "caveats": caveats, "blockers": blockers,
        "docs": [{"kind": k, "label": DOC_KINDS[k]} for k in p["docs"]],
    }


def recommend(s: IntakeSession) -> dict:
    from .engine import known
    v = known(s)
    evals = [_evaluate(p, v, s.text) for p in PRODUCTS.values()]
    ok = sorted([e for e in evals if not e["blockers"]], key=lambda e: -e["score"])
    bad = [{"code": e["code"], "name": e["name"], "why": e["blockers"]} for e in evals if e["blockers"]]
    for e in ok + [x for x in evals if x["blockers"]]:
        e.pop("blockers", None)
    return {
        "primary": ok[0] if ok else None, "alternatives": ok[1:3], "not_suitable": bad,
        "disclaimer": DISCLAIMER, "note": NOTE,
    }
