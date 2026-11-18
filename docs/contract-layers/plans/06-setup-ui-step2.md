# Своя страница подсистемы, шаг 2: мост к механизму — план работ (часть 06)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** страница подсистемы в iframe строит экран уровня карточки камеры или домена. Она просит consolem выполнить операцию контракта (`call`), подписаться на поток (`subscribe`), перейти к объекту (`navigate`) и показать подтверждение (`confirm`). consolem делает это с правами человека, а правку объектов держит в своём черновике до «Применить».

**Architecture:** в контракте у каждой операции `api/openapi.json` — расширение `x-bridge` (`read | act | draft`), неразмеченное закрыто. Проверку разметки делает `tools/check_api.py`. В прототипе (копия `index.html` после переноса части 05) хост сообщений шага 1 получает обработчики шага 2. Хост строит карту `operationId → метод и путь` из `window.CONSOLEM_OPENAPI`. Операции `read` и `act` хост выполняет через `API.raw`, а `draft` превращает в шаги `OperationItemRequest` в черновике карточки (`cardDraft.bridge`). «Применить» отправляет их одной `POST /operations` вместе с правкой самой страницы. Библиотека `api/setup-bridge.js` получает методы шага 2. Тестовая страница стенда показывает «сложный» экран на данных набора.

**Tech Stack:** HTML и JS без сборки (`index.html`, прототип `index_NN_…html`), встроенный сервер `api/server.js`, `postMessage`, Python-проверки `tools/check_api.py`, `tools/check_ui.py`, сценарии `tests/ui-*.js`, тесты API `tests/api-*.js`.

**Spec:** [`docs/contract-layers/2026-11-18-setup-ui-iframe-design.md`](../2026-11-18-setup-ui-iframe-design.md), разделы 7, 8 и 10–12; основа — [предложение о слоях](../2026-11-16-kontrakt-i-podsistemy-predlozhenie.md), п. 12 переработки и п. 7 «Что предлагаем» (видео в отдельный API). Позиция w2c — [запрос](../../../api/requests/2026-11-18-114831Z-w2c-contract-layers-request.md), [ответ](../../../api/requests/2026-11-18-114831Z-w2c-contract-layers-response.md) (вопрос В2 об адресе API видео), запрос к w2c о шаге 1 — [120707Z](../../../api/requests/2026-11-18-120707Z-owner-setup-ui-iframe-request.md).

> **Сверка с общим планом** ([00-master.md](00-master.md), раздел «Сверка частей» — главнее текста ниже):
>
> - С5 — разметку `x-bridge` снять с контракта на момент исполнения (после части 04: новые пути поиска, сценариев, ретрансляторов, `getExportReference`);
> - Review Focus 2 — в задаче 8 шаг `python3 tools/run_api_tests.py --fixture agents --layer mechanism`: ни одного `FAIL`;
> - Review Focus 5 — в задаче 6 тестовая страница зовёт `getDiscovery`/`startDiscovery` по `operationId` и получает ответ по новым путям части 04;
> - О5 — умолчание: `startUnitLive` через мост пропускается.

Зависимость: часть 05 (шаг 1) уже сделана и перенесена в `index.html`. Часть 04 (механизм без VMS) могла перенести поиск в сети домена в команду вида или путь профиля. Задача 1 начинается со сверки с обеими частями.

## Global Constraints

- Протокол остаётся `setup/1` (`setupUi.protocol`). Шаг 2 только добавляет сообщения. Незнакомый `type` обе стороны пропускают. Страница шага 1 на хосте шага 2 и страница шага 2 на хосте шага 1 работают.
- Каждое сообщение — `{proto: "setup/1", type, …}`. Имена из описания решения — как есть: `call {id, op, params, body}`, `result {id, ok, status, body | problem}`, `subscribe`, `event`, `navigate (uid, tab)`, `confirm`. `op` — `operationId` контракта.
- `x-bridge`: `read` — выполнить сразу; `act` — выполнить сразу, команда видна в журнале; `draft` — положить в черновик, выполнить по «Применить». Нет поля — отказ `NOT_SUPPORTED`. `/test/*` не размечаются никогда.
- consolem выполняет вызов своим токеном и с правами человека. Отказ сервера (`403`, `404`, `422`) уходит странице как есть. Сам consolem права не пересчитывает. Исключение: у страницы с `readOnly: true` операции `draft` закрыты.
- Удаление в черновике (`deleteUnit`, `deleteObjects`) consolem подтверждает своим диалогом `askConfirm(…, {typeCount: N})`. Число `N` считает consolem, а не страница. Страница не может обойти диалог.
- Черновик из нескольких объектов «Применить» выполняет одной `POST /operations` с `expectedVersions`. После неё — тост с «Отменить» (откат операции), как у любой правки карточки.
- `navigate` идёт по правилу `CLAUDE.md` «Моргание при переходе по ссылке»: `hwJumpFlash = true` вокруг `pick`, вспышку даёт `hwFlashLanding`. Если в черновике есть изменения, consolem сначала спрашивает (`cardLeaveAsk`).
- Свои команды страницы идут к её серверу напрямую, consolem о них не знает. Своя команда не меняет настройки объекта. Её итог (новые значения) страница кладёт в `change` (описание решения, раздел 8).
- consolem отвечает только окну рамки и только на ожидаемое происхождение (не `"*"`). Исключение — правило стенда из части 05: тестовая страница на происхождении consolem, рамка без `allow-same-origin`.
- В consolem нет кода под конкретный плагин или вид (анти-цель описания решения). Тестовая страница стенда — в `api/plugins/…`, не в `index.html`.
- Разметка без кода в атрибутах (`onEv`, `data-on-click`) — в прототипе и в тестовой странице.
- Новые тексты интерфейса — по `docs/TEXTS.md`. Новый русский текст — новый ключ `i18n`, английский — в `assets/i18n-en-NN.js` прототипа, при переносе — в `assets/i18n-en.js`.
- Версия контракта — «следующая младшая после `origin/main`», одна на задачи 1–2. В `api/README.md` — раздел «Что добавлено в X.Y.Z». Ломающих правок эта часть не делает.
- Проверки: правка `api/` — `python3 tools/check_api.py`, `python3 tools/run_api_tests.py`, `python3 tools/check_ui.py`, `python3 tools/check_perf.py --quick`. Прототип — `python3 tools/check_ui.py --page <файл>` и `<файл>?selftest`, когда он готов. Мост трогает поток (`apiOnEvent`, `watchIds`), поэтому перед переносом ещё `python3 tools/check_perf.py --page <файл>`.
- Коммиты — в стиле `CLAUDE.md`: `API: …; контракт X.Y.Z`, `Прототип NN: …`, `Тесты: …`, `Макет: из прототипа NN — …`. После каждого — `git pull --rebase && git push`.

## Review Focus

- **Путь из параметров страницы.** `params.uid = "../test/reset"` или `"x?y"` не должен дойти до другого пути. Ожидание: значение кодирует `encodeURIComponent`, сервер отвечает `404`, запроса к `/test/*` нет. Тест — задача 3, шаг 1.
- **Страница только для просмотра зовёт `draft`.** Ожидание: `PERMISSION_DENIED` со `status: 0` без запроса и без строки в черновике. `act` уходит на сервер, его `403` возвращается странице. Тесты — задача 4 (`readOnly`) и задача 6 (роль без права).
- **Рамка закрылась, пока идёт вызов, подписка или диалог.** Ожидание: устаревшей рамке consolem ничего не шлёт, подписки сняты, `watchIds()` их больше не держит, диалог `confirm` закрыт. Тест — задача 5, шаг 1.
- **Объект шага черновика изменил другой администратор между вызовом и «Применить».** Ожидание: `412`, стандартный конфликт версий, чужая правка не затёрта. Версия шага взята в момент вызова. Тест — задача 4, шаг 1.
- **Подтверждение страницы похоже на диалог consolem.** Ожидание: в диалоге видно, что спрашивает страница вида «…», текст страницы показан как текст (HTML не исполняется), число для удаления consolem считает сам. Тесты — задача 4 (удаление) и задача 5 (`confirm`).

