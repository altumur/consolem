# Универсальная модель объектов — план работ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** рядом с базовым макетом собрать `index_generic.html` + `api-generic/` + `tests-generic/`, где контракт, тестовый сервер, набор, тесты и интерфейс работают на ядре `/kinds` + `/units` с профилями, а объект незнакомого вида настраивается без кода интерфейса.

**Architecture:** копии `index.html`, `api/`, `tests/` переделываются по этапам 0–5 из ответа altumur. Сервер — один склад `Unit` с реестром описаний видов; всё «данное» о виде (родители, схема, подписи, действия, события, класс доступа) — из описаний, смысл известных видов — хуками профилей. Интерфейс сохраняет внутренние узлы `{type,…}` и ручные экраны; шов — вход и выход кэша; вид без ручного экрана рисуется формой по схеме.

**Tech Stack:** браузерный JS без сборки (IIFE, глобальные `window.Consolem*`), OpenAPI 3.1 / JSON Schema 2020-12 (подмножество), Python 3 + headless Chrome для проверок (`tools/*.py`), Node для `serve_api.mjs`.

**Spec:** [`docs/superpowers/specs/2026-11-03-generic-model-design.md`](../specs/2026-11-03-generic-model-design.md). Наброски схем — приложение Д запроса [`…-analysis.md`](../../../api/requests/2026-11-03-065231Z-mockup-generic-model-analysis.md), поправки — ответ altumur [`…-response.md`](../../../api/requests/2026-11-03-065231Z-mockup-generic-model-response.md).

## Global Constraints

- `index.html`, `api/**`, `tests/**` — не менять ни байта. Проверка в конце каждой задачи: `git status --porcelain index.html api tests` — пусто.
- **Не коммитить.** Вместо шага «Commit» — шаг «Проверить, что изменены только разрешённые пути». Коммит — только по слову пользователя.
- Новая страница — `index_generic.html` в корне репозитория (относительные пути к `assets/`).
- Инструменты `tools/*.py` получают параметры `--api DIR` (по умолчанию `api`), `--tests DIR` (по умолчанию `tests`), `--page FILE` (по умолчанию `index.html`); без параметров поведение прежнее.
- Код и комментарии — в стиле файла, который правишь; комментарии и сообщения — по-русски; сообщения тестов — по-русски.
- Правила интерфейса CLAUDE.md на новой странице: без `on…=` в разметке (`onEv`, `data-on-click`), удаление — `askConfirm(…, {typeCount:N})`, моргание при переходе (`accFlash`/`hwFlashLanding`).
- Подпись в контракте — `Text {key, text, lang}`; интерфейс сначала ищет `key` в словаре (`i18n`), затем показывает `text`.
- `Problem.field` на путях ядра — JSON Pointer в теле запроса (`/properties/mode`); `Problem.errors[]` необязателен, минимум одна ошибка.
- `uid` объекта = нынешний `id` записи из `api/fixtures/demo.json`, формат UUID не меняется.
- `one-domain.json`, `large.json`, `openapi.js`, `fixture.js` в `api-generic/` руками не правятся: их собирают `tools/profile_fixture.py --api api-generic` и `tools/build_api.py --api api-generic`.

## Review Focus

- **Незнакомое поле или незнакомый ключ `x-*` в описании вида** — интерфейс его пропускает и показывает поле как текст только для чтения, а не падает. Тест: задача 9, `ui-unknown.js` «поле неизвестного типа — только чтение».
- **Описания вида нет (404 на `GET /kinds/{kind}`) или пришёл `kinds.changed` во время открытой карточки с черновиком** — узел показывается с общей иконкой и кодом вида, правка запрещена; черновик не теряется, карточка перерисовывается после перечитывания. Тесты: задача 4 `api-units.js` «объект вида без описания читается», задача 9 `ui-unknown.js` «kinds.changed при черновике».
- **Секреты (`writeOnly`) и `x-bound-to`** — ответ никогда не содержит значения, `Unit.secrets[имя]=true`; смена поля из `x-bound-to` без нового секрета — 422 с указателем на поле секрета. Тест: задача 4 `api-units.js` «секрет не возвращается», «bound-to требует секрет».
- **Групповая операция по объектам разных видов, где поле есть не у всех** — шаг `set` для объекта без поля в схеме падает по строке (`failed` с указателем), остальные проходят. Тест: задача 4 `api-units.js` «set по разным видам — частичный успех».
- **Большой домен (`large`, 250 000 камер)** — `/tree/children`, `/units?parentId=` и `/units?ids=` отвечают страницами в пределах `limits`, без полного прохода склада. Тест: задача 11, `check_scale.py --api api-generic --page index_generic.html`.

---

## Карта файлов

