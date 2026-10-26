"""Выгрузка OpenAPI и Postman-коллекции из живого приложения: PYTHONPATH=. python scripts/export_docs.py  (из папки backend)."""
import json
import os
import tempfile
from pathlib import Path

os.environ.setdefault("DATABASE_URL", f"sqlite:///{tempfile.mkdtemp()}/x.db")
os.environ["SEED_DEMO"] = "0"

from app.main import app  # noqa: E402

DOCS = Path(__file__).resolve().parents[2] / "docs"
BODIES = {
    "POST /api/auth/demo": {},
    "POST /api/auth/register": {"name": "Новый клиент", "email": "client@example.test", "password": "test-password", "role": "client"},
    "POST /api/auth/login": {"email": "ivan@demo.ru", "password": "demo123"},
    "POST /api/intake/start": {"text": "Нужно 1,5 млн на закупку товара к сезону, на 2 года"},
    "POST /api/intake/{sid}/answer": {"field": "legal_form", "value": "ООО"},
    "POST /api/intake/{sid}/application": {"product_code": "working_capital"},
    "POST /api/applications/draft": {"product_code": "working_capital", "amount": 2000000, "term_months": 24},
    "PATCH /api/applications/{app_id}": {"company_inn": "7804123453", "contact": {"name": "Иванов Иван Иванович", "phone": "+7 900 111-22-33", "role": "owner"}, "wizard_step": 3},
    "PATCH /api/extractions/{ext_id}": {"value": 750000},
}


def main() -> None:
    spec = app.openapi()
    spec["info"]["description"] = ("Сквозной кредитный путь малого бизнеса: квиз → подбор → заявка → документы → проверки → скоринг → решение → "
                                   "договор → выдача. Все данные синтетические; условия продуктов демонстрационные.")
    (DOCS / "openapi.json").write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
    groups: dict[str, list] = {}
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            raw = path.replace("{", "{{").replace("}", "}}")
            name = f"{method.upper()} {path}"
            item = {"name": name, "request": {"method": method.upper(), "header": [{"key": "Content-Type", "value": "application/json"}],
                    "url": {"raw": "{{base}}" + raw, "host": ["{{base}}"], "path": [p for p in raw.strip("/").split("/")]}}}
            if path not in ("/api/auth/login", "/api/auth/register", "/api/auth/demo", "/api/health", "/api/auth/demo-accounts", "/api/ai/status") and not path.startswith("/api/demo/documents"):
                item["request"]["header"].append({"key": "Authorization", "value": "Bearer {{token}}"})
            if name in BODIES:
                item["request"]["body"] = {"mode": "raw", "raw": json.dumps(BODIES[name], ensure_ascii=False, indent=2)}
            groups.setdefault((op.get("tags") or ["other"])[0], []).append(item)
    coll = {"info": {"name": "Кредитный кабинет предпринимателя (демо)", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
                     "description": "1) POST /api/auth/login, 2) положите token в переменную {{token}}. Пароль демо-пользователей: demo123. "
                                    "Квиз: intake/start → intake/{id}/answer → intake/{id}/recommend → intake/{id}/application. "
                                    "Документы: GET /api/demo/documents/{inn}/{kind}.{fmt} → POST /api/applications/{id}/documents (multipart)."},
            "item": [{"name": g, "item": its} for g, its in sorted(groups.items())],
            "variable": [{"key": "base", "value": "http://localhost:8000"}, {"key": "token", "value": ""}]}
    (DOCS / "api" / "creditfy.postman_collection.json").write_text(json.dumps(coll, ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(spec["paths"]), "путей;", sum(len(v) for v in groups.values()), "запросов")


if __name__ == "__main__":
    main()
