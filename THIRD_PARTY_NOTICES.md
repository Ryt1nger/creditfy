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
| pytest, httpx | тесты | MIT / BSD-3 |
| React, React DOM | интерфейс | MIT |
| React Router | маршрутизация | MIT |
| TanStack Query | кэш запросов | MIT |
| Vite, @vitejs/plugin-react, Vitest | сборка и тесты | MIT |
| TypeScript | типизация | Apache-2.0 |
| Inter (@fontsource-variable/inter) | шрифт | SIL OFL 1.1 |
| nginx | раздача фронтенда (в Docker) | BSD-2 |

## Смоделированные интеграции
| Источник | Что симулируется | Где |
|---|---|---|
| ЕГРЮЛ / ЕГРИП | статус, возраст, ОКВЭД, руководитель | `backend/app/integrations/registry_mocks.py` |
| Бюро кредитных историй | история, просрочки, действующие кредиты | там же |
| ФНС «Прозрачный бизнес» | налоговая задолженность, штат, риск-признаки | там же |
| Электронная подпись и выдача средств | кнопка «Подписать» + запись о займе | `routers/api.py::sign_loan` |
| ИИ-модель | заглушка по шаблонам; позже DeepSeek (open weights) | `backend/app/ai/` |

Датасетов и обученных моделей нет: скоринг — прозрачная балльная карта (`services/scoring.py`). Визуальный стиль вдохновлён
фирменным стилем Альфа-Банка (цвета, скругления); логотипы и шрифт банка не используются.