| Файл | Отвечает за |
|---|---|
| `index_generic.html` | копия `index.html`; подключает `api-generic/*.js`; шов `unitNode`/`nodeToUnit`; каталоги видов из `/kinds`; форма по схеме |
| `api-generic/openapi.json` | контракт после этапа 5 |
| `api-generic/kinds.js` | `window.ConsolemKinds`: реестр описаний видов, ETag, родители, `creatable`, проверка `properties` по схеме вида с указателями |
| `api-generic/units.js` | `window.ConsolemUnits`: склад `Unit` с индексами |
| `api-generic/profiles.js` | `window.ConsolemProfiles`: хуки профилей — перенос смысла из `api/server.js` |
| `api-generic/server.js` | маршруты, операции, поток, предметные API — поверх `kinds.js`/`units.js`/`profiles.js` |
| `api-generic/rule-engine.js` | движок правил по событиям и действиям из описаний видов |
| `api-generic/contract.js`, `client.js`, `whep-stub.js` | как в `api/`; `contract.js` — плюс ключевые слова `if/then`, `dependentSchemas`, `readOnly`, `writeOnly`, `const`, `maxLength`, `maxItems`, `maximum` для схем видов |
| `api-generic/fixtures/demo.json` | `kinds` + `units` + остальные разделы как в `api/` |
| `api-generic/*.md` | документы |
| `tools/generic_fixture.py` | перевод `api/fixtures/demo.json` → `api-generic/fixtures/demo.json` + виды `security_controller/*`, `test.unknown` |
| `tests-generic/*` | копия `tests/`; `harness.js` с `needs: kind:/implements:`; новые `api-units.js`, `ui-unknown.js` |

Интерфейсы, которыми пользуются несколько задач:

```js
// api-generic/kinds.js
ConsolemKinds.create(kinds /* UnitKind[] */) → {
  list(): UnitKind[], get(kind): UnitKind|null, etag(): string,          // etag — хэш описаний
  put(kindDesc): void,                                                    // /test/kinds; меняет etag
  profileOf(kind, profile): boolean,                                      // implements
  parentsOk(kind, parentKind /* null — корень */): boolean,
  validate(kind, properties, {partial, old}): {field, code, params}[],   // field — JSON Pointer "/properties/…"
  accessClass(kind): string,                                              // UnitKind.access.class || kind
}
// api-generic/units.js
ConsolemUnits.create() → {
  load(units), get(uid), put(unit), remove(uid),
  byParent(parentId), byKind(kind), byDomain(domainId), byRef(uid), byFolder(folderId),
  page(list, cursor, limit) → {items, next}
}
// api-generic/profiles.js — хук получает ctx {units, kinds, db, problem, send, now}
ConsolemProfiles.HOOKS: { [profile: string]: {
  view?(unit, ctx) → unit,                  // вычисляемые поля в ответе (status.observed, recordState…)
  beforeCreate?(unit, parent, ctx) → Problem|null,
  beforeSet?(unit, patch, whole, ctx) → Problem|null,
  afterSet?(unit, before, ctx) → void,
  dependents?(unit, ctx) → {remove: uid[], detach: uid[]},   // каскад удаления
  executor?(unit, ctx) → serverUid|null,    // сервер-исполнитель шага операции
  actions?: { [actionId]: (unit, params, ctx) → {result}|{operation}|Problem },
}}
```

---

### Задача 0: Копии и параметры инструментов

**Files:**
- Create: `index_generic.html` (копия `index.html`), `api-generic/` (копия `api/` без `requests/`), `tests-generic/` (копия `tests/`)
- Modify: `index_generic.html:1756-1762` — `api/` → `api-generic/`; `tests-generic/selftest.js:36-37` — `tests/` → `tests-generic/`; `tests-generic/api.html:37-42` — `../api/` → `../api-generic/`
- Modify: `tools/build_api.py`, `tools/check_api.py`, `tools/check_ui.py`, `tools/run_api_tests.py`, `tools/profile_fixture.py`, `tools/check_scale.py`, `tools/check_webui.py`, `tools/build_webui.py`, `tools/compare_screens.py`, `tools/serve_api.mjs` — параметры `--api`, `--tests`, `--page`

**Interfaces:**
- Produces: каждая команда задач 1–14 вида `python3 tools/X.py --api api-generic --tests tests-generic --page index_generic.html`.

- [ ] **Step 1:** скопировать файлы; поправить пути подключения в трёх местах выше.
- [ ] **Step 2:** добавить параметры в инструменты: все пути `"api/…"` и `"tests/…"` строятся от параметра; `check_ui.py` подставляет `HELPERS` из `--tests`.
- [ ] **Step 3:** прогнать базу без параметров: `python3 tools/check_api.py`, `python3 tools/check_ui.py`, `python3 tools/run_api_tests.py` — результат как до правки инструментов (сравнить сводки).
- [ ] **Step 4:** прогнать копию: те же команды с `--api api-generic --tests tests-generic --page index_generic.html` — те же числа PASS/SKIP, 0 FAIL. Это точка отсчёта.
- [ ] **Step 5:** `git status --porcelain index.html api tests` — пусто.

