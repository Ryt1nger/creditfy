import logging

from ..config import settings
from .base import LLMProvider
from .stub import StubProvider

log = logging.getLogger("creditfy.ai")
_provider: LLMProvider | None = None

PLANNED_FEATURES = [
    {"key": "recommend", "title": "Подбор продукта по описанию задачи", "where": "клиент · шаг 1 заявки"},
    {"key": "summary", "title": "Сводка по заявке для кредитного специалиста", "where": "банк · карточка заявки"},
    {"key": "explain", "title": "Понятное объяснение статуса и решения", "where": "клиент · карточка заявки"},
    {"key": "extract", "title": "Распознавание загруженных документов", "where": "клиент и банк · документы"},
]


def get_provider() -> LLMProvider:
    global _provider
    if _provider is None:
        if settings.llm_provider == "deepseek":
            log.warning("LLM_PROVIDER=deepseek, но адаптер ещё не реализован — работает заглушка")
        _provider = StubProvider()
    return _provider


def provider_status() -> dict:
    p = get_provider()
    return {
        "provider": p.name,
        "is_stub": p.is_stub,
        "requested": settings.llm_provider,
        "planned_model": "DeepSeek (open weights, локальный запуск)",
        "features": PLANNED_FEATURES,
    }
