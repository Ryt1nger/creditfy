import logging

from ..config import settings
from .base import LLMProvider
from .llm import llm  # noqa: F401
from .stub import StubProvider

log = logging.getLogger("creditfy.ai")
_provider: LLMProvider | None = None

FEATURES = [
    {"key": "intake", "title": "Формулировка вопросов квиза и один уточняющий вопрос", "where": "клиент · «Опишите задачу»"},
    {"key": "parse", "title": "Подстраховка разбора свободного текста, если правила не всё нашли", "where": "клиент · «Опишите задачу»"},
    {"key": "extract", "title": "Запасной разбор документа, если парсер не нашёл чисел", "where": "клиент · документы"},
    {"key": "summary", "title": "Сводка по заявке для кредитного специалиста (шаблон, вторая очередь)", "where": "банк · карточка заявки"},
]


def get_provider() -> LLMProvider:
    """Шаблонные тексты для сводки и статусов (вторая очередь ИИ) — пока детерминированная заглушка."""
    global _provider
    if _provider is None:
        _provider = StubProvider()
    return _provider


def provider_status() -> dict:
    return {"provider": "rules", "is_stub": True, "mode": "rules", "generative_model_active": False,
            "llm_enabled": False, "features": ["Подбор продуктов", "Сводка заявки", "Разбор документов"]}
