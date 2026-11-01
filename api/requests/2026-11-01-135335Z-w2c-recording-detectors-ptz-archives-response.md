# Ответ команде w2c: запись, детекторы, PTZ, архивы

Ответ в работе, от 2026-11-01 · на запрос [2026-11-01-135335Z-w2c-recording-detectors-ptz-archives-request.md](2026-11-01-135335Z-w2c-recording-detectors-ptz-archives-request.md) · пункты — по его нумерации.

## П. 15. Одиночные правки и откат цепочкой — сделано, `5cb5d27`

`POST`, `PATCH`, `DELETE /devices`, `/devices/update`, `/objects/delete` — операция: `Operation` с `single: true`, `state: done`. Список — `GET /operations`, новые сверху. Показ — «Журнал» → «Операции», одиночные вместе с групповыми, у строки «Отменить». Шаг откатывается по значениям своих полей, 50 последних, 7 суток.
