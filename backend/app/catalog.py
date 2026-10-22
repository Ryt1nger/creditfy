"""Конфигурация продукта: каталог кредитов и реестр полей квиза.

Источник правды — JSON-файлы в app/config_data (их же копия лежит во frontend/src/config для демо-режима;
равенство проверяет тест). При старте содержимое загружается в таблицу catalog_items, чтобы банк видел,
какая версия конфигурации действовала на момент заявки.
"""
import json
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).parent / "config_data"


@lru_cache
def products_config() -> dict:
    return json.loads((DATA_DIR / "products.json").read_text(encoding="utf-8"))


@lru_cache
def fields_config() -> dict:
    return json.loads((DATA_DIR / "fields.json").read_text(encoding="utf-8"))


def field_registry() -> dict[str, dict]:
    return {f["key"]: f for f in fields_config()["fields"]}


def load_into_db(db) -> None:
    """Синхронизирует каталог и реестр полей в БД (upsert по kind+code)."""
    from sqlalchemy import select

    from .models import CatalogItem

    rows = [("product", p["code"], p, products_config()["version"]) for p in products_config()["products"]]
    rows += [("field", f["key"], f, fields_config()["version"]) for f in fields_config()["fields"]]
    existing = {(c.kind, c.code): c for c in db.scalars(select(CatalogItem))}
    for kind, code, data, version in rows:
        item = existing.get((kind, code))
        if item is None:
            db.add(CatalogItem(kind=kind, code=code, data=data, version=version))
        elif item.data != data or item.version != version:
            item.data, item.version = data, version
    db.commit()