## Что берём из части 05 (Consumes)

Имена ниже — предположение этого плана. Перед задачей 3 исполнитель сверяет их с `index.html` после переноса части 05 (`python3 tools/outline.py index.html sui setup`) и с `api/SETUP-UI.md`. Если в части 05 имя другое, везде в этом плане берётся имя части 05.

| Что | Имя в этом плане | Что делает |
|---|---|---|
| раздел хоста | `// ── Своя страница подсистемы: рамка и протокол setup/1 ──` | рамка, сообщения шага 1 |
| состояние рамки | `suiFrame: {uid, kind, win, origin, star, ready, readOnly} \| null` | открытая рамка карточки |
| отправка странице | `suiPost(type: string, data: object): void` | `{proto, type, …data}` в `suiFrame.win` на `suiFrame.origin` (или `"*"` по правилу стенда) |
| приём | `suiOnMessage(e: MessageEvent): void` и таблица `SUI_ON: {[type]: (msg) => void}` | проверка `source` и `origin`, вызов обработчика по `type` |
| перечень возможностей | `suiHostInfo(): {proto, apply, …}` | поле `init.host` |
| закрытие | `suiClose(): void` | рамка убрана: смена карточки, перезагрузка, ошибка |
| правка страницы | строки `cardDiff()` от `change` (у объекта по схеме — `n.props`, у ручного — `n.xprops`) | общий черновик с «Все параметры» |
| библиотека | `SetupBridge.connect(handlers) → Promise<Session>`; `session.init`, `session.change(patch)`, `session.invalid(fields, text)`, `session.height(px)` | сторона страницы |
| тестовая страница | `SUI_TEST_PAGE` — путь из части 05, например `api/plugins/<плагин>/setup/index.html` | страница стенда, данные из `init` |
| вид и объект стенда | `SUI_KIND` (вид с `setupUi.mode: iframe`), `SUI_UNIT` (его объект в `demo.json`) | на них идут тесты |
| схема и описание | `api/setup-ui.schema.json` (`$defs` по `type`), `api/SETUP-UI.md` | протокол шага 1 |

## Карта файлов

| Файл | Что меняется |
|---|---|
| `api/openapi.json` | `x-bridge` у операций; версия; ссылка на шаг 2 в описании `UnitKind.setupUi` |
| `tools/check_api.py` | `check_bridge(rep, specs)` и постоянные `BRIDGE_CLOSED`, `BRIDGE_DRAFT`, `BRIDGE_READ_POST` |
| `api/SETUP-UI.md` | раздел «Шаг 2: мост к механизму» и раздел «Свои команды страницы» |
| `api/setup-ui.schema.json` | сообщения `call`, `result`, `subscribe`, `unsubscribe`, `event`, `navigate`, `confirm`; `init.host.bridge`; `applied.steps`, `draft.steps` |
| `api/README.md`, `api/BACKEND.md` | «Что добавлено в X.Y.Z», абзац о `x-bridge` в «Договорённостях», строка для бэкенда |
| `api/fixtures/demo.json` | при необходимости — данные вида `SUI_KIND` (ссылки на камеры, дочерний вид, команда) |
| `tests/api-units.js` | тест «черновик моста — одна операция» |
| `api/setup-bridge.js` | `session.call`, `session.can`, `session.subscribe`, `session.navigate`, `session.confirm` |
| `SUI_TEST_PAGE` (и её скрипт рядом) | блоки «сложного» экрана и прогоны `#run=…` |
| `index_NN_stranica-podsistemy-most.html`, `assets/i18n-en-NN.js` | раздел моста шага 2 |
| `tests/ui-stranica-most.js`, `tests/selftest.js` | сценарий моста и его место в самопроверке |
| `protos.html`, `api/requests/…`, `api/requests/README.md` | строка прототипа; запрос к w2c |
| `index.html`, `assets/i18n-en.js`, `CHANGES.md` | перенос (задача 8) |

## Разметка `x-bridge`

Правило: странице открыто то, что нужно экрану настройки объекта. Чтение объектов и того, на что ссылаются их свойства, — `read`. Команды объекта и долгие работы, которые карточка consolem тоже запускает сразу, — `act`. Правка объектов склада — `draft`. Закрыто: права и сеанс, запись вне склада (правила, настройки системы, ключи), работа оператора (видео, архив, выгрузка), откат и повтор чужих операций, служебное. Подсчёт на контракте 0.23.0: 137 операций, `read` — 29, `act` — 8, `draft` — 6, закрыто — 94.

| Группа | `read` | `act` | `draft` | Закрыто (`BRIDGE_CLOSED`) и почему |
|---|---|---|---|---|
| Объекты (`units`) | `listKinds`, `getKind`, `listUnits`, `getUnit`, `getCreatable`, `getUnitSchema`, `validateUnits` (POST без записи) | `runUnitAction`, `runKindAction` | `patchUnit`, `createUnits`, `deleteUnit`, `moveUnit` | `openUnitSetupUi` — адрес страницы берёт сам consolem |
| Операции | `listOperations`, `getOperation` | `cancelOperation` | `createOperation` (только шаги `patch`, `createUnit`, `delete`, `move`, `folders`) | `revertOperation`, `redoOperation`, `retryFailedOperation` — откат и повтор ведёт consolem (тост, журнал операций); `pauseOperation`, `resumeOperation` — устарели |
| Дерево и удаление | `getTreeChildren`, `getTreePaths` | — | `deleteObjects` (только `uid` объектов склада) | — |
| Поиск в сети | `getDiscovery` | `startDiscovery`, `stopDiscovery` | — | — |
| Справочники и система | `getReference`, `getSettings`, `listLicenses` | — | — | `patchSettings`, `listLicenseKeys`, `getLicenseKey`, `createLicenseKey`, `patchLicenseKey`, `deleteLicenseKey` — система, а не объект |
| Журнал | `listJournal`, `listJournalFacets`, `listJournalKinds` | — | — | `exportJournal` — файл, рамка не сохраняет файлы |
| Автоматизация | `listRules`, `getRule`, `listSchedules`, `getSchedule`, `getModes`, `getModeCurrent` | — | — | запись правил, расписаний, групп дней и режимов, `listRuleFires`, `listRuleVersions`, `testRule`, `runRule`, `retryRuleFire`, `listDayGroups`, `getDayGroup`, окна обслуживания (устарели) — редактор автоматизации у consolem свой; `listRulePrompts`, `answerRulePrompt` — работа оператора |
| Домен VMS | `getScenarios`, `getScenariosStatus`, `listRelays`, `getRelay` | — | — | `putScenarios` — документ сценариев правит consolem |
| Файлы | — | `uploadFile` (тело — `Blob`; `fileId` страница кладёт в `change`) | — | — |
| Видео (п. 7 предложения) | — | `startUnitLive`, `moveUnitLive` (кадр для зон) | — | `startUnitTalk`, `getUnitTimeline`, `getUnitPlayback`, `*Hold*`, `*Bookmark*`, `fetchUnitArchive`, `putUnitPtz`, `deleteUnitPtz`, `putUnitPreset`, `deleteUnitPreset`, `getUnitRecordingDays`, все `*Export*`, `getExportGrant` — работа оператора; `putUnitRecordingTarget` — запись настройки мимо черновика (открытый вопрос 2) |
| Пути профилей | `listUnitPosRaw` | — | — | `listArchiveWatches`, `listArchiveScans` и их запись — хранилище, не объект страницы |
| Права и сеанс | — | — | — | `getMe`, `getAccess`, `applyAccess`, `syncCatalog`, `listAccessUsers`, `listAccessGroups`, `listAccessHistory`, `listAccessCellHistory`, `listRoleObjects`, `*StreamAccount*` — вкладка «Доступ» у consolem своя |
| Поток | — | — | — | `stream`, `putStreamWatch` — вместо них `subscribe` |
| Служебное | — | — | — | `assistTurn`; `test*` (тег `test-support`) — никогда |

