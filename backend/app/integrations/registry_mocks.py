"""Локальные симуляторы внешних источников (ограничение ТЗ: без доступа к реальным системам).

  * ЕГРЮЛ/ЕГРИП      — существование и статус бизнеса, регистрационные данные;
  * БКИ              — кредитная история;
  * «Прозрачный бизнес» ФНС — налоговая задолженность, штат, риск-признаки.

Все данные синтетические и детерминированы по ИНН (одинаковый ИНН -> одинаковый ответ),
поэтому сценарии воспроизводимы. Для демонстрации заведены «именные» ИНН (см. DEMO_SCENARIOS).
"""
import hashlib
import random
from datetime import date, timedelta

W10 = (2, 4, 10, 3, 5, 9, 4, 6, 8)
W11 = (7, 2, 4, 10, 3, 5, 9, 4, 6, 8)
W12 = (3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8)


def _ctrl(digits: str, weights) -> int:
    return sum(int(d) * w for d, w in zip(digits, weights)) % 11 % 10


def inn_is_valid(inn: str) -> bool:
    if not inn.isdigit():
        return False
    if len(inn) == 10:
        return _ctrl(inn[:9], W10) == int(inn[9])
    if len(inn) == 12:
        return _ctrl(inn[:10], W11) == int(inn[10]) and _ctrl(inn[:11], W12) == int(inn[11])
    return False


def make_inn(base: str) -> str:
    """base: 9 цифр -> ИНН юрлица (10); 10 цифр -> ИНН ИП (12)."""
    if len(base) == 9:
        return base + str(_ctrl(base, W10))
    d11 = base + str(_ctrl(base, W11))
    return d11 + str(_ctrl(d11, W12))


# ключ сценария -> (ИНН, профиль)
DEMO_SCENARIOS: dict[str, dict] = {
    "strong": {
        "inn": make_inn("780412345"),
        "name": "ООО «Север-Логистика»", "form": "ООО", "okved": "49.41 Перевозки грузовым автотранспортом",
        "age_months": 84, "status": "active", "overdue": 0, "tax_debt": 0, "flags": [], "bki_months": 72,
        "loans": [{"lender": "Банк А", "balance": 300_000, "monthly_payment": 35_000, "overdue_days": 0}],
        "title": "Сильный клиент: автоодобрение",
    },
    "gray": {
        "inn": make_inn("5001234567"),
        "name": "ИП Волков Андрей Николаевич", "form": "ИП", "okved": "47.19 Розничная торговля в неспециализированных магазинах",
        "age_months": 20, "status": "active", "overdue": 12, "tax_debt": 0, "flags": [], "bki_months": 18,
        "loans": [{"lender": "МФК В", "balance": 200_000, "monthly_payment": 18_000, "overdue_days": 12}],
        "title": "Пограничный клиент: ручной андеррайтинг",
    },
    "bad": {
        "inn": make_inn("772212345"),
        "name": "ООО «СтройМонтаж-Плюс»", "form": "ООО", "okved": "43.29 Прочие строительно-монтажные работы",
        "age_months": 40, "status": "active", "overdue": 124, "tax_debt": 910_000, "flags": ["mass_address"],
        "bki_months": 36, "title": "Стоп-факторы: автоотказ",
    },
    "liquidating": {
        "inn": make_inn("770512345"),
        "name": "ООО «Гранд-Опт»", "form": "ООО", "okved": "46.90 Неспециализированная оптовая торговля",
        "age_months": 60, "status": "liquidating", "overdue": 0, "tax_debt": 0, "flags": [], "bki_months": 50,
        "loans": [{"lender": "Банк А", "balance": 600_000, "monthly_payment": 40_000, "overdue_days": 124}],
        "title": "Компания в стадии ликвидации",
    },
    "newco": {
        "inn": make_inn("781512345"),
        "name": "ООО «Старт-Хаб»", "form": "ООО", "okved": "62.01 Разработка программного обеспечения",
        "age_months": 3, "status": "active", "overdue": 0, "tax_debt": 0, "flags": [], "bki_months": 0,
        "title": "Молодая компания (<6 мес.)",
    },
    "tight": {
        "inn": make_inn("783312345"),
        "name": "ООО «Пекарня №1»", "form": "ООО", "okved": "10.71 Производство хлеба и мучных кондитерских изделий",
        "age_months": 58, "status": "active", "overdue": 0, "tax_debt": 0, "flags": [], "bki_months": 55,
        "loans": [{"lender": "Банк Б", "balance": 250_000, "monthly_payment": 25_000, "overdue_days": 0}],
        "title": "Хороший клиент, но запрошена слишком большая сумма: встречное предложение",
    },
}
_BY_INN = {v["inn"]: v for v in DEMO_SCENARIOS.values()}


def _rng(inn: str) -> random.Random:
    return random.Random(int(hashlib.sha256(inn.encode()).hexdigest()[:12], 16))