### Задача 1: Контракт ядра (этапы 0–1) — делает ведущий

**Files:**
- Modify: `api-generic/openapi.json`, `api-generic/contract.js`

**Interfaces:**
- Produces: схемы `UnitKind`, `Unit`, `Text`, `ActionDescriptor`, `EventDescriptor`, `AccessClass`, `Profile`, `UnitCreate`, `UnitPatch` (merge-patch), `UnitsCreateResult`, `Creatable`; операции `listKinds`, `getKind`, `listUnits`, `createUnits`, `getUnit`, `patchUnit`, `deleteUnit`, `moveUnit`, `runUnitAction`, `getCreatable`, `getUnitSchema`, `validateUnits`, `testPutKind` (`PUT /test/kinds/{kind}`); `TreeNode.kind` — строка, `TreeNode.icon`, `TreeNode.implements`, `TreeNode.unit` вместо `row`; `StreamMessage.kind` — строка, `StreamMessage.type` += `kinds.changed`; `Problem.field` — описание «JSON Pointer на путях ядра», `Problem.errors[]`; `OperationItemRequest` += `uid`, `patch`, `action`, `params`, `delete`; `listUnits` — параметры `q`, `fields`, `kind`, `implements`, `status`, `domainId`, `parentId`, `folderId`, `ref`, `ids`, `noFolder`, `noRecord`, `noDetector`, `cursor`, `limit`; `Unit.match {field}` в ответе поиска.
- Поля `UnitKind`: `kind, origin {system, subsystem?, plugin?, pluginVersion?}, label, labelPlural, labelCount?, icon, parents[], children[], dynamicCreate, implements[], capabilities[], access {class, levels[]}, schema, schemaPerUnit, shape (unit|document), actions[], events[], setupUi {url, kinds[], mode: tab|iframe}`; `additionalProperties: true`.
- Поля `Unit`: `uid, kind, parentId, name, domainId, folders[], version, properties, secrets, inherited {имя: {from: unit|domain|default, uid?}}, status {link, observedVersion, observed, conditions[] {type, status, reason, params, since}}, capabilities[]`.
- `ActionDescriptor`: `id, label, execution (instant|longRunning), params, result, confirm {typeCount, text}, group, ruleAction, right`. Расширения схемы вида (описать в `UnitKind.schema`): `x-search,  x-immutable, x-inherit {merge}, x-unique, x-ref {kinds, implements, scope}, x-bound-to, x-rights {scope}, x-enum-labels, x-ui-group, x-ui-tab, x-ui-order, x-ui-unit, x-ui-widget, x-ui-filter, x-ui-advanced`.

- [ ] **Step 1:** добавить схемы и операции ядра по наброску Д.1–Д.2 с полями выше; описания — по-русски, как в остальном контракте.
- [ ] **Step 2:** `contract.js`: ключевые слова `if/then/else`, `dependentSchemas`, `const`, `maxLength`, `maxItems`, `maximum`, `exclusiveMinimum`; `readOnly`/`writeOnly` — проверка направления (в запросе `readOnly` — ошибка, в ответе `writeOnly` — ошибка). Функция `ConsolemContract.validate(schema, value, pointer) → {field, code:"VALIDATION_FAILED", params:{keyword}}[]` для схем видов.
- [ ] **Step 3:** `python3 tools/check_api.py --api api-generic --lint` — контракт валиден (Redocly/Spectral, как сейчас).
- [ ] **Step 4:** проверить, что изменены только `api-generic/`.

### Задача 2: Набор `kinds` + `units`

**Files:**
- Create: `tools/generic_fixture.py`
- Modify: `api-generic/fixtures/demo.json` (генерируется), `tools/check_api.py` (ветка набора для `kinds/units`)

**Interfaces:**
- Consumes: схемы задачи 1.
- Produces: `demo.json` с `kinds: UnitKind[]`, `units: Unit[]`, остальные разделы как в `api/fixtures/demo.json` (ссылки — те же id). Виды: по одному на `DeviceType` (17 кодов как есть: `camera`, `ipsrv`…), `domain`, `server`, `folder`, `volume`, `stream`, `archive.<вид>` по каждому `reference.archiveKinds[].id`, `security_controller/CONTROLLER`, `security_controller/SENSOR`, `test.unknown`, `w2c.example/rows` (строка таблицы с хозяином), `domain.shared` (`shape: document`), `test.perunit` (`schemaPerUnit: true`, схема объекта зависит от свойства `model`). Классы доступа = нынешние ключи `reference.access.levels`.

