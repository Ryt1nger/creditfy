# Диаграмма состояний заявки

Переходы разрешены только в `backend/app/services/workflow.py::TRANSITIONS`; любой другой переход отвечает `409`.

```mermaid
stateDiagram-v2
    [*] --> DRAFT: клиент создаёт черновик
    DRAFT --> SUBMITTED: отправить
    DRAFT --> CANCELLED
    SUBMITTED --> COMPLETENESS_CHECK: авто
    COMPLETENESS_CHECK --> NEEDS_INFO: не хватает данных или документов
    COMPLETENESS_CHECK --> ENRICHMENT: данные полные
    NEEDS_INFO --> COMPLETENESS_CHECK: клиент ответил (запрос системы)
    NEEDS_INFO --> MANUAL_REVIEW: клиент ответил (запрос специалиста)
    NEEDS_INFO --> CANCELLED
    ENRICHMENT --> SCORING: ЕГРЮЛ + БКИ + ФНС получены
    SCORING --> OFFER_READY: автоодобрение или встречное предложение
    SCORING --> MANUAL_REVIEW: пограничный случай
    SCORING --> REJECTED: стоп-фактор или класс E
    MANUAL_REVIEW --> OFFER_READY: решение андеррайтера
    MANUAL_REVIEW --> REJECTED: отказ андеррайтера
    MANUAL_REVIEW --> NEEDS_INFO: запрос уточнений
    OFFER_READY --> SIGNING: клиент принял
    OFFER_READY --> DECLINED_BY_CLIENT
    OFFER_READY --> EXPIRED: 14 дней
    SIGNING --> DISBURSED: подписано, деньги выданы
    REJECTED --> [*]
    DISBURSED --> [*]
```

| Статус | Что видит клиент | Кто действует |
|---|---|---|
| DRAFT | Черновик | клиент |
| SUBMITTED, COMPLETENESS_CHECK, ENRICHMENT, SCORING | «Проверяем…» (бегущий прогресс) | система |
| NEEDS_INFO | Форма ответа на запрос | клиент |
| MANUAL_REVIEW | «Рассматривает специалист» | андеррайтер |
| OFFER_READY | Карточка предложения | клиент |
| SIGNING | Договор, подпись | клиент |
| DISBURSED / REJECTED / DECLINED_BY_CLIENT / EXPIRED / CANCELLED | Итог и причина | — |
