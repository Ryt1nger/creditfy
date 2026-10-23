"""Помощник «Нужна помощь?»: готовые демо-ответы по ключевым словам (config_data/faq.json), без ИИ.

Зеркало — frontend/src/mock/assistant.ts; общие примеры проверяются тестами обеих сторон.
"""
import json
import re

from .catalog import DATA_DIR
from .products import DOC_KINDS, PRODUCTS

FAQ = json.loads((DATA_DIR / "faq.json").read_text(encoding="utf-8"))


def _rub(n: int) -> str:
    return f"{n / 1_000_000:g}".replace(".", ",") + " млн ₽" if n >= 1_000_000 else f"{n // 1000} тыс. ₽"


def _term(p: dict) -> str:
    return f"{p['min_term']} мес." if p["min_term"] == p["max_term"] else f"{p['min_term']}–{p['max_term']} мес."


def _fill(text: str) -> str:
    ps = list(PRODUCTS.values())
    vals = {
        "products": "\n".join(f"• {p['name']} — {p['tagline'].lower()}" for p in ps),
        "rates": "\n".join(f"• {p['name']}: от {str(p['base_rate']).replace('.', ',')}%" for p in ps),
        "limits": "\n".join(f"• {p['name']}: {_rub(p['min_amount'])}–{_rub(p['max_amount'])}, срок {_term(p)}" for p in ps),
        "docs": "\n".join(f"• {p['name']}: {', '.join(DOC_KINDS[d].split(' за ')[0].lower() for d in p['docs'])}" for p in ps),
    }
    return re.sub(r"\{(\w+)\}", lambda m: vals.get(m.group(1), m.group(0)), text)


def _has(t: str, k: str) -> bool:
    """Короткие ключи («ии», «бот») — только целым словом, чтобы «решении» не считалось вопросом про ИИ."""
    return re.search(rf"(?<![а-яa-z]){re.escape(k)}(?![а-яa-z])", t) is not None if len(k) <= 3 else k in t


def ask(text: str) -> dict:
    t = (text or "").lower().replace("ё", "е")
    best, best_hits = None, 0
    for it in FAQ["items"]:
        hits = sum(1 for k in it["keywords"] if _has(t, k.replace("ё", "е")))
        if hits > best_hits:
            best, best_hits = it, hits
    if best is None:
        return {"matched": False, "intent": None, "answer": FAQ["fallback"]["answer"], "suggestions": FAQ["fallback"]["suggestions"],
                "source": "demo", "is_demo": True}
    others = [i["question"] for i in FAQ["items"] if i is not best][:4]
    return {"matched": True, "intent": best["id"], "answer": _fill(best["answer"]), "suggestions": others, "source": "demo", "is_demo": True}