Операция, которую добавят в контракт позже, не проходит `check_api.py`, пока у неё нет `x-bridge` или строки в `BRIDGE_CLOSED`. Решение о новой операции принимают сразу.

Если часть 04 сняла или заменила операции (например, поиск в сети стал командой вида домена), разметка идёт по тому же правилу групп: команда вида — это `runUnitAction`, уже `act`.

Как `draft` ложится на шаг операции (`OperationItemRequest`):

| Операция | Шаги в черновике | Подтверждение |
|---|---|---|
| `patchUnit {params: {uid}, body: UnitPatch}` | `{uid, patch: body}`; свой `uid` страницы — отказ `VALIDATION_FAILED`, `field: "/params/uid"`: своё — через `change` | — |
| `createUnits {body: {items}}` | на каждый `UnitCreate`: `{uid: item.parentId, createUnit: item}`; без `parentId` — `NOT_SUPPORTED` (открытый вопрос 2) | — |
| `deleteUnit {params: {uid}}` | `{uid, delete: true}` | `askConfirm`, `typeCount: 1` |
| `deleteObjects {body: {items: [{id, version}]}}` | на каждый: `{uid: id, delete: true}`; `id` не объекта склада (правило) — `NOT_SUPPORTED` | `askConfirm`, `typeCount: N` |
| `moveUnit {params: {uid}, body: UnitMoveRequest}` | `{uid, move: body.parentId, params: остальное тело}` | — |
| `createOperation {body: OperationRequest}` | шаги `items` как есть; шаг `action` — `NOT_SUPPORTED`; `patch` своего `uid` — как у `patchUnit` | если есть `delete` — `typeCount` по их числу |

## Протокол шага 2 (решения)

- **`result`** — `{id, ok, status, body?, problem?, etag?}`. `status` — HTTP-статус ответа сервера. Шаг принят в черновик — `status: 202`, `body: {drafted: true, step}`. Отказ самого моста без запроса — `status: 0`, `problem: {code, message, field?}`.
- **Коды отказа моста:** `NOT_SUPPORTED` (нет `x-bridge`, система не объявила операцию в `capabilities.operations`, шаг не выражается операцией), `VALIDATION_FAILED` (нет параметра пути, незнакомый параметр — `field: "/params/<имя>"`), `PERMISSION_DENIED` (`draft` при `readOnly`, `params: {readOnly: true}`), `BUSY` (предел вызовов или подписок; второй `confirm`, пока открыт первый), `CANCELLED` (человек отказался в диалоге), `NOT_FOUND` (`navigate` к объекту, которого нет или не видно), `UPSTREAM_UNAVAILABLE` (нет связи). Код `CANCELLED` есть только в протоколе моста (`setup-ui.schema.json`), в `ProblemCode` контракта его не добавляем (открытый вопрос 4).
- **Пределы:** не больше 8 вызовов в работе (`BRIDGE_CALLS_MAX`), не больше 16 подписок (`BRIDGE_SUBS_MAX`), объектов во всех подписках — не больше `limits.watchMax`.
- **`subscribe {id, entityIds?, kinds?, types?}`** → `result {body: {sub: id}}`. Сообщение потока подходит, если `entityId ∈ entityIds` или `kind ∈ kinds`, и `type ∈ types` (если `types` задан). `stream.reset` и `test.reset` уходят всем подпискам. Объекты из `entityIds` попадают в наблюдение потока (`watchIds`). **`unsubscribe {sub}`** — без ответа. **`event {sub, message}`** — `StreamMessage` как есть.
- **`navigate {id, uid, tab?}`.** Удачный переход ответа не получает: карточка сменилась, рамка закрыта. Ответ приходит на тот же объект (`ok: true`), на отказ человека в `cardLeaveAsk` (`CANCELLED`) и на неизвестный `uid` (`NOT_FOUND`).
- **`confirm {id, title, text, lose?, keep?, count?, okLabel?}`** → `result {ok: true, body: {confirmed: boolean}}`. Тексты страницы показаны текстом. Списки `lose` («Пропадёт») и `keep` («Останется») consolem строит сам. Над текстом — строка «Спрашивает страница вида «<подпись вида>»».
- **`init.host.bridge`** — `{ops: {[operationId]: "read" | "act" | "draft"}, messages: ["call", "subscribe", "unsubscribe", "navigate", "confirm"], limits: {calls, subscriptions, watch}}`. В `ops` — только размеченные операции, которые система объявила (`can(op)`). При `readOnly` в `ops` нет `draft`. Нет `bridge` — хост шага 1, и страница показывает только шаг 1.
- **`draft`** (шаг 1) получает `steps: [{step, op, label}]`. **`applied`** получает `steps: [{step, state, code?, createdId?}]` — итог шагов моста по `OperationItem`. **`revert`** — черновик пуст, `steps: []`.
- **Видео.** `startUnitLive` идёт через мост как `act`. Если видео уйдёт в отдельный API (вопрос В2 к w2c), его описание получит свой `x-bridge`, а карта моста — его операции с меткой `api: "video"`. Сейчас карта строится только из `api/openapi.json` (`api: "config"`).

---

### Task 1: Разметка `x-bridge` и её проверка

**Files:**
- Modify: `tools/check_api.py` — новая `check_bridge` рядом с `check_contract` (строки 199–260), вызов в `main()`
- Modify: `api/openapi.json` — `x-bridge` у 43 операций, `info.version`
- Modify: `api/README.md` — «Договорённости»: абзац «Мост страницы подсистемы (`x-bridge`)»; шапка с версией; «Что добавлено в X.Y.Z»
- Modify: `api/BACKEND.md` — одна строка: `x-bridge` от бэкенда ничего не требует, страница вызывает `read`-операции с правами человека, поэтому права проверяет каждый путь (как сейчас)
- Regenerate: `api/openapi.js` (`python3 tools/build_api.py`)

**Interfaces:**
- Consumes: — (сверка, шаг 1).
- Produces: в `api/openapi.json` у операции ключ `"x-bridge": "read" | "act" | "draft"`. В `tools/check_api.py`: `BRIDGE_VALUES = ("read", "act", "draft")`, `BRIDGE_DRAFT = {"patchUnit", "createUnits", "deleteUnit", "moveUnit", "deleteObjects", "createOperation"}`, `BRIDGE_READ_POST = {"validateUnits"}`, `BRIDGE_CLOSED: dict[str, str]` (operationId → причина словами, 94 строки по таблице «Разметка»), `check_bridge(rep, specs: list[tuple[str, dict]]) -> None`.

- [ ] **Step 1: Сверить исходное.** `git pull --rebase`. Прочитать `api/SETUP-UI.md` и `api/setup-ui.schema.json` части 05, выполнить `python3 tools/outline.py index.html sui setup`, поправить таблицу «Что берём из части 05» в этом плане, если имена другие. Перечислить операции:

```bash
python3 -c "import json;d=json.load(open('api/openapi.json'));print(d['info']['version']);[print(m.upper(),p,o['operationId']) for p,v in d['paths'].items() for m,o in v.items() if m in('get','post','put','patch','delete')]"
```

Expected: если список отличается от контракта 0.23.0 (137 операций; часть 04 могла добавить или пометить `deprecated`), новые операции разметить по правилу групп, устаревшие — в `BRIDGE_CLOSED` с причиной «устарела».

- [ ] **Step 2: Написать проверку (сначала она падает).** `check_bridge` проверяет каждое описание из `specs`: `api/openapi.json`, а также `api/*.openapi.json` и `api/profiles/*.openapi.json`, если такие появятся (API видео, пути профилей). Отказы:
  - у операции нет `x-bridge`, и её нет в `BRIDGE_CLOSED` — «`<op>`: нет `x-bridge` и нет в `BRIDGE_CLOSED`»;
  - есть и то, и другое;
  - значение не из `BRIDGE_VALUES`;
  - `x-bridge` у пути `/test/*` или у операции с тегом `test-support`;
  - `read` у метода не `get`, и операции нет в `BRIDGE_READ_POST`;
  - `draft` у операции не из `BRIDGE_DRAFT`;
  - `x-bridge` у `deprecated: true`;
  - в `BRIDGE_CLOSED` есть `operationId`, которого нет ни в одном описании.

  Строка отчёта: `rep.check("Мост страницы: x-bridge у каждой операции или причина в BRIDGE_CLOSED", problems, f"read {r}, act {a}, draft {d}, закрыто {c}")`.

