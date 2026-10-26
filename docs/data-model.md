> Актуальное состояние сдаваемой версии: [RELEASE.md](RELEASE.md) и корневой README. Ниже — подробности исходной реализации; старые примеры ставок не являются текущими публичными условиями.

# Модель данных

```mermaid
erDiagram
    USER ||--o{ COMPANY : владеет
    USER ||--o{ APPLICATION : подаёт
    COMPANY ||--o{ APPLICATION : для
    APPLICATION ||--o{ DOCUMENT : содержит
    APPLICATION ||--o{ INFO_REQUEST : запросы
    APPLICATION ||--o{ EVENT : журнал
    APPLICATION ||--o{ ENRICHMENT : данные_реестров
    APPLICATION ||--o{ SCORE_RESULT : скоринг
    APPLICATION ||--o{ OFFER : предложения
    APPLICATION ||--o| LOAN : выданный_кредит
    USER ||--o{ NOTIFICATION : уведомления
    USER ||--o{ INTAKE_SESSION : проходит_квиз
    INTAKE_SESSION ||--o{ INTAKE_TURN : вопросы_и_ответы
    INTAKE_SESSION |o--o| APPLICATION : порождает_черновик
    INTAKE_SESSION ||--o{ AI_CALL : бюджет_модели
    DOCUMENT ||--o{ DOC_EXTRACTION : извлечённые_значения
    APPLICATION ||--o{ DOC_EXTRACTION : значения_заявки
    USER { int id string email string role "client|operator|underwriter" }
    APPLICATION { int id string number string status int company_id "NULL до шага 2 мастера" int amount int term_months json financials json contact "name phone role" int wizard_step "1..5, для Продолжить с шага N" string risk_grade int score string decision string resume_to int version }
    DOCUMENT { int id string kind string status "uploaded|verified|rejected" string sha256 json extracted "status method note" }
    DOC_EXTRACTION { int id string field "revenue_year|net_profit_year|monthly_turnover|monthly_obligations|purchase_price" int value int original_value string source "parser_pdf|parser_xlsx|parser_csv|ai|mock" string source_label float confidence string status "ok|edited|conflict|confirmed" }
    INTAKE_SESSION { int id string text json extracted "поле: значение и источник" json answers json portrait json recommendations string status "questions|ready|applied" int ai_calls_used int application_id }
    INTAKE_TURN { int id string field string kind "question|clarify|edit" string question json options string source "bank|ai" json answer }
    AI_CALL { int id string purpose "parse|question|clarify|extract" string model string status "ok|invalid|timeout|error|cached" int latency_ms int prompt_chars }
    CATALOG_ITEM { string kind "product|field" string code int version json data }
    INFO_REQUEST { int id string created_by json items string status }
    EVENT { int id datetime ts string kind string actor bool client_visible string from_status string to_status }
    ENRICHMENT { string source "egrul|bki|pb" json payload }
    SCORE_RESULT { int score string grade float pd float dscr string route json factors json stop_factors json flags string model_version }
    OFFER { string kind "initial|counter" int amount int term_months float rate int monthly_payment string status datetime valid_until }
```

Принципы:
* **Один журнал `EVENT`** — и таймлайн для клиента (`client_visible`), и аудит для банка. Записи не изменяются.
* **Данные не теряются между этапами:** данные заявки, ответы реестров, каждый расчёт скоринга и каждое предложение хранятся отдельными строками; пересчёт скоринга добавляет запись, а не перезаписывает.
* `APPLICATION.resume_to` помнит, куда вернуть заявку после ответа клиента (полная проверка или обратно специалисту).
* `APPLICATION.version` растёт на каждом переходе статуса; решения проверяют ожидаемый статус, поэтому двойной клик или параллельное решение даёт `409`.
* **Квиз хранится целиком:** `INTAKE_SESSION` помнит исходный текст, что из него поняли правила (`extracted`, источник `text|ai`), ответы карточками (`answers`) и портрет; `INTAKE_TURN` — каждый показанный вопрос, откуда он взят (`bank` или `ai`) и ответ клиента.
* **`AI_CALL` — журнал и бюджет модели:** по числу обращений считается лимит `LLM_MAX_CALLS` на сессию квиза или заявку. Текст запроса не сохраняется — только цель, статус, задержка и размер.
* **`DOC_EXTRACTION` — «значение + подпись источника + статус».** Правка клиента меняет `value`, но `original_value` остаётся; `conflict` ставится правилом «оборот×12 против выручки > 35%», `confirmed` — явным подтверждением клиента.
* **`CATALOG_ITEM`** — копия конфигурации (`backend/app/config_data/*.json`) с версией: видно, по какому каталогу продуктов и реестру полей работал квиз.
* `APPLICATION.wizard_step` — шаг мастера; `company_id` пуст, пока клиент не ввёл ИНН (черновик создаётся сразу после подбора).
* Файлы лежат вне БД под случайными именами; в БД — имя, размер и SHA-256.