- [ ] **Step 1:** в `check_api.py` (ветка `--api api-generic`) — проверки набора: каждое `UnitKind.schema` валидно по мета-схеме подмножества; каждый `Unit` проходит `UnitKind.schema` своего вида; `parentId` удовлетворяет `parents`; `x-ref` разрешаются; `uid` уникальны; ссылки в `rules`, `access`, `archiveWatches`, `holds`, `bookmarks` указывают на существующие `uid`. Запустить — FAIL (набора ещё нет).
- [ ] **Step 2:** `tools/generic_fixture.py`: переводит разделы `domains, servers, devices, folders, archives, volumes` в `units` (поля записи → `properties`, `serverId/archiveId/cameraId/…` → свойства со `x-ref`, вычисляемые поля → `status.observed`, членство `folders[].deviceIds` → `Unit.folders`, потоки камеры → объекты `stream`); схемы видов — из `Device`/`Server`/`Archive`/`Volume`/`Folder`/`Domain` контракта `api/openapi.json` + `reference.deviceParams/archiveKinds/detectorKinds/unitOptions`; подписи — из `LB_RU` `index.html` как `{key: "kind.<код>", text, lang:"ru"}`; `security_controller/*` — из `/mnt/hgfs/VmWareShared/psim-sdk/psim_plugins/cmd/security_controller/manifest/plugin.json` и `langs/` (параметр → свойство, `enum_values` → `enum` + `x-enum-labels`, `source.platform_objects CAM` → `x-ref {implements:["vms.camera/1"]}`, `commands` → `actions` `instant`, `events` → `events`, `setup_ui` → `setupUi {url:"stub://plugin/security_controller/setup", mode:"tab"}`); `x-search: true` — у свойств, по которым сейчас ищет `GET /devices?q=` (адрес, номер, производитель, модель) и у `ip_address` контроллера; `test.unknown` — по одному полю каждого типа и виджета, вкладки и группы, секрет с `x-bound-to`, одно действие `instant` с параметрами и одно `longRunning`, два события.
- [ ] **Step 3:** `python3 tools/generic_fixture.py && python3 tools/build_api.py --api api-generic && python3 tools/check_api.py --api api-generic` — набор проходит проверки шага 1.
- [ ] **Step 4:** проверить пути.

### Задача 3: Склад и чтение (этап 1)

**Files:**
- Create: `api-generic/kinds.js`, `api-generic/units.js`, `tests-generic/api-units.js`
- Modify: `api-generic/server.js` (загрузка набора, маршруты чтения, дерево), `tests-generic/harness.js` (`needs: "kind:<вид>"`, `"implements:<профиль>"` по `GET /kinds`; `env.list()` — по `/units`), `tests-generic/api.html` (подключить `api-units.js`, `kinds.js`, `units.js`)

**Interfaces:**
- Consumes: задачи 1–2.
- Produces: `ConsolemKinds`, `ConsolemUnits` (сигнатуры — «Карта файлов»); `GET /kinds` (ETag, 304), `GET /kinds/{kind}`, `GET /units`, `GET /units/{uid}`, `GET /units/{uid}/schema`, `GET /units/{uid}/creatable`, `/tree/children` и `/tree/paths` на складе.

- [ ] **Step 1:** тесты в `api-units.js`: «/kinds отдаёт все виды набора и ETag; повтор с If-None-Match — 304»; «/units?kind=security_controller/CONTROLLER — объекты набора»; «/units?parentId=, ?domainId=, ?implements=vms.camera/1, ?ref=<uid камеры>, ?folderId=, ?ids= — страницами в пределах limits»; «объект: секрет не возвращается, secrets[имя]=true»; «объект вида без описания читается (kind есть, properties как есть)»; «/tree/children layout=servers — узлы с kind=вид объекта, icon, implements»; «/units/{uid}/creatable под контроллером — только SENSOR»; «/units?q= находит камеру по адресу и контроллер security_controller по ip_address, match.field верный»; «/units?q=&fields=vendor — только по производителю»; «/units?q= не ищет по свойству без x-search».
- [ ] **Step 2:** `python3 tools/run_api_tests.py --api api-generic --tests tests-generic --only api-units` — FAIL.
- [ ] **Step 3:** `kinds.js`, `units.js`; `server.js`: `load()` строит склад из `units`, старые таблицы `db.domains/servers/devices/folders/archives/volumes` — представления склада (функции, а не копии), чтобы старые маршруты продолжали работать до задачи 8; `treeKids`/`treeChains` — по складу и `x-ref` (`serverId`, `archiveId`) через индексы.
- [ ] **Step 4:** `api-units` — PASS; весь `run_api_tests.py --api api-generic --tests tests-generic` — как в точке отсчёта (старые тесты на старых путях живы).
- [ ] **Step 5:** проверить пути.

### Задача 4: Запись ядра для видов без профиля (этап 2)

**Files:**
- Modify: `api-generic/server.js`, `api-generic/kinds.js`, `tests-generic/api-units.js`