- [ ] **Step 3: Запустить проверку.**

Run: `python3 tools/check_api.py`
Expected: `FAIL` строки «Мост страницы…» с 43 операциями без `x-bridge` (`getUnit`, `runUnitAction`, `patchUnit`…), остальное `PASS`, `RESULT fail`.

- [ ] **Step 4: Разметить `api/openapi.json`** по таблице «Разметка `x-bridge`». Поднять `info.version` до следующей младшей после `origin/main`. В описании `UnitKind.setupUi` — ссылка «Шаг 2: мост к механизму — `api/SETUP-UI.md`». Абзац в «Договорённостях» `api/README.md`: что значит каждое значение, что неразмеченное закрыто, где список закрытых (`tools/check_api.py`, `BRIDGE_CLOSED`) и что новую операцию без решения проверка не пропускает. «Что добавлено в X.Y.Z»: разметка `x-bridge` (без уведомления: это правка владельца). Затем `python3 tools/build_api.py`.

- [ ] **Step 5: Проверки.**

Run: `python3 tools/check_api.py && python3 tools/run_api_tests.py && python3 tools/check_ui.py`
Expected: строка «Мост страницы…» — `PASS` с `read 29, act 8, draft 6, закрыто 94` (или числами после сверки шага 1), везде `RESULT pass`. `x-bridge` сервер не читает, поэтому тесты API и сценарии не меняются.

Run: `python3 tools/check_perf.py --quick`
Expected: `RESULT pass` (интерфейс не менялся; это проверка правки `api/` по `api/TESTS.md`).

- [ ] **Step 6: Коммит** (push — после задачи 2, одна версия на обе).

```bash
git add api/openapi.json api/openapi.js api/README.md api/BACKEND.md tools/check_api.py
git commit -m "API: разметка x-bridge — что страница подсистемы вызывает через consolem, проверка в check_api.py; контракт X.Y.Z"
```

### Task 2: Протокол шага 2 в описании и схеме, данные стенда, тест операции

**Files:**
- Modify: `api/SETUP-UI.md` — разделы «Шаг 2: мост к механизму» и «Свои команды страницы»
- Modify: `api/setup-ui.schema.json` — сообщения шага 2 и поля `init.host.bridge`, `draft.steps`, `applied.steps`
- Modify: `tools/check_api.py` — проверка схемы протокола (если часть 05 её уже сделала — дополнить примерами шага 2)
- Modify: `api/fixtures/demo.json` — данные вида `SUI_KIND`, только если их нет (ниже)
- Test: `tests/api-units.js`
- Modify: `api/README.md` — тот же раздел «Что добавлено в X.Y.Z»; `api/TESTS.md` — число тестов `api-units.js`

**Interfaces:**
- Consumes: `x-bridge` (задача 1); `api/setup-ui.schema.json` части 05.
- Produces: в `api/setup-ui.schema.json` — `$defs` `call`, `result`, `subscribe`, `unsubscribe`, `event`, `navigate`, `confirm`, `hostBridge`, `bridgeStep`, `bridgeStepResult`, `bridgeProblem` (поля — раздел «Протокол шага 2»; `bridgeProblem.code` — `ProblemCode` контракта или `"CANCELLED"`). У каждого `$defs` с `type` — пример в `examples`. На стенде у `SUI_UNIT` есть: свойство-массив ссылок `x-ref {implements: ["vms.camera/1"]}` хотя бы на две камеры, дочерний вид (хотя бы два ребёнка), команда `instant` с `right: {level: "edit"}`, `domainId` домена, у которого есть `discovery` в наборе.

- [ ] **Step 1: Тест API (сначала падает или пропускается).** В `tests/api-units.js`:

```js
test("Мост X.Y.Z: черновик страницы — одна операция: patch, createUnit, move и delete по разным объектам; откат возвращает всё", async () => {
  // needs: createOperation, revertOperation, kind:<дочерний вид SUI_KIND>
  // объекты: ctrl = SUI_UNIT, s1 и s2 — его дети, ctrl2 — второй объект вида SUI_KIND
  // один POST /operations: {uid: s1, patch: {name: "Мост 1"}}, {uid: ctrl.uid, createUnit: {kind, name: "Мост новый", properties}},
  //   {uid: s2, move: ctrl2.uid}, {uid: s1b, delete: true}; expectedVersions — версии s1, s2, s1b; wait: false
  assert.status(res, 202);
  // дождаться operation.finished: все items state "ok"; у шага createUnit — createdId
  // после: s1.name === "Мост 1", созданный есть под ctrl, s2.parentId === ctrl2.uid, s1b — 404
  // POST /operations/{id}/revert → 202; после: s1.name прежнее, созданного нет (404), s2.parentId === ctrl.uid, s1b есть
});
```

Run: `python3 tools/run_api_tests.py`
Expected: новый тест `FAIL` или `SKIP` (нет детей или второго объекта), если данных вида ещё нет. Если данные части 05 подходят, тест сразу `PASS`: он закрепляет то, на что опирается мост.

- [ ] **Step 2: Данные вида.** Если у `SUI_KIND` из части 05 нет ссылок на камеры, детей, команды или поиска в сети домена — добавить в `api/fixtures/demo.json` (это данные вида, без правки `openapi.json`), затем `python3 tools/profile_fixture.py` и `python3 tools/build_api.py`. Существующие `security_controller/*` с `mode: tab` не трогать.

- [ ] **Step 3: Схема и описание.** Дополнить `api/setup-ui.schema.json` (по разделу «Протокол шага 2») и `api/SETUP-UI.md`:
  - таблица сообщений шага 2 и коды отказа;
  - как черновик ложится на операцию (таблица «Как `draft` ложится на шаг операции»);
  - пределы;
  - `init.host.bridge`, `navigate` без ответа на удачный переход;
  - «Свои команды страницы»: таблица из трёх путей и две границы раздела 8 описания решения (своя команда не меняет настройки, итог — в `change`; права своих команд проверяет дверь);
  - «Видео»: `startUnitLive` через мост; отдельный API видео — тем же `x-bridge`.

  Проверка в `check_api.py`: каждый пример из `examples` проходит свой `$defs` (функция `validate` того же файла), у каждого сообщения шага 2 есть пример. Строка отчёта: «Протокол setup/1: примеры сообщений проходят схему».

- [ ] **Step 4: Проверки.**

Run: `python3 tools/check_api.py && python3 tools/run_api_tests.py && python3 tools/check_ui.py && python3 tools/check_perf.py --quick`
Expected: везде `RESULT pass`; новый тест API — `PASS`. Если набор менялся, у `ui-unknown.js` и `ui-jump.js` тоже `PASS`: новые объекты незнакомого вида рисуются формой по схеме. Число тестов поправить в `api/TESTS.md`.

- [ ] **Step 5: Коммит и push.**

```bash
git add api/ tests/api-units.js tools/check_api.py
git commit -m "API: протокол страницы подсистемы, шаг 2 — call, result, subscribe, event, navigate, confirm; данные стенда и тест черновика одной операцией; контракт X.Y.Z"
git pull --rebase && git push
```

### Task 3: Прототип и вызов операций `read` и `act`

**Files:**
- Create: `index_NN_stranica-podsistemy-most.html` (копия `index.html`), `assets/i18n-en-NN.js`
- Modify: `protos.html` — строка прототипа
- Modify: прототип — новый раздел `// ── Своя страница подсистемы: мост к механизму (шаг 2) ──` сразу после раздела хоста шага 1; `SUI_ON`, `suiHostInfo`
- Modify: `api/setup-bridge.js`
- Create: `tests/ui-stranica-most.js`; Modify: `tests/selftest.js` (`SCENARIOS`, `FOCUS_ALONE`)

