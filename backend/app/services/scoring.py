"""Прозрачный балльный скоринг (scorecard v1). Скоринг ≠ кредитное решение.

Скоринг только оценивает риск (балл 0–1000, класс A–E, PD). Решение принимает кредитная логика:
скоринг + стоп-факторы + лимиты продукта + платёжеспособность (DSCR) — см. services/pipeline.py.
"""
from dataclasses import dataclass, field

from ..products import PRODUCTS

MODEL_VERSION = "scorecard-v1"
BASE = 500
PD = {"A": 0.015, "B": 0.03, "C": 0.06, "D": 0.11, "E": 0.25}


@dataclass
class ScoreOut:
    score: int
    grade: str
    pd: float
    route: str  # auto_approve | manual | reject
    factors: list = field(default_factory=list)
    stop_factors: list = field(default_factory=list)
    flags: list = field(default_factory=list)


def grade_of(score: int) -> str:
    return "A" if score >= 700 else "B" if score >= 620 else "C" if score >= 540 else "D" if score >= 460 else "E"


def score_application(product_code: str, amount: int, has_collateral: bool, fin: dict, egrul: dict, bki: dict, pb: dict) -> ScoreOut:
    product = PRODUCTS[product_code]
    factors, stops, flags = [], [], []
    pts = BASE

    def add(code, name, value, points, comment=""):
        nonlocal pts
        pts += points
        factors.append({"code": code, "name": name, "value": value, "points": points, "comment": comment})

    revenue = max(1.0, float(fin.get("revenue_year", 0)))
    profit = float(fin.get("net_profit_year", 0))
    turnover = float(fin.get("monthly_turnover", 0))

    # ── стоп-факторы политики ──
    if egrul["status"] != "active":
        stops.append({"code": "company_status", "name": "Компания ликвидируется или ликвидирована"})
    if egrul["age_months"] < 6:
        stops.append({"code": "company_age", "name": "Бизнесу меньше 6 месяцев"})
    if bki["max_overdue_days_24m"] > 90:
        stops.append({"code": "credit_history", "name": f"Просрочка {bki['max_overdue_days_24m']} дн. за 24 месяца"})
    if pb["tax_debt"] > 100_000 and pb["tax_debt"] > 0.05 * revenue:
        stops.append({"code": "tax_debt", "name": f"Налоговая задолженность {pb['tax_debt']:,} ₽".replace(",", " ")})

    # ── факторы скоринга ──
    age = egrul["age_months"]
    p_age = 60 if age > 60 else 30 if age > 36 else 0 if age >= 12 else -40
    add("age", "Возраст бизнеса", f"{age} мес.", p_age)

    ratio = amount / revenue
    p_ratio = 40 if ratio < 0.15 else 0 if ratio < 0.3 else -30 if ratio < 0.5 else -80
    add("amount_to_revenue", "Сумма кредита к годовой выручке", f"{ratio:.0%}", p_ratio)

    margin = profit / revenue
    p_margin = -90 if margin < 0 else -20 if margin < 0.05 else 20 if margin < 0.15 else 50
    add("margin", "Рентабельность по чистой прибыли", f"{margin:.1%}", p_margin)

    od = bki["max_overdue_days_24m"]
    if not bki["has_history"]:
        add("overdue", "Просрочки по кредитам", "нет истории", -30, "Кредитной истории нет — оценить дисциплину нельзя")
    else:
        p_od = 40 if od == 0 else -50 if od <= 30 else -120 if od <= 90 else -200
        add("overdue", "Просрочки по кредитам (24 мес.)", f"{od} дн.", p_od)
        hm = bki["history_months"]
        add("history", "Длина кредитной истории", f"{hm} мес.", 20 if hm >= 36 else 10 if hm >= 12 else -10)

    add("tax_debt", "Налоговая задолженность", f"{pb['tax_debt']:,} ₽".replace(",", " "), 20 if pb["tax_debt"] == 0 else -60)

    if pb["risk_flags"]:
        add("registry_flags", "Риск-признаки в реестрах", ", ".join(pb["risk_flags"]), -70)
        flags.append("Риск-признаки ФНС: " + ", ".join(pb["risk_flags"]))

    if has_collateral and product["allows_collateral"]:
        add("collateral", "Предоставлен залог", "да", 50)

    # ── кросс-проверки данных ──
    if turnover > 0 and abs(turnover * 12 - revenue) / revenue > 0.35:
        add("consistency", "Оборот по счёту расходится с заявленной выручкой", f"{turnover * 12:,.0f} против {revenue:,.0f}".replace(",", " "), -40)
        flags.append("Оборот по счёту ×12 расходится с выручкой более чем на 35%")
    declared = float(fin.get("monthly_obligations", 0))
    bki_sum = sum(l["monthly_payment"] for l in bki["active_loans"])
    if bki_sum > declared * 1.2 + 1000:
        flags.append(f"В БКИ платежи по кредитам больше заявленных ({bki_sum:,} против {declared:,.0f} ₽/мес.)".replace(",", " "))

    pts = max(0, min(1000, pts))
    grade = grade_of(pts)
    if stops or grade == "E":
        route = "reject"
    elif grade in ("A", "B") and not flags and amount <= product["auto_limit"]:
        route = "auto_approve"
    else:
        route = "manual"
    return ScoreOut(pts, grade, PD[grade], route, factors, stops, flags)
