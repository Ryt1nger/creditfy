"""Расчёт условий и поиск решения (offer search).

Идея «поиска решений»: если запрошенные условия не проходят по платёжеспособности (DSCR),
система не отказывает сразу, а ищет ближайшие приемлемые условия — сначала растягивает срок
при той же сумме, затем уменьшает сумму — и предлагает встречное предложение.
"""
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from ..products import GRADE_PREMIUM, PRODUCTS

MIN_DSCR = 1.25  # минимальное покрытие платежа свободным денежным потоком
OFFER_VALID_DAYS = 14
TERM_STEP = 3
AMOUNT_STEP_PCT = 0.05


def annuity(amount: float, term: int, rate_pct: float) -> float:
    r = rate_pct / 1200
    if r == 0:
        return amount / term
    return amount * r / (1 - (1 + r) ** -term)


def rate_for(product: dict, grade: str, collateral: bool) -> float:
    rate = product["base_rate"] + GRADE_PREMIUM.get(grade, 5.0)
    if collateral and product["allows_collateral"]:
        rate -= 1.0
    return round(rate, 2)


def available_cash(financials: dict, bki_monthly_payments: int) -> tuple[float, float, float]:
    """(операционный денежный поток/мес, текущие обязательства/мес, свободный поток/мес).

    Обязательства берём как максимум из заявленных клиентом и найденных в БКИ — консервативно.
    """
    cash = max(0.0, float(financials.get("net_profit_year", 0)) / 12 * 1.15)  # +15% — добавка на амортизацию
    obligations = max(float(financials.get("monthly_obligations", 0)), float(bki_monthly_payments))
    return cash, obligations, max(0.0, cash - obligations)


def dscr(amount: int, term: int, rate: float, free_cash: float) -> float:
    pay = annuity(amount, term, rate)
    return round(free_cash / pay, 2) if pay > 0 else 0.0


@dataclass
class OfferCalc:
    kind: str  # initial | counter
    amount: int
    term_months: int
    rate: float
    monthly_payment: int
    total_payment: int
    fee: int
    dscr: float
    explanation: str


def _round_amount(x: float, step: int = 10_000) -> int:
    return int(x // step * step)


def build_offer(product: dict, amount: int, term: int, rate: float, free_cash: float, kind: str, explanation: str) -> OfferCalc:
    pay = annuity(amount, term, rate)
    return OfferCalc(kind, amount, term, rate, round(pay), round(pay * term), round(amount * product["fee_pct"] / 100),
                     dscr(amount, term, rate, free_cash), explanation)


def find_offer(product_code: str, amount: int, term: int, grade: str, collateral: bool, free_cash: float) -> OfferCalc | None:
    """Возвращает исходные условия, встречное предложение или None, если платить нечем."""
    p = PRODUCTS[product_code]
    rate = rate_for(p, grade, collateral)
    amount = min(max(amount, p["min_amount"]), p["max_amount"])
    term = min(max(term, p["min_term"]), p["max_term"])

    if dscr(amount, term, rate, free_cash) >= MIN_DSCR:
        return build_offer(p, amount, term, rate, free_cash, "initial", "Запрошенные условия подтверждены.")

    a = amount
    while a >= p["min_amount"]:
        t = term
        while t <= p["max_term"]:
            if dscr(a, t, rate, free_cash) >= MIN_DSCR:
                changes = []
                if t != term:
                    changes.append(f"срок увеличен с {term} до {t} мес.")
                if a != amount:
                    changes.append(f"сумма уменьшена с {amount:,} до {a:,} ₽".replace(",", " "))
                why = (
                    "Платёж по запрошенным условиям занимает слишком большую часть свободного денежного потока "
                    f"(нужно покрытие не ниже {MIN_DSCR}). Подобрали ближайшие подходящие условия: " + ", ".join(changes) + "."
                )
                return build_offer(p, a, t, rate, free_cash, "counter", why)
            t += TERM_STEP if p["max_term"] > p["min_term"] else 1
        nxt = _round_amount(a * (1 - AMOUNT_STEP_PCT))
        if nxt >= a:
            break
        a = nxt
    return None


def schedule(amount: int, term: int, rate: float, start: date) -> list[dict]:
    pay = annuity(amount, term, rate)
    bal, rows, r = float(amount), [], rate / 1200
    for n in range(1, term + 1):
        interest = bal * r
        principal = pay - interest if n < term else bal
        bal = max(0.0, bal - principal)
        m = start.month - 1 + n
        d = date(start.year + m // 12, m % 12 + 1, min(start.day, 28))
        rows.append({"n": n, "date": d.isoformat(), "payment": round(principal + interest), "principal": round(principal),
                     "interest": round(interest), "balance": round(bal)})
    return rows


def valid_until() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=OFFER_VALID_DAYS)
