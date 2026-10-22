"""Каталог демонстрационных кредитных продуктов (загружается из config_data/products.json).

Условия синтетические, не являются реальными тарифами банка.
"""
from .catalog import products_config

DISCLAIMER: str = products_config()["disclaimer"]
DOC_KINDS: dict[str, str] = products_config()["doc_kinds"]
PRODUCTS: dict[str, dict] = {p["code"]: p for p in products_config()["products"]}

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


def required_docs(code: str, has_collateral: bool) -> list[str]:
    return list(PRODUCTS[code]["docs"]) + (["collateral_doc"] if has_collateral else [])