**Interfaces:**
- Consumes: задача 3.
- Produces: `POST /units`, `PATCH`, `DELETE /units/{uid}`, `POST /units/{uid}/move`, `POST /units/{uid}/actions/{action}`, `POST /units/validate`, шаги `/operations` по `uid` (`set`, `action`, `create`, `delete`, `folders`), `POST /objects/delete` по `uid`, `PUT /test/kinds/{kind}` → `kinds.changed {kinds:[…]}`; события `entity.*` с `kind` = вид.

- [ ] **Step 1:** тесты: «создать test.unknown: 201, version, entity.created»; «PATCH merge-patch с If-Match; без If-Match — 428; чужая версия — 412 с current»; «нарушение схемы — 422 VALIDATION_FAILED, field=/properties/<имя>, params.keyword»; «readOnly в теле — 422»; «x-immutable после создания — 422»; «bound-to требует секрет»; «parent не из parents — 422 PARENT_MISMATCH, field=/parentId»; «действие instant ARM — 200 result, status.observed.armed, событие»; «действие longRunning — 202, операция доходит до ok»; «действие с параметрами не по схеме — 422 field=/params/<имя>»; «set по разным видам — частичный успех, failed с указателем»; «validate не пишет»; «DELETE с детьми — каскад по parents, откат стопкой»; «PUT /test/kinds добавляет поле — kinds.changed, новый ETag, PATCH с новым полем проходит»; «PATCH отвечает сразу; status.observedVersion догоняет version, условие Applied»; «строка w2c.example/rows создаётся под хозяином, без хозяина — 422»; «domain.shared: PUT документа целиком с If-Match, наследуемое поле объекта показывает inherited.from=domain»; «test.perunit: /units/{uid}/schema отдаёт схему объекта, PATCH проверяется по ней».
- [ ] **Step 2:** запустить — FAIL.
- [ ] **Step 3:** реализовать маршруты поверх `kinds.validate`, склада, нынешнего движка операций (`startOperation`, `runItem`, стопка отката); действия видов без хука — универсальные: `instant` пишет `status.observed[action]` и шлёт событие вида, если в описании есть одноимённое; `longRunning` — операция из одного шага.
- [ ] **Step 4:** `api-units` — PASS, остальные — как в точке отсчёта.
- [ ] **Step 5:** проверить пути.

### Задача 5: Профили домена, сервера, папки, хранилища, тома (этап 3, часть 1)

**Files:**
- Create: `api-generic/profiles.js`
- Modify: `api-generic/server.js`, `tests-generic/api-domains.js`, `api-storage.js`, `api-cluster.js`, `api-pages.js`, `api-bulk.js`, `api-read.js`

**Interfaces:**
- Consumes: задачи 3–4.
- Produces: хуки `vms.domain/1` (удаление с `moveTo` как действие `delete`-параметр, последний домен, `domainSummary` в `status.observed`), `vms.server/1` (`probe` и `assign` → действие и `move`, исполнитель шага), `vms.folder/1` (членство `Unit.folders`), `vms.archive/1` (`check` — действие, каскад на камеры, виды хранилищ — свои виды), `vms.volume/1` (`format` — действие `longRunning`, `DISK_TAKEN`, `unfmt`).

- [ ] **Step 1:** переписать названные тесты на `/units`, `/units/{uid}/actions/*`, шаги по `uid`; утверждения о кодах ошибок и состоянии — те же, что в `tests/`; `field` — указателем.
- [ ] **Step 2:** запустить — FAIL.
- [ ] **Step 3:** перенести смысл из `api/server.js` (строки по отчёту разведки: `removeArchive` 1050, `removeVolume`, `removeFolder` 1042, `volumeSet` 824, `/servers/assign` 2910–2960, DELETE домена 2826, `domainSummary` 2315) в хуки `profiles.js`; коды и тексты ошибок прежние.
- [ ] **Step 4:** переписанные тесты — PASS, остальные — без новых FAIL.
- [ ] **Step 5:** проверить пути.

### Задача 6: Профили камеры, потока, детектора, СКУД, предметные API (этап 3, часть 2)

**Files:**
- Modify: `api-generic/profiles.js`, `api-generic/server.js`, `tests-generic/api-devices.js`, `api-hardware.js`, `api-archive.js`, `api-view.js`

**Interfaces:**
- Consumes: задача 5.
- Produces: хуки `vms.camera/1` (запись: `RECORD_FIELDS`, `recordingProblem`, `replica`, `serverWideRows`, recording-target; NAT `keptProblem`; адрес и `IDENTIFIER_TAKEN`/нумерация), `vms.stream/1` (основной поток, `syncMain`), `vms.detector/1` (конфликт шаблонов, встроенный/серверный), `vms.acs/1` (родители СКУД из `parents`, реле двери, команды — `actions`), `vms.live/1`, `vms.ptz/1`, `vms.talk/1`, `vms.timeline/1`; пути `/units/{uid}/live|talk|timeline|playback|holds|bookmarks|archive-fetch|ptz|presets/{n}|recording-target`; `probe` — действие `ipsrv`/`camera`.

