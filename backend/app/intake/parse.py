"""Правила разбора свободного текста «опишите задачу» (перенесено из frontend/src/lib/need.ts).

Регулярные выражения намеренно совпадают с TS-версией (frontend/src/lib/need.ts): общие примеры
лежат в config_data/parse_cases.json и проверяются тестами на обеих сторонах. Вместо \\b используются
явные границы для кириллицы — в JS \\b не видит русские буквы.
"""
import re

from ..catalog import field_registry

L = "а-яёa-z"  # буквы для границ слова
WORDS = {"один": 1, "одного": 1, "два": 2, "двух": 2, "три": 3, "трёх": 3, "трех": 3, "четыре": 4, "четырёх": 4,
         "пять": 5, "пяти": 5, "шесть": 6, "семь": 7, "восемь": 8, "девять": 9, "десять": 10}
NUM = r"(\d+|" + "|".join(WORDS) + ")"


def _n(s: str) -> int | None:
    return int(s) if s.isdigit() else WORDS.get(s)


def _amount(t: str) -> int | None:
    if re.search(rf"полтора\s+(?:млн|миллион)", t):
        return 1_500_000
    if re.search(r"пол\s?миллиона", t):
        return 500_000
    m = re.search(rf"(\d+(?:[.,]\d+)?)\s*(млн|миллион[{L}]*|тыс[{L}]*\.?|т\.\s?р|к(?![{L}]))", t)
    if m:
        v = float(m.group(1).replace(",", "."))
        return round(v * (1_000_000 if m.group(2).startswith("м") else 1_000))
    m = re.search(rf"(?<![\d{L}])миллион(?![{L}])", t)
    if m:
        return 1_000_000
    m = re.search(r"(?<!\d)(\d{1,3}(?:[ .]\d{3}){1,3}|\d{5,9})(?!\d)", t)
    if m:
        return int(re.sub(r"[ .]", "", m.group(1)))
    return None


def _term(t: str) -> int | None:
    m = re.search(r"(\d+)\s*мес", t)
    if m:
        return int(m.group(1))
    m = re.search(rf"(?:(?<![{L}])на|срок[{L}]*)\s*(?:до\s+)?{NUM}\s*(?:год|лет)", t)
    if m:
        return (_n(m.group(1)) or 1) * 12
    if re.search(rf"(?<![{L}])(?:на|срок[{L}]*)\s+полтора\s+год", t):
        return 18
    if re.search(rf"(?<![{L}])(?:на|срок[{L}]*)\s+полгода", t):
        return 6
    if re.search(rf"(?<![{L}])на\s+год(?![{L}])", t):
        return 12
    return None


def _form(t: str) -> str | None:
    if re.search(rf"(?<![{L}])ооо(?![{L}])", t):
        return "ООО"
    if re.search(rf"(?<![{L}])ип(?![{L}])|индивидуальн", t):
        return "ИП"
    return None


def _age(t: str) -> int | None:
    lead = rf"(?:работа[{L}]*|существу[{L}]*|на рынке|в бизнесе|бизнесу|компании|открыл[{L}]*)"
    m = re.search(lead + rf"[^\d]{{0,20}}?{NUM}\s*(?:год|лет|г\.)", t)
    if m:
        return (_n(m.group(1)) or 0) * 12
    m = re.search(lead + r"[^\d]{0,20}?(\d+)\s*мес", t)
    if m:
        return int(m.group(1))
    if re.search(r"только (?:открыл|зарегистрир|начина)|недавно открыл", t):
        return 3
    return None


def _goal(t: str) -> tuple[str | None, list[str]]:
    hits = {g: sum(1 for k in kws if k in t) for g, kws in field_registry()["goal"]["keywords"].items()}
    best = max(hits.values()) if hits else 0
    if best == 0:
        return None, []
    top = [g for g, h in hits.items() if h == best]
    return (top[0], []) if len(top) == 1 else (None, top)


def _collateral(t: str) -> str | None:
    if re.search(r"без залог", t):
        return "no"
    if re.search(r"залог", t):
        return "yes"
    return None


def parse_need(text: str) -> dict:
    """Возвращает только то, что удалось уверенно найти: amount, term, legal_form, business_age_months, goal, collateral.

    Если цель двусмысленна (поровну признаков разных целей) — goal не ставится, а goal_candidates перечисляет варианты.
    """
    t = (text or "").lower().replace("\u00a0", " ")
    # телефоны и длинные номера (ИНН, счета) — не суммы
    t = re.sub(r"(?:\+7|(?<!\d)8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)", " ", t)
    t = re.sub(r"\d{10,}", " ", t)
    # возраст бизнеса ищем до срока, чтобы «работаем 3 года» не стало сроком кредита
    out: dict = {}
    age = _age(t)
    t_wo_age = re.sub(rf"(?:работа[{L}]*|существу[{L}]*|на рынке|в бизнесе|бизнесу|компании|открыл[{L}]*)[^\d]{{0,20}}?{NUM}\s*(?:год[{L}]*|лет|г\.|мес[{L}]*)", " ", t)
    for key, val in (("amount", _amount(t_wo_age)), ("term", _term(t_wo_age)), ("legal_form", _form(t)),
                     ("business_age_months", age), ("collateral", _collateral(t))):
        if val is not None:
            out[key] = val
    goal, candidates = _goal(t)
    if goal:
        out["goal"] = goal
    elif candidates:
        out["goal_candidates"] = candidates
    return out
