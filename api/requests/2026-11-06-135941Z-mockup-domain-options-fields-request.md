# Запрос от команды mockup: новые поля опций домена и подключение к AxxonNet

2026-11-06 · коммит контракта `d8b274e` (0.2.0) · от команды mockup, для владельца контракта

Кому: владелец контракта

**Статус: новый**

## Что мы делаем

Это обещанное продолжение запроса [«Лицензии по доменам и опции домена»](2026-11-06-094022Z-mockup-domain-licenses-request.md), п. 4. Вид раздела «Опции» утверждён: прототип 32, `index_32_opcii-licenzii.html`. Раздел повторяет Axxon One: группа «Рабочее место» (опции браузера) и группа «Домен» (опции домена). Сейчас новые поля и страница AxxonNet в прототипе — заглушки в памяти страницы.

## Источники

Axxon One 3.0, документы Lexiro: 589697 (дерево опций), 292607 (хранение), 292611 (PTZ), 594406 (политика безопасности), 590806 (карты), 292642 (шаблон экспорта), 522905 (AxxonNet). Код `ONE/axxonnext.ui`: `AxxonCloudSetingsEditor.cs`, `AxxonCloudSettingsConfigurableObject.cs`, `MapProvidersConfigurableObject.cs`. Живого сервера Axxon мы не проверяли.

## Что нужно

Имена полей — наше предложение. Владелец контракта может выбрать другие. Все поля — опции домена, то есть зависят от ответа на п. 4 первого запроса (`GET/PATCH /domains/{domainId}/settings` или общий `/settings`).

1. **Новые поля опций домена** (тип, пределы, значение по умолчанию):
   - Хранение: `keep.sysLogDays` — системный журнал, дни, 1–1000, 30; `keep.sysLogCleanHours` — как часто чистить журнал, часы, 1–1000, 720; `keep.metaDays` — метаданные детекторов, дни, 0–1000, 30 (0 — без срока); `keep.metaPath` — сетевая папка для метаданных, строка, пусто — диск сервера; `keep.metaUser`, `keep.metaPassword` — доступ к папке (пароль только на запись, в ответе — признак `hasPassword`).
   - Тревоги: `alarm.reactMin` — время на реакцию, мин, не меньше 2, 5; `alarm.onLayoutMin` — камера на тревожной раскладке, мин, 3; `alarm.commentRequired` — список из `confirmed`, `suspicious`, `false`, по умолчанию `["suspicious"]`.
   - PTZ: `ptz.idleSec` — отдать управление через, с, 5–600, 30; `ptz.showOwner` — показывать, кто управляет, да/нет, да; `ptz.joystickSensitivity` — 5–100, 50 (пределы зависят от модели джойстика — откуда их брать?).
   - Безопасность: `sec.pwdMinLength` — 8–20, 8; `sec.pwdComplexity` — `none`, `password`, `userAndPassword`; `sec.pwdHistory` — 0–24, 3; `sec.singleLogon` — да/нет; `sec.rememberMe` — да/нет, да; `sec.lockAfterFails` — 0–999 (0 — не блокировать), 5; `sec.lockMinutes` — 0–99999, 30; `sec.privacyMask` — `mosaic`, `black`; `sec.clientIpAllow` — список `{address, prefix}`, пусто — без ограничения; `sec.integrityAction` — `warnAdmins`, `warnAll`, `blockNonAdmins`, `stopServices`.
   - NTP: `ntp.enabled` — да/нет; `ntp.intervalMin` — 15–10080, 1440; `ntp.devices` — также на IP-устройствах ONVIF, да/нет.
   - Карты: `map.provider` — `osm`, `google`, `yandex`, `2gis`, `image` (Yandex и 2ГИС есть в коде Axxon One, в документации их нет); `map.apiKey` — строка, только на запись; `map.zoomMin`, `map.zoomMax`, `map.zoomDefault` — 0–19; `map.center` — `{lat, lon}`.
   - Шаблон экспорта (PDF): `export.orientation` — `portrait`, `landscape`; `export.background` — файл PNG до 1 МБ; `export.font`, `export.fontSize` (6–36, 8), `export.color`; `export.watermark` — файл PNG/JPEG/BMP до 1 МБ; `export.watermarkOpacity` — 0–100 %; `export.watermarkArea` — `{left, top, right, bottom}` в %, по умолчанию 0, 0, 100, 100.
   Зачем: без этих полей страницы «Хранение данных», «Обработка тревог», «Управление PTZ», «Безопасность», «Время», «Карты» и «Шаблон экспорта» не строятся по контракту. Файлы шаблона экспорта — как передавать: `multipart` или ссылкой на загруженный файл?
2. **Подключение домена к AxxonNet.** В Axxon One домен привязывают одноразовым токеном с сайта облака; с облаком говорит сервер, не клиент. Нужно:
   - чтение состояния, например `GET /domains/{domainId}/cloud`: `state` (`connected`, `disconnected`, `connecting`, `disconnecting`, `error`), `errorCode` (`tokenRejected`, `configError`, `unreachable`), `since` (UTC), `cloudUrl` (по умолчанию `https://axxonnet.com`, любой адрес `http(s)`), `proxy` — `{type: none|http|https|socks5, address, user, hasPassword}`;
   - подключение `POST …/cloud/bind` с `{token, cloudUrl, proxy}` и отключение `POST …/cloud/unbind`; оба — операции: ответ сразу, итог — событием в потоке;
   - событие изменения состояния в потоке событий (в Axxon One — `ArpAgentStateChanged`).
   Зачем: страница AxxonNet показывает состояние каждого домена и подключает его. Почта оповещателей в режиме «Облачный AxxonNet» работает, только когда домен подключён: интерфейс хочет показать это у оповещателя.
3. **Вопросы о полях, которых нет в Axxon One.** В контракте есть `sec.2fa`, `events.retentionDays`, `alarms.retentionDays`, `ntp.tz`, `mail.smtp`, `mail.hook`, `alarms.domain`. В «Опциях» Axxon One 3.0 их нет: второй фактор задают у роли («Подтверждение супервизором»), SMTP — у объекта «Почтовый оповещатель», webhook нет совсем. Оставляем их в контракте как поля нашей консоли или убираем? Прототип пока их показывает; «Тревогу на весь домен» (`alarms.domain`) он перенёс со страницы «Хранение» на «Обработку тревог».

Опции «Рабочего места» (язык, формат даты, выход по бездействию, динамик и микрофон) API не нужны: они живут в браузере. Список динамиков и микрофонов даёт сам браузер.

## Что сломается

- Пп. 1 и 2 только добавляют поля и пути: тем, кто уже работает по контракту, они не мешают.
- П. 3: если поля уберут, `index.html` и все, кто читает `GET /settings`, перестанут их видеть — это ломающее изменение (строка в «Ломающих изменениях»).
- Если `alarm.commentRequired` и другие станут доменными (п. 4 первого запроса), `PATCH /settings` перестанет менять их во всех доменах сразу.

## Пока нет ответа

Прототип 32 показывает эти страницы на заглушках. В `index.html` их не перенести, пока нет ответа на этот запрос и на п. 4 первого.