- [ ] **Step 1:** переписать тесты на `/units` и предметные пути по `uid`; `typed(type,…)` → `needs kind:`/`implements:`.
- [ ] **Step 2:** запустить — FAIL.
- [ ] **Step 3:** перенести смысл из `api/server.js` (`device()` 340, 421–493, 581–698, 989–1080, 2480–2790) в хуки; родители (`parentFits`, `ACS_UNITS`) — только из `parents` описаний.
- [ ] **Step 4:** PASS; остальные без новых FAIL.
- [ ] **Step 5:** проверить пути.

### Задача 7: Права и правила по описаниям видов (этап 4)

**Files:**
- Modify: `api-generic/openapi.json` (`Role.kindAccess`, `RuleTrigger`, `RuleAction`, `RuleTarget`, `Reference` без `ruleTriggers/ruleActions/eventKinds` по устройствам), `api-generic/rule-engine.js`, `api-generic/server.js`, `tools/generic_fixture.py` (перевод `rules`, `access`, `ruleFires`), `tools/fixture_fires.js` (параметр `--api`), `tests-generic/api-access.js`, `api-rules.js`, `api-automation.js`, `api-assist.js`

**Interfaces:**
- Consumes: задачи 1, 5, 6.
- Produces: `Role.kindAccess {класс: уровень}` вместо полей категорий и `dCam`/`dSens`/…; `objectAccess`/`folderAccess` по `uid`; триггер `{source:"unit", kinds?, implements?, event, match}`; действие `{type:"unitAction", action, params}`; цель `target.include[]` — `{uid}` или `{area: folder|server|domain, uid}`; движок: `TRIGGERS`/`ACTIONS`/`RULE_DEVTYPES`/`COMMAND` — из `kinds` (`events`, `actions`, `access`).

- [ ] **Step 1:** переписать тесты; добавить «правило на ALARM датчика security_controller → unitAction ARM контроллера срабатывает»; «роль с kindAccess security_controller=view не может ARM — 403».
- [ ] **Step 2:** запустить — FAIL.
- [ ] **Step 3:** контракт, движок, перевод набора, `fixture_fires.js`.
- [ ] **Step 4:** PASS; весь `run_api_tests.py --api api-generic --tests tests-generic` — 0 FAIL.
- [ ] **Step 5:** проверить пути.

### Задача 7а: Поиск и ассистент по видам

**Files:**
- Modify: `api-generic/openapi.json` (`AssistWorld`, `AssistFoundFilter`, `AssistPlanItem`, `AssistChange`), `api-generic/server.js` (заглушка ассистента `assistStub`, `assistFoundStub`, `assistRulesStub`), `tests-generic/api-assist.js`, `tests-generic/ui-assist-service.js` и служба ассистента демо-страницы (найти по `assistTurn` в `api-generic/client.js`)

**Interfaces:**
- Consumes: задачи 1, 3, 7.
- Produces: `AssistWorld {reference, kinds, units, rules, schedules, modes, maintenanceWindows, me, roles, licenses}`; `AssistFoundFilter {q, kinds, implements, status, domainId, fields, noFolder, noRecord, noDetector}`; `AssistPlanItem {uid, version, patch, name, changes[] {field, before, after, why}}` (`field` — JSON Pointer).

- [ ] **Step 1:** переписать `api-assist.js` и `ui-assist-service.js` на новый мир; добавить «просьба “поставь контроллеры на охрану” — найденное фильтром kinds=[security_controller/CONTROLLER]»; «просьба “смени режим контроллера на manual” — шаг плана с patch /properties/mode, значение из enum схемы»; «план со значением вне схемы отклоняется 422 с указателем».
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS, остальные без новых FAIL. **Step 5:** проверить пути.

### Задача 8: Снятие старых путей (этап 5, сервер и контракт)

**Files:**
- Modify: `api-generic/openapi.json`, `api-generic/server.js`, `tools/check_api.py` (`PAGED`, `check_capabilities` для `api-generic`), `tools/check_pages.js`

**Interfaces:**
- Produces: в контракте нет `/domains` (CRUD), `/servers*` (CRUD, probe, assign), `/devices*`, `/folders*`, `/archives*`, `/volumes*`, схем `DeviceType`, `Device*`, `*Patch` видов, `UnitOption`, `UnitProperty`, `Capabilities.deviceTypes/foundDeviceTypes/unitTypes/writableFields`, справочников из раздела 5.1 описания. `/domains/{id}/discovery|relays|scenarios` остаются (адрес домена = `uid`).

