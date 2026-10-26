# Creditfy — инструкция по проекту

Язык общения — русский. Перед изменениями читать README.md, docs/architecture.md, docs/tz-extract.txt.

Стек: React/TypeScript/Vite, FastAPI/SQLAlchemy, PostgreSQL в Docker; SQLite для локальной разработки. Клиентский мастер — frontend/src/pages/Wizard.tsx. API-контракты — schemas.py, routers/api.py, frontend/src/api/types.ts; браузерное зеркало — frontend/src/mock/engine.ts.

Ограничения: только синтетические данные, без обязательных платных API и корпоративных систем. Скоринг отдельно от решения; генеративная модель в MVP выключена. Все результаты воспроизводимы правилами. Деплой и изменение внешних прав выполнять только в рамках указаний владельца.

Проверки: backend/.venv/bin/python -m pytest -q из backend; npm test && npm run build из frontend; docker compose config; e2e_live.py через nginx. После изменения маршрутов: PYTHONPATH=. python scripts/export_docs.py.

Регистрация создаёт только client. Банковские роли — фиксированные тестовые аккаунты. Не отключать current_user/client_only/bank_only/underwriter_only. Не хранить реальные секреты в Git. В production нужен случайный JWT_SECRET и постоянная БД.

Каталоги backend/app/config_data и frontend/src/config должны совпадать. Овердрафт информационный; не считать по нему аннуитет и не создавать новые заявки. Исторические заявки и условия предложений сохранять.

Конвейер: один API worker, ограниченные повторы при сбоях, восстановление активных стадий при старте. Docker — главный воспроизводимый способ сдачи. Проверенные результаты релиза — docs/RELEASE.md.
