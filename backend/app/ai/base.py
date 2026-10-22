"""Контракт ИИ-слоя. Всё, что зовёт ИИ, идёт ТОЛЬКО через этот интерфейс.

Сейчас подключена заглушка (StubProvider). Следующий шаг — DeepSeek (open-weights, локально),
см. docs/ai-integration.md. Приложение полностью работоспособно и без ИИ: решения по заявке принимают
правила и скоринг, ИИ лишь помогает формулировками и подсказками.
"""
from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class ProductRecommendation:
    code: str
    score: float
    reason: str


@dataclass
class AiText:
    text: str
    source: str  # "stub" | "deepseek"
    is_stub: bool = True


@dataclass
class DocExtraction:
    status: str  # "not_available" | "ok"
    fields: dict = field(default_factory=dict)
    note: str = ""


class LLMProvider(Protocol):
    name: str
    is_stub: bool

    def recommend_products(self, need_text: str, amount: int | None, products: list[dict]) -> list[ProductRecommendation]: ...

    def summarize_for_underwriter(self, ctx: dict) -> AiText: ...

    def explain_status_for_client(self, ctx: dict) -> AiText: ...

    def extract_document(self, kind: str, filename: str, content: bytes) -> DocExtraction: ...