**Interfaces:**
- Consumes: `suiFrame`, `suiPost`, `SUI_ON`, `suiHostInfo` (часть 05); `API.raw(method, path, body, headers) → Promise<{status, body, headers}>` (`api/client.js`); `can(op)`; `opKey()`; `window.CONSOLEM_OPENAPI`; `window.CONSOLEM_TRACE` (журнал запросов клиента).
- Produces:
  - `const BRIDGE_CALLS_MAX = 8, BRIDGE_SUBS_MAX = 16;`
  - `bridgeOpsBuild(specs: Array<{api: "config" | "video", spec: object}>) → Map<string, {api, method, path, bridge, pathNames: string[], query: Set<string>, body: boolean}>`; `let BRIDGE_OPS` — строится при старте из `[{api: "config", spec: window.CONSOLEM_OPENAPI}]`.
  - `bridgeOpsShown(readOnly: boolean) → {[op]: "read" | "act" | "draft"}` — размеченные и `can(op)`; при `readOnly` без `draft`.
  - `bridgeRequest(op: string, params?: object, body?: any) → {method, path, body, headers}` — бросает `{code: "VALIDATION_FAILED", field}`. Параметр пути — `encodeURIComponent`. Остальные параметры — только объявленные `in: query`. У `runUnitAction`, `runKindAction`, `startDiscovery` без `idempotencyKey` в теле consolem добавляет `opKey()`.
  - `bridgeCall(msg: {id, op, params?, body?}) → Promise<BridgeResult>`; `BridgeResult = {id, ok, status, body?, problem?, etag?}`.
  - `bridgeFail(id, status, code, extra?) → BridgeResult`.
  - `SUI_ON.call = (msg) => bridgeCall(msg).then((r) => suiPost("result", r))` с пределом `BRIDGE_CALLS_MAX` (сверх — `BUSY` сразу).
  - `suiHostInfo().bridge = {ops: bridgeOpsShown(suiFrame.readOnly), messages, limits: {calls, subscriptions, watch: LIM.watchMax}}`.
  - Библиотека: `session.call(op: string, {params?, body?}?) → Promise<BridgeResult>` (не бросает; срок ответа 30 с — затем `{ok: false, status: 0, problem: {code: "UPSTREAM_UNAVAILABLE"}}`), `session.can(op) → "read" | "act" | "draft" | null`, `session.bridge: boolean`.

- [ ] **Step 1: Прототип и сценарий (сначала падает).** `git pull --rebase`; номер NN — по правилу `CLAUDE.md` (следующий после максимального среди `index_NN*.html` и в `protos.html`, включая удалённые). Скопировать `index.html` и закоммитить копию до правок: `Прототип NN: копия index.html`. Добавить строку в `protos.html`: номер, ссылка, автор (`git config user.name`), «что проверяем»: «Своя страница подсистемы, шаг 2: мост к операциям, подписка, переход, подтверждение», статус «обсуждается». Создать `assets/i18n-en-NN.js` и подключить его после `assets/i18n-en.js`.

  В `tests/ui-stranica-most.js` — охрана и помощники, затем проверки вызова:

```js
UiCheck(async ({ ok, until, confirmWith }) => {
  if (typeof bridgeCall !== "function") { ok(true, "на этой странице моста шага 2 нет"); return; }
  // открыть SUI_UNIT, дождаться suiFrame?.ready; sent — копия того, что хост послал странице (обёртка над suiPost);
  // pageSend(data) — MessageEvent с source = рамка и origin = suiFrame.origin; reply(id) — until(result с этим id);
  // trace(method, path) — строки window.CONSOLEM_TRACE (включить до открытия) с этим методом и началом пути
  ok(BRIDGE_OPS.get("getUnit").bridge === "read" && BRIDGE_OPS.get("runUnitAction").bridge === "act" && BRIDGE_OPS.get("patchUnit").bridge === "draft", "разметка моста — из x-bridge контракта");
  ok(!BRIDGE_OPS.get("testReset").bridge && !BRIDGE_OPS.get("applyAccess").bridge, "служебное и права закрыты");
  const host = sent.find((m) => m.type === "init").host;
  ok(host.bridge.ops.getUnit === "read" && !("testReset" in host.bridge.ops) && host.bridge.limits.calls === 8, "init.host.bridge называет открытые операции и пределы");
  // getUnit своего uid → ok, 200, body.uid === uid; listUnits {ids: камеры объекта} → body.items.length — их число
  // testReset, applyAccess, "noSuchOp" → ok false, status 0, NOT_SUPPORTED; в CONSOLEM_TRACE нет "/test/" и "/access/apply"
  // getUnit {uid: "../test/reset"} → status 404; в журнале путь "/units/..%2Ftest%2Freset", запроса к /test/reset нет
  // getUnit без uid → VALIDATION_FAILED, field "/params/uid"; listUnits {evil: 1} → VALIDATION_FAILED, field "/params/evil"
  // runUnitAction {uid, action: <команда вида>} → 200; GET /units/{uid} показывает итог команды
  // listLicenses при CAPS.operations без listLicenses → NOT_SUPPORTED (вернуть CAPS после)
  // 9 вызовов разом, ответ сервера задержан (обёртка API.raw с ожиданием) → у девятого BUSY, восемь — ok
});
```

  Добавить файл в `SCENARIOS` и `FOCUS_ALONE` в `tests/selftest.js`.

Run: `python3 tools/check_ui.py --page index_NN_stranica-podsistemy-most.html tests/ui-stranica-most.js`
Expected: одна строка `PASS  на этой странице моста шага 2 нет`: функций моста ещё нет.

- [ ] **Step 2: Хост.** Реализовать `bridgeOpsBuild`, `bridgeOpsShown`, `bridgeRequest`, `bridgeCall`, `bridgeFail`, `SUI_ON.call` и `suiHostInfo().bridge` в новом разделе прототипа. Порядок проверок в `bridgeCall`: `op` известен → `x-bridge` есть → `can(op)` → при `draft` (задача 4) → параметры → запрос. Ответ `status >= 400` → `ok: false`, `problem` — тело. Исключение `{status: 0}` клиента → `UPSTREAM_UNAVAILABLE`. Ответ с `etag` — в `etag`.

- [ ] **Step 3: Библиотека.** В `api/setup-bridge.js`: `session.call`, `session.can`, `session.bridge` (есть ли `init.host.bridge`). Номер `id` — свой счётчик библиотеки. Ответ сопоставляется по `id`. Ответ на неизвестный `id` библиотека пропускает.

- [ ] **Step 4: Сценарий проходит.**

Run: `python3 tools/check_ui.py --page index_NN_stranica-podsistemy-most.html tests/ui-stranica-most.js`
Expected: все строки `PASS`.

Run: `python3 tools/check_ui.py tests/ui-stranica-most.js`
Expected: на `index.html` одна строка `PASS  на этой странице моста шага 2 нет`. Это правка общих `tests/` и `api/`, поэтому ещё `python3 tools/check_api.py && python3 tools/run_api_tests.py` — `RESULT pass`.

- [ ] **Step 5: Коммит и push** (push в фоне, ссылку на Pages дать сразу).

```bash
git add index_NN_stranica-podsistemy-most.html assets/i18n-en-NN.js protos.html api/setup-bridge.js tests/ui-stranica-most.js tests/selftest.js
git commit -m "Прототип NN: мост страницы подсистемы — вызов операций read и act по x-bridge"
git pull --rebase && git push
```

### Task 4: Черновик моста: правка, создание, перенос и удаление объектов одной операцией

**Files:**
- Modify: прототип — раздел моста; `cardDiff` (раздел «Карточка объекта: черновик → план», 7743–7763 в `index.html`), `cardApiItems` (раздел «Очередь на сервере», 40106–40147), `cardApply` (7835–7891), `cardRestore`, `cardLeaveAsk` (7787–7791)
- Modify: `api/setup-bridge.js` — ничего нового (вызов — `session.call`), только `onDraft`/`onApplied` отдают `steps`
- Modify: `assets/i18n-en-NN.js`
- Test: `tests/ui-stranica-most.js`

