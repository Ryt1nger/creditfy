# Сторонние компоненты

Все компоненты с открытыми лицензиями; платных сервисов, API и закрытых данных нет.

| Компонент | Назначение | Лицензия |
|---|---|---|
| FastAPI, Starlette, Uvicorn | веб-API | MIT / BSD-3 |
| SQLAlchemy | ORM | MIT |
| Pydantic | валидация | MIT |
| PyJWT | токены доступа | MIT |
| python-multipart | загрузка файлов | Apache-2.0 |
| psycopg 3 | драйвер PostgreSQL | LGPL-3.0 |
| PostgreSQL 16 | БД (в Docker) | PostgreSQL License |
| httpx | клиент к локальной модели (Ollama) и тесты | BSD-3 |
| pytest | тесты | MIT |
| ReportLab | генерация синтетических PDF для демо | BSD |
| openpyxl | чтение/генерация XLSX | MIT |
| pypdf | чтение текстовых PDF | BSD-3 |
| DejaVu Sans (fonts-dejavu-core, в Docker-образе API) | кириллица в синтетических PDF | Bitstream Vera / Public Domain |
| Ollama | локальный запуск модели (опциональный контейнер `--profile llm`) | MIT |
| DeepSeek-R1-Distill-Qwen-1.5B (`deepseek-r1:1.5b`) | локальная модель с открытыми весами, **выключена по умолчанию** (`LLM_ENABLED=0`) | MIT (база Qwen2.5 — Apache-2.0) |
| React, React DOM | интерфейс | MIT |
| React Router | маршрутизация | MIT |
| TanStack Query | кэш запросов | MIT |
| Vite, @vitejs/plugin-react, Vitest | сборка и тесты | MIT |
| TypeScript | типизация | Apache-2.0 |
| Inter, Manrope, Montserrat (@fontsource-variable/*) | шрифты интерфейса | SIL OFL 1.1 |
| nginx | раздача фронтенда (в Docker) | BSD-2 |

## Смоделированные интеграции
| Источник | Что симулируется | Где |
|---|---|---|
| ЕГРЮЛ / ЕГРИП | статус, возраст, ОКВЭД, руководитель | `backend/app/integrations/registry_mocks.py` |
| Бюро кредитных историй | история, просрочки, действующие кредиты | там же |
| ФНС «Прозрачный бизнес» | налоговая задолженность, штат, риск-признаки | там же |
| Электронная подпись и выдача средств | кнопка «Подписать» + запись о займе | `routers/api.py::sign_loan` |
| ИИ-модель | по умолчанию выключена; опционально локальный DeepSeek-R1 distill (открытые веса) через Ollama, только формулировка вопросов и запасной разбор | `backend/app/ai/llm.py` |
| Распознавание документов | парсеры текстовых PDF/XLSX/CSV; OCR сканов нет; в mock-режиме браузера — имитация | `backend/app/documents/`, `frontend/src/mock/docs.ts` |
| Каталог продуктов | выдуманные демо-условия, **не реальные предложения банка** | `backend/app/config_data/products.json` |
| Синтетические документы | комплекты PDF/XLSX/CSV под демо-ИНН (один с расхождением) | `backend/app/documents/samples.py` |

Датасетов нет, обучение моделей не выполнялось: скоринг — прозрачная балльная карта (`services/scoring.py`). Визуальный стиль вдохновлён
фирменным стилем Альфа-Банка (цвета, скругления); логотипы и шрифт банка не используются.


## Публичные условия продуктов, выпуск 26.10.2026
Источники и исследовательская схема: docs/product-research.json. Нормализованный исполняемый каталог — backend/app/config_data/products.json и зеркало frontend/src/config/products.json. Ставки «от» не являются персональной офертой. Скоринг и надбавки — учебная политика Creditfy. Генеративная модель не используется в проверяемом релизе.