def _profile(inn: str) -> dict:
    if inn in _BY_INN:
        return _BY_INN[inn]
    r = _rng(inn)
    is_ip = len(inn) == 12
    surnames = ["Иванов", "Петров", "Смирнов", "Кузнецов", "Попов", "Соколов", "Лебедев", "Козлов", "Новиков", "Морозов"]
    names = ["Алексей", "Дмитрий", "Сергей", "Андрей", "Максим", "Ольга", "Елена", "Наталья"]
    brands = ["Вектор", "Прогресс", "Горизонт", "Атлас", "Меридиан", "Фаворит", "Север", "Альянс", "Феникс", "Терра"]
    okveds = [
        "47.11 Розничная торговля продуктами", "56.10 Рестораны и кафе", "62.01 Разработка ПО",
        "43.21 Электромонтажные работы", "49.41 Грузоперевозки", "68.20 Аренда недвижимого имущества",
        "10.71 Производство хлеба", "96.02 Парикмахерские услуги",
    ]
    fio = f"{r.choice(surnames)} {r.choice(names)}"
    return {
        "inn": inn,
        "name": f"ИП {fio}" if is_ip else f"ООО «{r.choice(brands)}-{r.randint(1, 99)}»",
        "form": "ИП" if is_ip else "ООО",
        "okved": r.choice(okveds),
        "age_months": r.randint(8, 120),
        "status": "active",
        "overdue": r.choice([0, 0, 0, 0, 5, 14]),
        "tax_debt": r.choice([0, 0, 0, 0, 35_000]),
        "flags": [],
        "bki_months": r.randint(6, 90),
    }


def egrul_lookup(inn: str) -> dict | None:
    """Симулятор ЕГРЮЛ/ЕГРИП. None — если ИНН некорректен."""
    if not inn_is_valid(inn):
        return None
    p = _profile(inn)
    r = _rng(inn + "egrul")
    reg = date.today() - timedelta(days=int(p["age_months"] * 30.4))
    is_ip = p["form"] == "ИП"
    cities = ["г. Москва, ул. Тверская, д. 12", "г. Санкт-Петербург, Невский пр., д. 44", "г. Казань, ул. Баумана, д. 7",
              "г. Екатеринбург, ул. Малышева, д. 31", "г. Новосибирск, Красный пр., д. 25"]
    director = p["name"].replace("ИП ", "") if is_ip else f"{r.choice(['Иванов', 'Орлов', 'Белов', 'Громов'])} {r.choice(['Пётр Сергеевич', 'Анна Викторовна', 'Игорь Олегович'])}"
    return {
        "inn": inn,
        "ogrn": ("3" if is_ip else "1") + "".join(str(r.randint(0, 9)) for _ in range(14 if is_ip else 12)),
        "kpp": None if is_ip else f"{inn[:4]}01001",
        "name": p["name"], "legal_form": p["form"], "status": p["status"], "okved": p["okved"],
        "reg_date": reg.isoformat(), "age_months": p["age_months"],
        "address": r.choice(cities), "director": director,
        "charter_capital": None if is_ip else r.choice([10_000, 50_000, 100_000]),
        "source": "ЕГРЮЛ/ЕГРИП (симулятор)",
    }


def bki_lookup(inn: str) -> dict:
    """Симулятор бюро кредитных историй."""
    p = _profile(inn)
    r = _rng(inn + "bki")
    months = p["bki_months"]
    loans = [dict(l) for l in p["loans"]] if "loans" in p else []
    if "loans" not in p and months >= 6:
        for i in range(r.choice([0, 1, 1, 2])):
            loans.append({
                "lender": r.choice(["Банк А", "Банк Б", "МФК В"]),
                "balance": r.randint(150, 900) * 1000,
                "monthly_payment": r.randint(12, 55) * 1000,
                "overdue_days": p["overdue"] if i == 0 else 0,
            })
        if not loans and p["overdue"]:
            loans.append({"lender": "Банк А", "balance": 400_000, "monthly_payment": 21_000, "overdue_days": p["overdue"]})
    return {
        "has_history": months > 0,
        "history_months": months,
        "active_loans": loans,
        "max_overdue_days_24m": max([p["overdue"]] + [l["overdue_days"] for l in loans]),
        "inquiries_6m": r.randint(0, 3),
        "bureau_score": 0 if months == 0 else max(300, min(850, 760 - p["overdue"] * 2 - r.randint(0, 40))),
        "source": "БКИ (симулятор)",
    }


def pb_lookup(inn: str) -> dict:
    """Симулятор сервиса ФНС «Прозрачный бизнес»."""
    p = _profile(inn)
    r = _rng(inn + "pb")
    is_ip = p["form"] == "ИП"
    return {
        "tax_debt": p["tax_debt"],
        "employees": r.randint(0, 3) if is_ip else r.randint(4, 60),
        "avg_salary": r.randint(38, 85) * 1000,
        "tax_regime": r.choice(["УСН 6%", "УСН 15%"]) if is_ip else r.choice(["УСН 15%", "ОСНО", "УСН 6%"]),
        "risk_flags": p["flags"],  # mass_address | mass_director | nonfiling
        "arbitration_defendant": 0 if p["overdue"] < 90 else 2,
        "source": "ФНС «Прозрачный бизнес» (симулятор)",
    }
