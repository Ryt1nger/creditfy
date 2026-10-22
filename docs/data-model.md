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
    USER { int id string email string role "client|operator|underwriter" }
    APPLICATION { int id string number string status int amount int term_months json financials json contact string risk_grade int score string decision string resume_to int version }
    DOCUMENT { int id string kind string status "uploaded|verified|rejected" string sha256 json extracted }
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
* Файлы лежат вне БД под случайными именами; в БД — имя, размер и SHA-256.