- [ ] **Step 1:** удалить; `grep -c '"/devices' api-generic/openapi.json` — 0.
- [ ] **Step 2:** `python3 tools/check_api.py --api api-generic` (с `--lint`) и `run_api_tests.py --api api-generic --tests tests-generic` — 0 FAIL; покрытие операций — каждая операция контракта хотя бы в одном тесте.
- [ ] **Step 3:** проверить пути.

> Интерфейс (задачи 9–10) до этой задачи работает на старых путях; задачу 8 выполнять **после** задачи 9.

### Задача 9: Интерфейс — шов, каталоги, форма по схеме

**Files:**
- Modify: `index_generic.html`, `tests-generic/ui-assist.js`, `tests-generic/ui-harness.js` (`uiCacheAll`, `uiDevices`, `uiFolderIds` → `/units`), `tests-generic/ui-*.js` (пути и `.type` по отчёту разведки)
- Create: `tests-generic/ui-unknown.js`; `tests-generic/selftest.js` — добавить его

**Interfaces:**
- Consumes: задачи 3–7.
- Produces в `index_generic.html`:
  - `KINDS` (Map kind → UnitKind) и `kindsLoad()` в `capsLoad`; `kindsChanged(m)` на `kinds.changed` и после `stream.reset`;
  - `SCREEN_OF_PROFILE` — профиль → `n.type` ручного экрана (`vms.camera/1`→`camera`, …); `screenType(kind) → string` (у незнакомого — код вида);
  - `unitNode(u) → node` (заменяет `devNode`, `srvNode`, `folderNode`, `archNode`, `volNode`, сборку домена в `hwFill`; версия — в `hwVer`); `nodeToUnit(n) → {kind, parentId, name, properties, folders}` (заменяет `nodeCreate`); `keyToApi`/`fldToApi` → указатели в `properties`; `RENAME_API` → `PATCH /units/{uid}`;
  - поиск: `goNet` → `GET /units?q=`; `SEARCH_FIELDS` — объединение `x-search` видов из `KINDS` (подписи из схем); `TYPE_FILTERS` — виды и профили; фильтр дерева по полям — `fields=`; ассистент и поиск фразой — `AssistWorld`/`AssistPlanItem` задачи 7а;
  - каталоги из `KINDS`: `LB`, `TYPE_FILTERS`, `WIZ`/`canAdd`, `needsParent`/`parentOpts`, `ic()`, `DEV_WITH_KIDS`, `CAPS.found/units/writable`, `*_PATCH`, `CARD_PROP`/`CARD_FLD_PROP` для полей по схеме;
  - `schemaTabs(n) → [[id, label]]`, `schemaFormHtml(n, tab) → html` (вызывается из `tabsFor`/`formBase` для вида без ручного экрана и для вкладки «Дополнительно»), `schemaWizardHtml(kind, parentUid)`, `unitActionsHtml(n)` → `POST /units/{uid}/actions/{id}` (параметры — форма по схеме, `confirm.typeCount` → `askConfirm`), ссылка «Страница плагина» по `setupUi` (`mode: tab`, `?type=&id=&lang=`).

- [ ] **Step 1:** `ui-unknown.js`: «объект test.unknown виден в дереве с подписью из /kinds»; «карточка: вкладки и группы по x-ui-*, enum с подписями»; «правка поля → Показать план → Применить → PATCH прошёл, версия новая»; «ошибка сервера подсвечивает поле по указателю»; «мастер под контроллером предлагает только датчик, создаёт его»; «команда ARM меняет состояние»; «удаление требует ввода числа 1»; «поле неизвестного типа — только чтение»; «kinds.changed при черновике — черновик цел, новое поле появилось»; «Страница плагина — ссылка с ?type=&id=&lang=»; «переход из поиска на объект моргает»; «строка поиска находит контроллер по ip_address, в фильтре полей есть его поле»; «чип вида security_controller в фильтре дерева оставляет только его объекты».
- [ ] **Step 2:** `python3 tools/check_ui.py --api api-generic --tests tests-generic --page index_generic.html tests-generic/ui-unknown.js` — FAIL.
- [ ] **Step 3:** реализовать по шву: загрузка, события (`HW_EVENT` → единый обработчик `unit`), запись, каталоги, форма по схеме. `n.type===…` в ручных экранах не трогать: тип узла даёт `screenType`.
- [ ] **Step 4:** `check_ui.py … --page index_generic.html` — все сценарии PASS, `index_generic.html?selftest` — зелёный; `check_ui.py` не находит `on…=` в разметке.
- [ ] **Step 5:** выполнить задачу 8; повторить шаг 4 и `run_api_tests.py`.
- [ ] **Step 6:** проверить пути.

### Задача 10: Интерфейс — права и автоматизация по видам

**Files:**
- Modify: `index_generic.html` (экран прав, редактор правил), `tests-generic/ui-access.js`, `ui-rules.js`, `ui-rule-links.js`, `ui-prompts.js`