**Interfaces:**
- Consumes: `bridgeCall`, `bridgeFail` (задача 3); `cardDraft`, `cardEnsureBase(n)`, `cardDiff()`, `cardPlan()`, `cardApply()`, `apiQueue` (index.html); `askConfirm(title, msg, warn, okLabel, onOk, {typeCount, html, onCancel})`; `unitsByIds(ids)`; `hwVer`; `locName`; сообщения шага 1 `draft`, `applied`, `revert`.
- Produces:
  - `BridgeStep = {step: string, op: string, item: OperationItemRequest, uid: string, version?: string, label: string, toT: string}`; хранится в `cardDraft.bridge: BridgeStep[]`.
  - `bridgeDraft(msg) → Promise<BridgeResult>` — ветка `bridgeCall` для `draft`: `readOnly` → `PERMISSION_DENIED` (`status: 0`, `params: {readOnly: true}`); шаги по таблице «Как `draft` ложится на шаг операции»; версия шага — `hwVer.get(uid)` или `GET /units/{uid}` в момент вызова; удаление — после `bridgeDeleteAsk`; ответ `status: 202`, `body: {drafted: true, step}` (у нескольких шагов — `steps: [...]`).
  - `bridgeDeleteAsk(uids: string[]) → Promise<boolean>` — `askConfirm` с `typeCount: uids.length`, имена из `unitsByIds` (до 10 и «и ещё N»), строка о потомках, слова «Консоль удалит их по кнопке «Применить»».
  - `bridgeDraftRows(n, out)` — вызов в конце `cardDiff()`: строка `{node: n, bridge: step, label, fromT: "—", toT}` на каждый шаг.
  - `bridgeApiItems() → OperationItemRequest[]`, `bridgeVersions() → {[uid]: version}`. `cardApiItems` отделяет строки `r.bridge` до проверок `r.node !== n` и добавляет их шаги в конец. `cardApply` добавляет `bridgeVersions()` в `expectedVersions`.
  - `bridgeAppliedSteps(op) → Array<{step, state, code?, createdId?}>` — по `op.items[index]` и порядку шагов; уходит в `applied.steps`.
  - `cardLeaveAsk(go, onStay?)` — второй необязательный параметр уходит в `onCancel` диалога.

- [ ] **Step 1: Проверки черновика (сначала падают).** В `tests/ui-stranica-most.js`, после блока задачи 3:

```js
// patchUnit {uid: s1, body: {name: "Мост 1"}} → status 202, body.drafted, body.step; в CONSOLEM_TRACE нет PATCH и POST /operations;
ok(cardDiff().some((r) => r.bridge?.step === r1.body.step), "шаг моста — строка черновика карточки");
// patchUnit своего uid → VALIDATION_FAILED, field "/params/uid"
// createUnits {items: [{kind: <дочерний вид>, parentId: uid, name: "Мост новый"}]} → drafted; без parentId → NOT_SUPPORTED
// deleteUnit {uid: s2}: открыт #confirm, есть #confirmCountInp, #confirmOk.disabled; "2" — всё ещё disabled; "1" — нет; confirmWith(1) → drafted
// deleteUnit {uid: s3} → «Отменить» (#confirmCancel) → CANCELLED, строк черновика столько же
// deleteObjects с id правила → NOT_SUPPORTED; createOperation с шагом action → NOT_SUPPORTED
// moveUnit {uid: s3, body: {parentId: ctrl2}} → drafted
// pageSend({type: "change", patch: {<своё свойство>: …}}); cardPlan() → в плане строки моста с подписями; cardApply()
ok(await until(() => trace("POST", "/operations").length === 1), "«Применить» — одна POST /operations");
// тело (CONSOLEM_TRACE тел не пишет — обёртка над API.raw сохраняет тело POST /operations):
//   items — правка страницы плюс 4 шага моста; expectedVersions содержит версии s1, s2, s3
// sent: applied со steps — у всех state "ok", у шага createUnit — createdId; на сервере: s1 переименован, новый есть, s2 нет, s3 у ctrl2
// «Отменить» в тосте → откат: s2 снова есть, нового нет, s1 с прежним именем
// версия: шаг patchUnit {uid: s1}, затем API.patch(`/units/${s1}`, {name: "Чужое"}, версия) — чужая правка; «Применить» →
//   стандартный конфликт версий; на сервере s1.name === "Чужое"
// «Сбросить» → sent: revert со steps [] ; cardDiff() пуст
// readOnly: suiFrame.readOnly = true; patchUnit → PERMISSION_DENIED, status 0, params.readOnly; init.host.bridge.ops без draft
```

Run: `python3 tools/check_ui.py --page index_NN_stranica-podsistemy-most.html tests/ui-stranica-most.js`
Expected: `FAIL` у строк черновика (ветки `draft` ещё нет: `NOT_SUPPORTED` или нет строки в `cardDiff`).

- [ ] **Step 2: Реализовать** `bridgeDraft`, `bridgeDeleteAsk`, `bridgeDraftRows`, `bridgeApiItems`, `bridgeVersions`, `bridgeAppliedSteps`, второй параметр `cardLeaveAsk`. `cardRestore` очищает `cardDraft.bridge`. Сообщение `draft` странице несёт `steps`. Подписи строк плана — новые ключи `i18n` по `docs/TEXTS.md`: «Изменить «{имя}»», «Добавить: {вид} «{имя}»», «Удалить «{имя}»», «Перенести «{имя}» в «{родитель}»», «Папки «{имя}»». Английский — в `assets/i18n-en-NN.js`. Режим «при уходе» (если часть 05 его сделала) применяет шаги моста тем же путём.

- [ ] **Step 3: Сценарий проходит.**

Run: `python3 tools/check_ui.py --page index_NN_stranica-podsistemy-most.html tests/ui-stranica-most.js`
Expected: все строки `PASS`.

- [ ] **Step 4: Коммит и push.**

```bash
git add index_NN_stranica-podsistemy-most.html assets/i18n-en-NN.js api/setup-bridge.js tests/ui-stranica-most.js
git commit -m "Прототип NN: черновик моста — правка, создание, перенос и удаление объектов страницей, удаление с вводом числа, «Применить» одной операцией"
git pull --rebase && git push
```

### Task 5: Подписка на поток, переход со вспышкой, подтверждение

**Files:**
- Modify: прототип — раздел моста; `apiOnEvent` (5982–6038 в `index.html`), `watchIds` (раздел «Дерево по запросу», около 10462), `suiClose`
- Modify: `api/setup-bridge.js`
- Modify: `assets/i18n-en-NN.js`
- Test: `tests/ui-stranica-most.js`

**Interfaces:**
- Consumes: `apiOnEvent(m)`, `watchIds()`, `watchSoon()`, `LIM.watchMax`; `pick(id, {tab})`, `hwJumpFlash`, `hwFlashLanding` (через `pick`); `goApp("hw")`; `hwEnsure(ids)`; `cardLeaveAsk(go, onStay)` (задача 4); `askConfirm`; `KINDS.get(kind).label`.
- Produces:
  - `let bridgeSubs = new Map()` — `sub → {entityIds: Set, kinds: Set, types: Set | null}`.
  - `bridgeSubscribe(msg) → BridgeResult` (`BUSY` сверх `BRIDGE_SUBS_MAX` или сверх `watchMax` объектов), `bridgeUnsubscribe(msg)`; `SUI_ON.subscribe`, `SUI_ON.unsubscribe`.
  - `bridgeOnEvent(m: StreamMessage): void` — первой строкой `apiOnEvent`; шлёт `event {sub, message: m}` подходящим подпискам.
  - `bridgeWatchIds() → string[]` — `watchIds()` добавляет их сразу после `sel`; `watchSoon()` после подписки и отписки.
  - `bridgeNavigate(msg) → void` и `SUI_ON.navigate`.
  - `bridgeConfirm(msg) → Promise<boolean>` и `SUI_ON.confirm`; `let bridgeConfirmOpen = false`.
  - `bridgeDrop() → void` — снимает подписки, ждущие ответы и открытый `confirm` (диалог закрыт, ответа нет); `suiClose()` вызывает её.
  - Библиотека: `session.subscribe(filter: {entityIds?, kinds?, types?}, onEvent: (message) => void) → Promise<() => void>`, `session.navigate(uid: string, tab?: string) → Promise<BridgeResult>`, `session.confirm(opts: {title, text, lose?, keep?, count?, okLabel?}) → Promise<boolean>`.

