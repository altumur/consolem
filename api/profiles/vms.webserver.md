<!-- Собрано tools/build_api.py из api/profiles/vms.webserver.json — руками не править -->
# `vms.webserver/1` — Веб-сервер и RTSP-сервер

Версия 1.0 · ведёт: mockup · смотрят правку: w2c

Использует: —

Виды эталонного набора: `server`.

## Свойства

| Свойство | Тип | Смысл | С версии |
|---|---|---|---|
| `webServer` | object | Веб-сервер и RTSP-сервер (`WebServerSettings`): `enabled`, `httpPort`, `httpsPort`, `urlPrefix`, `cors`, `recompress`, `rtspPort`, `rtspHttpPort`. Поля нет — умолчание (как в Axxon One 3.0: да, 80, 443, `/`, нет, нет, 554, 8554); в ответе — все поля. Порты разные и вне `webReservedPorts` (`422 PORT_TAKEN`) | 1.0 |

## Состояние (`status.observed`)

| Свойство | Тип | Смысл | С версии |
|---|---|---|---|
| `webCertificate` | object \| null | Сертификат HTTPS, который хранит сервер: кому и кем выдан, срок, имена, wildcard, цепочка. Ключа здесь нет. `null` — сертификата нет, только HTTP | 1.0 |
| `webReservedPorts` | object | Порты видео для браузера: 9001 и по одному на ядро процессора | 1.0 |

## Изменения

| Версия | Что |
|---|---|
| 1.0 | Профиль перенесён в файл из api/fixtures/demo.json и api/BACKEND.md, контракт 0.25.0. Поля до переноса — с 1.0; когда какое поле появилось в контракте — api/README.md, «Что добавлено в …» |
