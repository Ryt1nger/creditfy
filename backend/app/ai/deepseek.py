"""ПРОМЕЖУТОК (placeholder) под DeepSeek.

Здесь будет адаптер к open-weights модели DeepSeek, развёрнутой ЛОКАЛЬНО (Ollama / vLLM,
OpenAI-совместимый /v1/chat/completions), потому что ТЗ запрещает платные API и модели с закрытыми весами.

Пока класс намеренно не реализован: get_provider() при LLM_PROVIDER=deepseek логирует предупреждение
и откатывается на заглушку, чтобы продукт не ломался. План интеграции и промпты — docs/ai-integration.md.

TODO при подключении:
  1. реализовать _chat(messages) через httpx к settings.llm_base_url, таймаут 20 с, 1 повтор;
  2. recommend_products / summarize_for_underwriter / explain_status_for_client — промпты из docs;
  3. extract_document — OCR (локальный, напр. Tesseract) -> текст -> DeepSeek -> JSON по схеме;
  4. ответы валидировать pydantic-схемой; при ошибке/таймауте — падать на StubProvider;
  5. в LLM уходят ТОЛЬКО обезличенные признаки заявки (без ИНН, ФИО, телефонов).
"""
from .base import AiText, DocExtraction, ProductRecommendation  # noqa: F401


class DeepSeekProvider:
    name = "deepseek"
    is_stub = False

    def __init__(self, base_url: str, model: str):
        self.base_url, self.model = base_url, model

    def recommend_products(self, need_text, amount, products):
        raise NotImplementedError("DeepSeek-адаптер ещё не подключён")

    def summarize_for_underwriter(self, ctx):
        raise NotImplementedError("DeepSeek-адаптер ещё не подключён")

    def explain_status_for_client(self, ctx):
        raise NotImplementedError("DeepSeek-адаптер ещё не подключён")

    def extract_document(self, kind, filename, content):
        raise NotImplementedError("DeepSeek-адаптер ещё не подключён")