- [ ] **Step 1: Проверки (сначала падают).**

```js
// subscribe {id: "s1", entityIds: [domainId], types: ["discovery.progress", "discovery.finished"]} → result ok, body.sub "s1"
// call startDiscovery {domainId} → 202; until(sent: event, sub "s1", message.type "discovery.finished"); события чужой камеры в s1 не пришли
// subscribe {id: "s2", entityIds: [cam]} → watchIds() содержит cam; unsubscribe {sub: "s2"} → не содержит
// 16 подписок есть → 17-я BUSY
// bridgeOnEvent({type: "stream.reset"}) → у каждой подписки event со stream.reset
// confirm {id: "c1", title: "Поставить на охрану", text: "<img src=x>", lose: ["Тревоги датчиков"], count: 2}:
ok(document.getElementById("confirm").classList.contains("open") && !document.querySelector("#confirm img") && document.getElementById("confirmMsg").textContent.includes("<img src=x>"), "текст страницы — текстом");
// в диалоге строка «Спрашивает страница вида «<подпись SUI_KIND>»»; есть #confirmCountInp; второй confirm "c2" → BUSY;
// confirmWith(2) → result c1 {confirmed: true}; ещё один → #confirmCancel → {confirmed: false}
// рамка закрылась при открытом confirm: suiClose() → #confirm закрыт, ответа нет, bridgeSubs.size === 0, cam нет в watchIds()
// navigate {id: "n0", uid: "нет-такого"} → NOT_FOUND
// черновик не пуст; navigate {id: "n1", uid: cam} → диалог «Изменения не применены»; «Остаться» → CANCELLED, sel — прежний
// черновик пуст; navigate {id: "n2", uid: cam, tab: "acc"} → sel === cam, tab === "acc";
ok(await until(() => document.querySelector(".hd h1.acc-flash")), "переход по ссылке из страницы моргает заголовком");
// ответа n2 нет, рамки нет, bridgeSubs.size === 0
```

Run: `python3 tools/check_ui.py --page index_NN_stranica-podsistemy-most.html tests/ui-stranica-most.js`
Expected: `FAIL` у новых строк.

- [ ] **Step 2: Реализовать** функции из Interfaces. `bridgeNavigate`: `uid` не найден (`hwEnsure`) — `NOT_FOUND`; тот же объект — `goTab(tab)` и `ok: true`; иначе `hwJumpFlash = true; goApp("hw"); pick(uid, {tab}); hwJumpFlash = false`, а при непустом черновике — через `cardLeaveAsk(go, onStay)`. `bridgeConfirm`: `askConfirm` без `html` для текста страницы; строка «Спрашивает страница вида «…»» и списки «Пропадёт» и «Останется» consolem собирает сам через `escHtml`; `count` → `typeCount` с `countLabel` «Чтобы подтвердить, ввести число» (команда страницы может ничего не удалять). Новые тексты — ключи `i18n` и английский в `assets/i18n-en-NN.js`.

- [ ] **Step 3: Сценарий проходит.**

Run: `python3 tools/check_ui.py --page index_NN_stranica-podsistemy-most.html tests/ui-stranica-most.js`
Expected: все строки `PASS`.

- [ ] **Step 4: Коммит и push.**

```bash
git add index_NN_stranica-podsistemy-most.html assets/i18n-en-NN.js api/setup-bridge.js tests/ui-stranica-most.js
git commit -m "Прототип NN: мост страницы — подписка на поток, переход со вспышкой, подтверждение consolem"
git pull --rebase && git push
```

### Task 6: Тестовая страница «сложного» экрана и полный цикл

**Files:**
- Modify: `SUI_TEST_PAGE` и её скрипт рядом (как устроено в части 05; без `on…` в разметке)
- Test: `tests/ui-stranica-most.js`

**Interfaces:**
- Consumes: библиотека `api/setup-bridge.js` (задачи 3–5), данные стенда (задача 2), `/test/reset` с `actAs` (`api/server.js`, `TEST_ROUTES`).
- Produces: блоки страницы (видны, только если `session.bridge`):
  1. «Камеры» — `listUnits {ids}` по свойству ссылок, имя и связь; щелчок — `navigate`.
  2. «Найдено в сети домена» — `getDiscovery {domainId}`; «Искать снова» — `startDiscovery` и подписка на `discovery.*`; «Остановить» — `stopDiscovery`.
  3. Дети объекта — `listUnits {parentId}`; «Добавить» — `createUnits` в черновик; «Удалить» — `deleteUnit` в черновик; строки черновика помечены.
  4. Команда вида — `confirm`, затем `runUnitAction`; отказ показан словами по `problem.code`.

  Прогоны: `#run=<имя>` в адресе рамки (и `hashchange`) — страница сама проходит шаги и шлёт `{proto: "setup/1", type: "x-run", run, step, ok, detail}`. Тип `x-run` — вне протокола, хост его пропускает. Имена: `read`, `discovery`, `draft`, `confirm`, `navigate`, `denied`, `nobridge`.

- [ ] **Step 1: Проверки полного цикла (сначала падают).** Помощник сценария `run(name)`: задать `frame.src = <адрес без #> + "#run=" + name`, собирать `x-run` от `frame.contentWindow` до шага `done`.

```js
for (const name of ["read", "discovery", "draft", "confirm"]) {
  const steps = await run(name);
  ok(steps.length > 1 && steps.every((s) => s.ok), `тестовая страница, прогон ${name}: ${steps.filter((s) => !s.ok).map((s) => s.step).join(", ") || "все шаги"}`);
}
// draft: после прогона cardDiff() содержит шаги страницы; cardPlan(); cardApply() → одна POST /operations; страница получила applied.steps
// navigate: прогон доходит до navigate к первой камере → sel — эта камера, h1 моргает
// nobridge: suiHostInfo без bridge (обёртка), рамка заново → страница сообщает «блоки шага 2 скрыты», change шага 1 работает
// права: API.raw("POST", "/test/reset", {fixture: "demo", actAs: <вход только с просмотром>}); открыть SUI_UNIT;
//   init.readOnly === true, в init.host.bridge.ops нет draft; прогон denied:
//   runUnitAction → status 403, PERMISSION_DENIED (ответ сервера дошёл до страницы), createUnits → PERMISSION_DENIED со status 0
```

Вход только с просмотром — пользователь роли «Только просмотр» из набора (сейчас `elena`). Исполнитель сверяет, что у роли есть `view` и нет `edit` на класс доступа `SUI_KIND`. Если это не так, тест берёт `fixturePatch` с такой ролью, как `tests/api-access.js` (около строки 451).

Run: `python3 tools/check_ui.py --page index_NN_stranica-podsistemy-most.html tests/ui-stranica-most.js`
Expected: `FAIL` у прогонов: блоков и `#run` на странице ещё нет.

- [ ] **Step 2: Страница.** Сделать блоки и прогоны по Interfaces. Своего кода протокола у страницы нет, только библиотека (описание решения, раздел 10). Тексты страницы — по `docs/TEXTS.md`, язык — из `init.lang`.

- [ ] **Step 3: Сценарий проходит; общее не задето.**

Run: `python3 tools/check_ui.py --page index_NN_stranica-podsistemy-most.html tests/ui-stranica-most.js`
Expected: все строки `PASS`.

Run: `python3 tools/check_api.py && python3 tools/run_api_tests.py && python3 tools/check_ui.py`
Expected: `RESULT pass`: страница стенда — в `api/`, поэтому её проверяют сразу. На `index.html` (хост шага 1) сценарий части 05 проходит со страницей шага 2.