**Interfaces:**
- Consumes: задачи 7, 9 (`KINDS`).
- Produces: в роли — строки по классам доступа из `KINDS` (подпись класса — подпись первого вида класса или `labelPlural`), уровни — `access.levels`; в правилах — список событий и действий из `events`/`actions` видов, параметры действия — `schemaFormHtml` по `params`.

- [ ] **Step 1:** тесты: «класс security_controller появился в роли, уровень сохраняется»; «правило ALARM датчика → ARM контроллера создаётся из списков описаний».
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** все `ui-*` PASS. **Step 5:** проверить пути.

### Задача 11: Наборы профиля и масштаб

**Files:**
- Modify: `tools/profile_fixture.py` (ветка `--api api-generic`: отбор по видам и профилям вместо `DEVICE_TYPES`, `capabilities.operations` без снятых), `api-generic/fixtures/one-domain.json`, `large.json` (генерируются), `api-generic/server.js` `expandLarge`

- [ ] **Step 1:** `python3 tools/profile_fixture.py --api api-generic && python3 tools/build_api.py --api api-generic`.
- [ ] **Step 2:** `run_api_tests.py --api api-generic --tests tests-generic --fixture one-domain` — 0 FAIL (SKIP по объявленному); `check_ui.py … tests-generic/ui-profile.js` — PASS.
- [ ] **Step 3:** `python3 tools/check_scale.py --api api-generic --page index_generic.html` — пределы как у базы.
- [ ] **Step 4:** `python3 tools/check_webui.py --api api-generic --page index_generic.html` — сборка под CSP проходит.
- [ ] **Step 5:** проверить пути.

### Задача 12: Сверка экранов с базой

**Files:**
- Modify: `tools/compare_screens.py` — режим `--against index.html` (две страницы через API, одни id, одни `SCREENS`)

- [ ] **Step 1:** `python3 tools/compare_screens.py --page index_generic.html --api api-generic --against index.html` — экраны известных видов совпадают; расхождения — только вкладка «Дополнительно» (перечислить в выводе как ожидаемые).
- [ ] **Step 2:** проверить пути.

### Задача 13: Документы и protos.html

**Files:**
- Modify: `api-generic/README.md`, `BACKEND.md`, `FRONTEND.md`, `ACCEPTANCE.md`, `TESTS.md`, `INVENTORY.md` (пометка «исторический, по `api/`»), `protos.html` (строка: `index_generic.html`, автор `git config user.name`, «универсальная модель объектов: ядро /kinds + /units, профили», статус «обсуждается»)

- [ ] **Step 1:** README — карта API ядра, договорённости раздела 6 описания, модель `UnitKind`/`Unit`, список профилей и их свойств, набор `kinds/units`; BACKEND — что реализовать адаптеру, хуки профилей, `kinds.changed` после перезапуска; FRONTEND — шов, форма по схеме, порядок «ключ словаря → text»; ACCEPTANCE — критерии незнакомого вида шагами пользователя (по `ui-unknown.js`); TESTS — команды с `--api/--tests/--page`.
- [ ] **Step 2:** `python3 tools/check_api.py --api api-generic` — сверка чисел операций с `BACKEND.md` проходит.
- [ ] **Step 3:** проверить пути.

### Задача 14: Догнать базу

**Files:** `index_generic.html`, `api-generic/**`, `tests-generic/**`

- [ ] **Step 1:** `git pull --rebase` (без коммитов — `git stash` не нужен, если рабочие изменения только в новых путях; иначе спросить пользователя). `git log --oneline 0c8f18e..HEAD -- index.html api tests`.
- [ ] **Step 2:** для каждого коммита — `git show <коммит> -- index.html api tests` и перенос смысла в новые файлы в терминах ядра (поле `Device` → свойство вида, путь `/devices/…` → `/units/…`).
- [ ] **Step 3:** все проверки задач 9, 11, 12 — повторно, 0 FAIL.
- [ ] **Step 4:** проверить пути.

### Задача 15: Итоговая проверка

- [ ] **Step 1:** `python3 tools/check_api.py --api api-generic --lint`; `python3 tools/run_api_tests.py --api api-generic --tests tests-generic` (`demo` и `one-domain`); `python3 tools/check_ui.py --api api-generic --tests tests-generic --page index_generic.html`; `index_generic.html?selftest`; `check_scale.py`, `check_webui.py`, `compare_screens.py --against index.html` — всё зелёное, вывод сохранить в отчёт пользователю.
- [ ] **Step 2:** база не тронута: `python3 tools/check_api.py`, `python3 tools/check_ui.py`, `python3 tools/run_api_tests.py` без параметров — как в точке отсчёта; `git status --porcelain index.html api tests` — пусто.
- [ ] **Step 3:** отчёт пользователю: что сделано, где смотреть, что не проверено. Коммит — по его слову.
