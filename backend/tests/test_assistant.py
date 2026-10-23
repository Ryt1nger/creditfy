"""Помощник: готовые демо-ответы без ИИ (общие кейсы с фронтендом)."""
import json

import pytest

from app.assistant import ask
from app.catalog import DATA_DIR

CASES = json.loads((DATA_DIR / "assistant_cases.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["text"][:30] for c in CASES])
def test_intents(case):
    assert ask(case["text"])["intent"] == case["intent"]


def test_answer_is_demo_and_built_from_catalog(client, ivan):
    r = client.post("/api/assistant/ask", json={"text": "Какая ставка у овердрафта?"}, headers=ivan).json()
    assert r["is_demo"] and r["source"] == "demo" and r["matched"] and "19,5%" in r["answer"]
    miss = client.post("/api/assistant/ask", json={"text": "абракадабра"}, headers=ivan).json()
    assert not miss["matched"] and miss["suggestions"]
    assert client.post("/api/assistant/ask", json={"text": "x"}).status_code == 401
