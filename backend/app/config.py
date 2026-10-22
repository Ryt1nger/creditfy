"""Конфигурация из переменных окружения. Секретов в коде нет — только dev-значения по умолчанию."""
import os


class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data/creditfy.db")
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-only-secret-change-me-0123456789abcdef")
    jwt_ttl_hours: int = int(os.getenv("JWT_TTL_HOURS", "12"))
    # Пауза между шагами конвейера: чтобы статус на экране менялся «вживую». В тестах = 0.
    pipeline_step_delay: float = float(os.getenv("PIPELINE_STEP_DELAY", "0.9"))
    upload_dir: str = os.getenv("UPLOAD_DIR", "./data/uploads")
    max_upload_bytes: int = int(os.getenv("MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))
    seed_demo: bool = os.getenv("SEED_DEMO", "1") == "1"
    cors_origins: list[str] = [
        o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:8080").split(",") if o.strip()
    ]
    # Локальная модель с открытыми весами (Ollama, OpenAI-совместимый адрес). По умолчанию выключена:
    # всё работает на правилах и банке вопросов, модель лишь формулирует вопросы и подстраховывает разбор.
    llm_enabled: bool = os.getenv("LLM_ENABLED", "0").lower() in ("1", "true", "yes")
    llm_base_url: str = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")
    llm_model: str = os.getenv("LLM_MODEL", "deepseek-r1:1.5b")
    llm_max_calls: int = int(os.getenv("LLM_MAX_CALLS", "3"))  # на одну сессию квиза / одну заявку
    llm_timeout: float = float(os.getenv("LLM_TIMEOUT", "8"))


settings = Settings()