- [ ] **Step 4: Посмотреть глазами.** Открыть `index_NN_stranica-podsistemy-most.html#node=<SUI_UNIT>`, сделать снимок, прочитать ошибки консоли. Блоки видны, тема та же, высота рамки по `height`.

- [ ] **Step 5: Коммит и push.**

```bash
git add api/plugins tests/ui-stranica-most.js
git commit -m "Прототип NN: тестовая страница сложного экрана — камеры по ссылкам, найденное в сети, дети в черновике, команда с подтверждением; полный цикл и отказ по правам"
git pull --rebase && git push
```

### Task 7: Запрос к w2c и отчёт о пробелах

Эту задачу можно делать сразу после задачи 2: она зависит только от контракта.

**Files:**
- Create: `api/requests/<ГГГГ-ММ-ДД-ЧЧММССZ>-owner-setup-ui-step2-request.md`
- Modify: `api/requests/README.md` — строка таблицы
- Modify (если нужно): `docs/axxon-one-gaps.html`

**Interfaces:**
- Consumes: версия X.Y.Z и коммит из `origin/main` (задачи 1–2); [120707Z](../../../api/requests/2026-11-18-120707Z-owner-setup-ui-iframe-request.md) — шаг 1.
- Produces: запрос `Кому: w2c`, `Статус: новый`, по скиллу `vms-requests` и разделу «Запрос вместо правки» скилла `api-contract`.

- [ ] **Step 1: Написать запрос.** Пункты:
  1. Шаг 2 протокола `setup/1` в контракте X.Y.Z: `call`, `subscribe`, `navigate`, `confirm`, разметка `x-bridge`. От бэкенда ничего нового не нужно, кроме проверки прав на каждой операции `read` (страница вызывает их с правами человека).
  2. Просьба назвать операции, которые нужны страницам подсистем w2c, но закрыты (`BRIDGE_CLOSED`).
  3. API видео (вопрос В2): когда у него будет описание, ему нужна та же разметка `x-bridge`.
  4. psim-sdk: новая версия `api/setup-bridge.js` с методами шага 2 — для авторов плагинов, вместе с п. 9 запроса 120707Z.

  Тексты — по `docs/TEXTS.md` для документов: полные предложения, без пассива.

- [ ] **Step 2: Отчёт о пробелах.** Найти, задевает ли прототип пункт отчёта (`grep -n -i "плагин\|страниц\|setup" docs/axxon-one-gaps.html`). Если прототип делает функцию из отчёта — строка в `PROTO` по `docs/axxon-one-gaps.md`, раздел «Прототипы», шаг 1, и проверка отчёта из `docs/axxon-one-gaps.md`, шаг 8. Нет такой функции — ничего не менять.

- [ ] **Step 3: Коммит и push.**

```bash
git add api/requests/ docs/axxon-one-gaps.html
git commit -m "API: запрос владельца к w2c — своя страница подсистемы, шаг 2: мост к операциям и x-bridge"
git pull --rebase && git push
```

### Task 8: Проверка прототипа и перенос в `index.html`

По просьбе владельца («перенеси из прототипа NN в основной»), по скиллу `proto-promote`.

**Files:**
- Modify: `index.html`, `assets/i18n-en.js`, `CHANGES.md`, `protos.html`
- Delete: `index_NN_stranica-podsistemy-most.html`, `assets/i18n-en-NN.js` (шаг 6 скилла)
- Modify: `api/TESTS.md` — строка `ui-stranica-most.js` в таблице сценариев

**Interfaces:**
- Consumes: всё из задач 3–6.
- Produces: мост шага 2 в `index.html`; сценарий `tests/ui-stranica-most.js` на `index.html` проходит целиком (охрана больше не срабатывает).

- [ ] **Step 1: Полная проверка прототипа** (шаг 1 скилла `proto-promote`).

Run: `python3 tools/check_ui.py --page index_NN_stranica-podsistemy-most.html`
Expected: `RESULT pass` (предупреждения `outline.py --check` исправить: новый раздел с заголовком `// ── … ──`).

Run: открыть `index_NN_stranica-podsistemy-most.html?selftest`
Expected: самопроверка — все сценарии `PASS`.

Run: `python3 tools/check_perf.py --page index_NN_stranica-podsistemy-most.html`
Expected: `RESULT pass`: мост трогает поток и `watchIds`.

- [ ] **Step 2: Перенос.** `git diff <коммит копии> HEAD -- index_NN_stranica-podsistemy-most.html` и перенос только этого поверх текущего `index.html`. Английские ключи — из `assets/i18n-en-NN.js` в `assets/i18n-en.js`.

- [ ] **Step 3: Проверки `index.html`.**

Run: `python3 tools/check_api.py && python3 tools/run_api_tests.py && python3 tools/check_ui.py && python3 tools/check_perf.py --quick`
Expected: везде `RESULT pass`; в `tests/ui-stranica-most.js` нет строки «на этой странице моста шага 2 нет».

- [ ] **Step 4: Коммит** — `Макет: из прототипа NN — мост страницы подсистемы: операции по x-bridge, черновик одной операцией, подписка, переход, подтверждение`, запись в `CHANGES.md`. Статус в `protos.html` — «принят». Отчёт о пробелах — шаг 5 скилла (`PROTO` → `DONE`, если строка была). Удалить прототип (`git rm`, «(удалён)» в `protos.html`). Затем `git pull --rebase && git push`.

## Открытые вопросы владельцу

1. **Удаление в черновике.** План подтверждает удаление числом в момент вызова страницы. «Отменить» после записи — это откат операции в тосте после «Применить», а не отсчёт до записи, как у удаления из дерева. Так подходит? Иначе удаление из моста не ляжет в одну операцию с остальной правкой.
2. **Что не выражается шагом операции.** Создание корневого объекта (`createUnits` без `parentId`) и запись настроек отдельными путями профилей (`putUnitRecordingTarget`, `putUnitPreset`) в черновик не ложатся, и мост отвечает `NOT_SUPPORTED`. Нужен ли для них шаг `OperationItemRequest` (правка механизма, отдельная версия)?
3. **Токен раздачи видео.** `startUnitLive` через мост отдаёт странице `whepUrl` и `token` раздачи. Это не токен consolem, но это доступ к видео камеры до `expiresAt`. Пропускаем так, как в описании решения, или только после отдельного API видео (В2)?
4. **Код `CANCELLED`.** Он есть только в протоколе моста (`setup-ui.schema.json`), а не в `ProblemCode` контракта: новое значение в ответе контракта было бы ломающим. Подходит?
5. **Закрытые операции — в `tools/check_api.py`, а не `"x-bridge": "none"` в контракте.** Бэкенды и авторы страниц видят в контракте только открытые операции. Нужен ли явный `none` в `openapi.json`, чтобы закрытое было видно без нашего репозитория?
6. **Кто человек.** `getMe` и `getAccess` закрыты, и страница не знает, кто её открыл. Нужно ли странице имя или роль человека (`init.user`)? Если нужно, это правка шага 1 (`init`), не моста.

## Что не входит

- Работа в psim-sdk (ADR, библиотека в `/static`, эмулятор, шаблон генератора) — делают его авторы; план передаёт им библиотеку через запрос задачи 7.
- Отдельный API видео и его разметка: ждёт ответа w2c на В2.
- Свой сервер тестовой страницы стенда: на стенде его нет (рамка без `allow-same-origin`). Свои команды страницы только описаны в `api/SETUP-UI.md`.
- Режим применения «при уходе» и режим сравнения — это часть 05. Здесь шаги моста только применяются тем же путём.
- Права «по месту» (`everything-is-a-plugin.md`) — решение владельца позже.
- Страницы `mode: tab` — они пишут сами (этап 1 w2c), мост у них не работает.
- Разметка `x-bridge` у путей профилей, которые перенесёт п. 7 переработки (`api/profiles/*.openapi.json`): проверка `check_bridge` уже проверит их, когда такие файлы появятся.
