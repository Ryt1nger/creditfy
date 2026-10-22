"""Каталог демонстрационных кредитных продуктов. Условия синтетические, не являются реальными тарифами банка."""

DOC_KINDS = {
    "bank_statement": "Выписка по расчётному счёту за 12 месяцев",
    "tax_return": "Налоговая декларация или отчётность за последний год",
    "business_plan": "Бизнес-план проекта",
    "invoice": "Счёт или договор на покупку",
    "collateral_doc": "Документы на предмет залога",
}

PRODUCTS: dict[str, dict] = {
    "working_capital": {
        "code": "working_capital",
        "name": "Кредит на оборотные средства",
        "tagline": "Закупка товара, зарплаты, текущие расходы",
        "min_amount": 300_000, "max_amount": 10_000_000,
        "min_term": 6, "max_term": 36,
        "base_rate": 17.5, "fee_pct": 0.5, "auto_limit": 3_000_000, "allows_collateral": True,
        "docs": ["bank_statement", "tax_return"],
        "keywords": ["оборот", "закупк", "товар", "зарплат", "сырь", "пополн", "касс", "сезон", "аренд", "реклам"],
    },
    "investment": {
        "code": "investment",
        "name": "Инвестиционный кредит",
        "tagline": "Развитие: новая точка, ремонт, расширение производства",
        "min_amount": 1_000_000, "max_amount": 30_000_000,
        "min_term": 12, "max_term": 84,
        "base_rate": 16.9, "fee_pct": 0.5, "auto_limit": 5_000_000, "allows_collateral": True,
        "docs": ["bank_statement", "tax_return", "business_plan"],
        "keywords": ["открыть", "открыт", "расшир", "ремонт", "строител", "новый", "филиал", "точк", "помещени", "развит", "запуск"],
    },
    "equipment": {
        "code": "equipment",
        "name": "Кредит на оборудование и транспорт",
        "tagline": "Покупка станков, техники, автомобилей",
        "min_amount": 500_000, "max_amount": 15_000_000,
        "min_term": 12, "max_term": 60,
        "base_rate": 16.0, "fee_pct": 0.5, "auto_limit": 4_000_000, "allows_collateral": True,
        "docs": ["bank_statement", "tax_return", "invoice"],
        "keywords": ["оборудован", "станок", "техник", "автомоб", "грузовик", "транспорт", "печь", "холодил", "трактор", "купить"],
    },
    "overdraft": {
        "code": "overdraft",
        "name": "Овердрафт",
        "tagline": "Быстро закрыть кассовый разрыв",
        "min_amount": 100_000, "max_amount": 5_000_000,
        "min_term": 12, "max_term": 12,
        "base_rate": 19.5, "fee_pct": 0.0, "auto_limit": 1_500_000, "allows_collateral": False,
        "docs": ["bank_statement", "tax_return"],
        "keywords": ["разрыв", "срочно", "быстро", "краткосроч", "оплат", "поставщик", "задержк", "овердрафт"],
    },
}

GRADE_PREMIUM = {"A": 0.0, "B": 1.5, "C": 3.0, "D": 5.0}
REJECT_REASONS = {
    "insufficient_capacity": "Недостаточная платёжеспособность для запрошенных условий",
    "credit_history": "Негативная кредитная история",
    "tax_debt": "Задолженность по налогам и сборам",
    "company_status": "Статус компании не позволяет выдать финансирование",
    "company_age": "Срок ведения бизнеса меньше минимально допустимого",
    "high_risk": "Высокий уровень кредитного риска",
    "policy": "Не соответствует кредитной политике",
}
