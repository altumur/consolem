# Часть 07. Особый экран по профилю и профили по особым экранам — план работ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ручной экран выбирается только по профилю вида (`implements`), а не по коду вида. Каждый ручной экран читает схему, подпись и возможности своего вида. Профиль совпадает с полями, которые ручной экран показывает: что экран не показывает, уходит в схему вида и в «Все параметры», что показывает без профиля, входит в профиль.

**Architecture:** одна функция `screenFor(kind)` даёт экран вида по трём ступеням правила. Ступень 1 (своя страница подсистемы) — точка для части 05, здесь она сохраняет нынешнее поведение. Ступень 2 — ручной экран по таблице «профиль → экран», ступень 3 — форма по схеме. Поля, которые экран реально показывает, измеряет инструмент `tools/profile_coverage.py`. Он меняет одно поле объекта в кэше, перерисовывает вкладки экрана и сравнивает разметку. По его отчёту и проверке по коду профили получают по одной младшей версии.

**Tech Stack:** браузерный JS без сборки (`index.html`, прототип `index_NN_ekran-po-profilyu.html`), сценарии `tests/ui-*.js` (`tools/check_ui.py`, headless Chrome), Python 3 (`tools/profile_coverage.py`, `tools/check_api.py`), файлы профилей `api/profiles/*.json` (часть 02).

**Spec:** [предложение о слоях](../2026-11-16-kontrakt-i-podsistemy-predlozhenie.md), пп. 6 и 10 таблицы «Что придётся переработать» и раздел «Где лежит профиль» («Клиент и незнакомая версия»); [своя страница подсистемы](../2026-11-18-setup-ui-iframe-design.md), раздел 4 (три ступени) и раздел 9 (режим сравнения: откуда список полей своего экрана); запрос [«Базовая форма у встроенных видов»](../../../api/requests/2026-11-16-191810Z-owner-base-form-builtin-kinds-request.md) и [ответ mockup](../../../api/requests/2026-11-16-191810Z-owner-base-form-builtin-kinds-response.md) (прототип 77: что уже сделано и «Чего пока нет»); позиция w2c, ответ на вопрос 3 ([запрос](../../../api/requests/2026-11-18-114831Z-w2c-contract-layers-request.md)): mockup решает состав профиля от особого экрана.

> **Сверка с общим планом** ([00-master.md](00-master.md), раздел «Сверка частей» — главнее текста ниже):
>
> - Задача 1 этой части берёт на себя задачу 7 части 02 (С2): `vms.camera/2` → форма по схеме;
> - С3, С4 — `screenPageStep` заменяет часть 05; ступень 1 тип узла не меняет (строка «узел вида со страницей — узел формы по схеме» в разделе Interfaces отменена);
> - Review Focus 3 — в задаче 1 шаг теста: открыта карточка вида с `vms.camera/1`, `PUT /test/kinds/{kind}` снимает профиль (`kinds.changed`) — карточка без перезагрузки становится формой по схеме, неприменённая правка не теряется молча (переносится или consolem называет причину);
> - О2 — `changes[].removed` в задаче 7 — по ответу владельца, умолчание «да».

**Зависит от:** частей 01 и 02. Должны быть файлы `api/profiles/<имя без /N>.json` (`version`, `properties{имя:{schema, meaning, since}}`, `changes`). `GET /kinds` → `profiles[]` должен отдавать `version`. Нужна проверка части 02 в `tools/check_api.py`: «поле сняли без новой старшей версии — ошибка». Часть 03 размечает тесты API по слоям: задача 7 опирается на её метку `profile:<id>`.

## Что осталось от п. 6 (сверка с кодом, `index.html` на `ea28b12`)

Прототип 77 сделал «Все параметры», общий черновик двух форм и `screenType` по `SCREEN_OF_PROFILE`. Тип узла (`n.type`) с тех пор означает **экран**, а не вид. Поэтому ветки `n.type==="camera"` в `tabsForHand`, `form`, `formBase`, `unitRec`, `unitNode`, `hwApplyUnit` верны и остаются. Остались места, где вид всё ещё узнаётся по коду (`python3 tools/outline.py index.html 'kindProps("' 'kind:"storage"' …` — список ниже собран так):

| # | Где (функция) | Что сейчас | Правило замены | Задача |
|---|---|---|---|---|
| 1 | `screenType` | вид с описанием, но без известного профиля, получает экран по коду: `camera` с `vms.camera/2` или без `implements` открывается экраном камеры | по коду — только экраны без профиля (`CODE_SCREENS`) и виды без описания | 1 |
| 2 | `SCREEN_OF_PROFILE`, `HAND_SCREENS` | СКУД (`vms.acs/1`, четыре экрана) выбирается кодом через `HAND_SCREENS` | неоднозначный профиль — массив экранов, код вида выбирает экран среди них, иначе ступень 3 | 1 |
| 3 | `unitNode` → `domNode`, `srvNode`, `folderNode`, `volNode` | узел не хранит `_kind`: вид плагина с `vms.server/1` читает схему вида `server` («Чего пока нет» в ответе mockup) | `_kind` у каждого узла ручного экрана, если вид ≠ экран | 1 |
| 4 | `kindText` | подпись вида плагина на ручном экране берётся из словаря экрана (`LB.camera`) | словарь экрана — только виду с кодом экрана; виду плагина — `label` из `/kinds` | 1 |
| 5 | `pmSchema`, `posDef`, `posMulti`, `overlaySetCam`, `posSet`, `posNum`, `posConnHtml`, `detAkOn`, `dwHas`, `devParams` | схема берётся у вида с фиксированным кодом: `kindProps("camera")`, `kindProps("eventsrc")`, `kindProps("det")`, `kindHasProp("det",…)`, `kindProps(t)` | схема вида узла: `nodeProps(n)` = `kindProps(nodeKind(n))` | 2 |
| 6 | `deviceToUnit` | `kindHasProp(d.type,…)`: `d.type` — экран, а не вид | вид узла: `nodeKind(n)` передаётся в `deviceToUnit` | 2 |
| 7 | `edgeOn`, `dwSubsOk`, `dwSubUnits`, `apiOnEvent` (`m.kind==="subdet"`) | есть ли у системы встроенное хранилище или поддетектор — по кодам `storage`, `subdet` | по профилю: `profileKinds("vms.edge/1")`, `profileKinds("vms.subdetector/1")` | 2 |
| 8 | `edgeFresh`, `edgeLoadOwn`, `edgeLoadAll`, `dwSubsEnsure` | `unitsAll({kind:"storage"})`, `{kind:"subdet"}` | `{implements:"vms.edge/1"}`, `{implements:"vms.subdetector/1"}` (так уже читают хранилища и тома) | 2 |
| 9 | `openFindServerByIp`, `runIpProbe`, `srvAddrHtml`, `srvListHtml`, `camConnDetect` | `kindActionOn("server","probe")`, `kindActionOn("camera","probe")` | по всем видам экрана: `screenActionOn("server","probe")` | 2 |
| 10 | `canCreateKind`, `canDeleteKind` → `kindsLike` | `kindsLike` знает только хранилища (`archive.*`); `canCreateKind("domain")`, `("server")`, `("volume")` — по коду | `kindsLike(kind)` — все виды того же ручного экрана (`kindsOfScreen(screenType(kind))`) | 2 |
| 11 | `addDomain`, `folderCreate`, `camCallRun`, `dwSteps`, `volToUnit`, `addProbedServers` | создание с кодом вида: `kind:"domain"`, `"folder"`, `"stream"`, `"subdet"`, `"volume"`, `"server"` | `kindToCreate(code, parentKind)` | 2 |
| 12 | `bulkFiltSet({kind:"camera",…})` (окно групповой правки) | ключ сравнивается с `n.type` | это экран, а не вид: оставить, ключ не трогать | — |

Мастер добавления (`WIZ`, `wizKind`) уже строится по `x-ui-category` видов, `GET /units` по профилю — по `implements=` (`hwStreamsRead`, `archAdd`, `scenCamFind`). Это не трогаем.

## Решения

**Правило экрана (раздел 4 описания страницы).** `screenFor(kind)`:

1. **Ступень 1 — `screenPageStep(kind)`.** Часть 05 заменит её тело. До части 05 она сохраняет нынешнее поведение: у вида есть `setupUi` (любой `mode`) — `"schema"`, иначе `null`. Часть 05 вернёт `"page"` для `mode: iframe` и `null` для `mode: tab`: у вида с `tab` по описанию страницы дальше идут ступени 2 и 3.
2. **Ступень 2 — `handScreenOf(kind)`.**
   - **Описания вида нет** (`!KINDS.has(kind)`: `listKinds` не объявлен, `/kinds` ещё не прочитан, событие потока пришло раньше) — экран по коду, как прежде: `archive.*` → `archive`, `volume` → `vol`, код из `HAND_SCREENS` → он сам.
   - **Описание есть.** Первый ключ `SCREEN_OF_PROFILE` по порядку таблицы (не по порядку `implements`), который вид объявил. Профиль сравнивается точно, со старшей версией. Значение — строка: это экран. Значение — массив (неоднозначный профиль): экран — код вида, если он в массиве, иначе профиль пропускается.
   - Ни один профиль не подошёл, код вида — в `CODE_SCREENS` (экраны без профиля: `ipsrv`, `channel`, `mic`, `sensor`, `relay`, `export`, `email`, `sms`) — экран по коду.
   - Иначе `null`.
3. **Ступень 3** — `"schema"`.

Порядок `SCREEN_OF_PROFILE` (он же приоритет у вида с несколькими профилями экранов): `vms.domain/1`, `vms.server/1`, `vms.folder/1`, `vms.archive/1`, `vms.volume/1`, `vms.camera/1`, `vms.detector/1`, `vms.stream/1`, `vms.pos/1`, `vms.edge/1`, `vms.acs/1` (массив `["acfa","acfa_sensor","acfa_lock","acfa_fence"]`), `vms.talk/1` — последний, как сейчас.

Незнакомая старшая версия (`vms.camera/2`) не совпадает с ключом таблицы. Профиль пропускается, и вид открывается формой по схеме, даже если его код `camera`. Младшая версия (`profiles[].version`) экран не выбирает. Скрыть на экране поля, которых нет в младшей версии сервера, — дело части 02 (п. 2 переработки), см. «Что не входит».

**Поля своего экрана** (для «сверх профиля», режима сравнения части 05 и инструмента). `handScreenFields(kind)` — объединение `properties` профилей вида, которые знает интерфейс (`PROFILES_KNOWN`). Из объединения выпадают профили, которые выбрали бы **другой** экран: у вида с `vms.camera/1` и `vms.pos/1` поля кассы не считаются полями экрана камеры. Описание страницы (раздел 9) говорит «объединение всех `implements`». Для вида с одним профилем экрана и вторичными профилями (`live`, `ptz`, `timeline`, `webserver`, `subdetector`) это то же самое.

**Как найти поля, которые экран показывает.** Рассмотрены три способа:

| Способ | Почему нет или да |
|---|---|
| Разбор кода экранов (имена полей в функциях экрана) | экран читает поля узла под другими именами (`DEV_KEY`: `archiveId` → `arch`, `DEV_FLD`: `fps` → `_f["к/с"]`, `srvNode`: `class` → `cls`), частые имена (`enabled`, `mode`) встречаются везде. Годится только как запрет снять поле (ниже), но не как мера |
| Метка на поле в разметке (`data-pf="<свойство>"`) | точно, но это правка сотен полей всех ручных экранов. Метку легко забыть, и проверить её забывчивость нечем |
| **Возмущение (выбрано)**: поменять одно свойство объекта в кэше, перерисовать вкладки экрана и сравнить разметку | мера «показывает» в прямом смысле: значение поля меняет то, что видит человек. Переименования не мешают. Работает на любом ручном экране без его правки |

Возмущение пропускает поле, которое видно только при условии (`baudRate` — только при `protocol: rs232`), только в окне или только в режиме правки. Поэтому «не показано» — повод проверить, а не приговор. Поле снимают из профиля, только если выполнены все три условия:

- прогон не увидел поле ни на одном виде профиля;
- проверка по коду не нашла поле в функциях экрана: `python3 tools/outline.py index.html <поле>` показывает только базовую форму, форму по схеме и общие места (поиск, чипы);
- поля нет в списке исключений `tools/profile_coverage.allow.json`.

**Снятие поля из профиля — младшая версия, а не `/2`.** Профиль — обещание между экраном (он читает) и бэкендом (он отдаёт). Снять требование с бэкенда ему не мешает: поле остаётся в схеме вида, бэкенд может отдавать его дальше, а интерфейс покажет его в «Все параметры». Сломать снятие может только того, кто поле читает. Сверка п. 10 снимает поля, которые не читает ни один экран. Старшая версия, наоборот, выключила бы ручной экран у всех бэкендов, которые объявили `/1`: у w2c камера открылась бы формой по схеме ради полей, которых экран и так не показывал. Правило:

- снять поле в младшей версии можно, если оно прошло три условия выше. Тогда в той же версии есть запись `changes[]` с `removed: [имена]`, а `tools/check_api.py` принимает такое снятие;
- поле, которое экран показывает, снимают только новой старшей версией (`vms.X/2`), как в предложении;
- поле, которое экран показывает, а профиля у него нет, добавляют в младшей версии с `since` этой версии.

Это расширяет формат файла профиля части 02 на одно поле `changes[].removed`. Об этом открытый вопрос 1.

## Global Constraints

- Язык документов, текстов и коммитов — русский. Коммиты — `Прототип NN: …`, `Тесты: …`, `Макет: из прототипа NN — …`, `Исследование: …`, `API: …`, затем `git pull --rebase && git push` (push — в фоне, ссылку на Pages дать сразу).
- `index.html` меняется только переносом прототипа (задача 5, скилл `proto-promote`). Прототип — `index_NN_ekran-po-profilyu.html` в корне репозитория. NN — следующий номер по правилу `CLAUDE.md` (с учётом удалённых в `protos.html`).
- `api/openapi.json` эта часть не меняет. Версии контракта нет. Если исполнителю понадобится правка контракта, нужна следующая младшая после `origin/main` и раздел «Что добавлено в X.Y.Z» в `api/README.md`. Профили получают младшие версии, по одной на профиль, в задаче 7.
- Имена таблиц и функций — ровно как в Interfaces: `SCREEN_OF_PROFILE`, `CODE_SCREENS`, `HAND_SCREENS`, `PROFILES_KNOWN`, `screenPageStep`, `handScreenOf`, `screenFor`, `handScreenFields`, `screenCoverage`, `profileProps`, `profileKinds`, `kindsLike`, `kindToCreate`, `nodeProps`, `screenActionOn`. Новые функции кладутся в раздел `// ── Виды объектов: GET /kinds ──` (карта `tools/outline.py` его знает).
- `screenFor` возвращает только `"page"`, `"hand:<экран>"` или `"schema"`. `<экран>` — значение `n.type` узла (`camera`, `vol`, `acfa_lock`).
- Новый сценарий `tests/ui-ekran-po-profilyu.js` начинается с охраны: `if (typeof screenFor !== "function") { ok(true, "на странице нет screenFor: проверять нечего"); return; }`. Тогда `python3 tools/check_ui.py` на `index.html` проходит до переноса.
- Виды тестов добавляются в `KINDS` на время проверки и снимаются в `finally` с `kindsApply()`. `api/fixtures/*.json` ради тестов не меняются.
- Правила интерфейса `CLAUDE.md`: без атрибутов `on…` (`onEv`), новый текст — по `docs/TEXTS.md` с ключом `i18n` и английским в `assets/i18n-en-NN.js`. Новых текстов интерфейса часть не ждёт.
- Проверки: одиночный сценарий в шагах — `python3 tools/check_ui.py --page index_NN_ekran-po-profilyu.html tests/ui-ekran-po-profilyu.js`. Полная проверка прототипа — только в задаче 5 (`CLAUDE.md`, «Проверки прототипа»). Правка `tests/`, `tools/` — сразу `python3 tools/check_ui.py tests/ui-ekran-po-profilyu.js` на `index.html`. Правка `api/` — `check_api`, `run_api_tests`, `check_ui`, `check_perf --quick`.
- Правки `api/profiles/`, `api/*.md`, `tests/api-*.js` и запросы в `api/requests/` — по скиллу `api-contract`, ответы — по `vms-requests`.

## Review Focus

- **Вид с кодом ручного экрана, но без его профиля** (`camera` с `implements: ["vms.camera/2"]` или `[]`). Человек ждёт форму по схеме, а не экран камеры, который читает чужие поля. Тест — задача 1.
- **Описаний видов нет** (`listKinds` не объявлен, `/kinds` не прочитан, событие потока раньше `/kinds`). Встроенные экраны работают по коду, как до правки, а не превращаются в формы по схеме. Тест — задача 1.
- **Вид плагина на ручном экране.** Подпись, «Все параметры», маска приватности, свойства нового объекта и `kind` в `POST /units` — от его вида, а не от `camera`. Тесты — задачи 1 и 2.
- **Поле видно только при условии, в окне или в режиме правки.** Прогон пишет «не показано», и поле снимают из профиля по ошибке. Тогда бэкенд перестаёт его переводить, и экран теряет поле. Нужны разные объекты вида в прогоне, запрет по коду и исключения. Тест — задача 4 (самопроверка с `baudRate`), шаг разбора — задача 6.
- **Вид с двумя профилями экранов** (`vms.camera/1` и `vms.pos/1`). Экран камеры не считает поля кассы своими: «сверх профиля» и счёт «N из M» верны. Тест — задача 3.

---

## Карта файлов

| Файл | Что | Задачи |
|---|---|---|
| `index_NN_ekran-po-profilyu.html` | прототип: `screenFor` и таблицы, чтение своего вида, поля экрана | 1–3 |
| `protos.html` | строка прототипа NN, статус | 1, 5 |
| `tests/ui-ekran-po-profilyu.js` | сценарий: разделы А (выбор экрана), Б (экран читает свой вид), В (поля экрана) | 1–3 |
| `tests/selftest.js` | `SCENARIOS` + `ui-ekran-po-profilyu.js` | 1 |
| `tools/profile_coverage.py` | запуск и отчёт покрытия, `--check`, `--selfcheck` | 4 |
| `tools/profile_coverage.js` | сценарий в странице: возмущение полей, снимки вкладок | 4 |
| `tools/profile_coverage.allow.json` | исключения с причинами | 4, 6 |
| `api/TESTS.md` | раздел «Покрытие профилей», строка сценария, когда запускать | 1, 4 |
| `index.html`, `CHANGES.md` | перенос | 5 |
| `docs/contract-layers/2026-MM-DD-profili-po-ekranam.md` | отчёт сверки п. 10: решение по каждому полю | 6 |
| `api/profiles/*.json`, `api/profiles/README.md`, сборка `tools/build_api.py` | младшие версии профилей | 7 |
| `tools/check_api.py` | снятие по `changes[].removed` | 7 |
| `api/requests/<ts>-owner-profiles-by-screens-request.md` | уведомление reviewers (w2c, NGP) | 7 |

## Interfaces (для других частей)

```js
// index.html, раздел «Виды объектов: GET /kinds»
const SCREEN_OF_PROFILE /*: {[profileId]: string | string[]} — порядок ключей = приоритет */;
const CODE_SCREENS /*: Set<string> — ipsrv, channel, mic, sensor, relay, export, email, sms */;
const HAND_SCREENS /*: Set<string> — CODE_SCREENS ∪ все экраны SCREEN_OF_PROFILE */;
const PROFILES_KNOWN /*: Set<string> — ключи SCREEN_OF_PROFILE ∪ vms.live/1, vms.ptz/1, vms.timeline/1, vms.webserver/1, vms.subdetector/1 */;
function screenPageStep(kind) /*: "page" | "schema" | null — ступень 1; тело заменяет часть 05 */;
function handScreenOf(kind) /*: string | null — ступень 2 */;
function screenFor(kind) /*: "page" | `hand:${screen}` | "schema" */;
function screenType(kind) /*: string — как сейчас: экран для "hand:…", иначе код вида */;
function isSchemaKind(kind) /*: boolean — !screenFor(kind).startsWith("hand:") */;
function profileProps(p) /*: string[] — имена properties записи Profile: массив имён или ключи объекта */;
function profileKinds(id) /*: string[] — виды, чей implements содержит id */;
function handScreenFields(kind) /*: string[] — поля своего ручного экрана по профилям вида */;
function screenCoverage(kind, own /*: string[] */) /*: {total, shown: string[], missing: string[], unknown: string[]} */;
function kindsLike(kind) /*: string[] — виды того же ручного экрана; вид формы по схеме — [kind] */;
function kindToCreate(code, parentKind /*?: string|null */) /*: string — вид для POST /units */;
function screenActionOn(code, action) /*: boolean — команду объявил хоть один вид экрана */;
function nodeProps(n) /*: object — kindProps(nodeKind(n)) */;
```

- **Часть 05** вставляет ступень 1 в `screenPageStep`: `"page"` у `setupUi.mode: iframe` (вид в `setupUi.kinds`), `null` у `mode: tab`. Узел вида со страницей — узел формы по схеме (`isSchemaKind` → `true`). Строку покрытия режима сравнения она строит по `screenCoverage(kind, handScreenFields(kind))` у ручного экрана и по `screenCoverage(kind, ready.fields)` у страницы. Тот же счёт печатает инструмент (`unknown` — «поля, которые свой экран называет, а в схеме их нет»).
- **Инструмент покрытия:**
  - запуск — `python3 tools/profile_coverage.py [--page FILE] [--fixture demo] [--profile ID …] [--units N] [--json FILE] [--check] [--selfcheck]`;
  - строка на вид: `<вид> (<профиль>): свой экран: S полей из T · не показаны: a, b · сверх профиля на экране: c`;
  - итог: `RESULT pass|fail`;
  - JSON: `{page, fixture, profiles:[{id, version, kinds:[{kind, screen, units:[uid], views:["<экран>:<вкладка>"], fields:{<имя>:{inProfile, tried, shown, views?, why?}}}], summary:{keep, remove, add, untested}}]}`.

---

### Task 1: Прототип и выбор экрана по профилю (ступени 2 и 3)

**Files:**
- Create: `index_NN_ekran-po-profilyu.html` (копия `index.html`), `tests/ui-ekran-po-profilyu.js`
- Modify: `index_NN_ekran-po-profilyu.html` — раздел «Виды объектов: GET /kinds» (`SCREEN_OF_PROFILE`, `HAND_SCREENS`, `screenType`, `isSchemaKind`, `kindText`), раздел «Шов кэша» (`unitNode`); `protos.html`; `tests/selftest.js` (`SCENARIOS`); `api/TESTS.md` (строка сценария в таблице раздела 2)

**Interfaces:**
- Consumes: `KINDS`, `kindsApply()`, `unitNode(u)`, `nodeKind(n)`, `tabsFor(n)`, `pick(uid,{force,tab})`, `hwApplyUnit(u)`; приём подмены `API.get` из `tests/ui-unknown.js` (`asPlug`, раздел «Второй вид камеры от плагина»).
- Produces: `SCREEN_OF_PROFILE`, `CODE_SCREENS`, `HAND_SCREENS`, `PROFILES_KNOWN`, `screenPageStep`, `handScreenOf`, `screenFor`; `_kind` у узлов `domNode`, `srvNode`, `folderNode`, `volNode`, если вид ≠ экран.

- [ ] **Step 1: Создать прототип**

`git pull --rebase`. Найти NN по правилу `CLAUDE.md`. `cp index.html index_NN_ekran-po-profilyu.html`. Коммит до правок: `Прототип NN: копия index.html`. Строка в `protos.html`: номер, ссылка, автор — `git config user.name`. Что проверяем: «Экран по профилю: ручной экран выбирается только по implements вида (часть 07 переделки по слоям), экран читает свой вид, поля своего экрана». Статус «обсуждается». Коммит `Прототип NN: строка в protos.html`, `git pull --rebase && git push`.

- [ ] **Step 2: Опора `screenFor` поверх нынешнего поведения**

В прототип, после `screenType`, добавить временно две функции с нынешним поведением: `function screenFor(kind){const t=screenType(kind);return HAND_SCREENS.has(t)?"hand:"+t:"schema"}` и `function screenPageStep(kind){return KINDS.get(kind)?.setupUi?"schema":null}`. Без них охрана сценария скрыла бы его провал.

- [ ] **Step 3: Написать сценарий, раздел А**

Шапка и охрана — по Global Constraints. Помощники сценария:
- `clone(x)`;
- `withKinds(defs, fn)` — ставит описания в `KINDS`, вызывает `kindsApply()`, в `finally` возвращает прежние описания и снова `kindsApply()`;
- `asKind(uid, kind, fn)` — `GET /units/{uid}` и списки `GET /units` отдают объект с `kind`, как `asPlug` в `ui-unknown.js`.

Описания видов:
- `like` — копия `camera`: `kind:"test.camera-like"`, `implements:["vms.camera/1"]`, `label:{text:"Камера по профилю",lang:"ru"}`;
- `cam2` — копия `camera`: `kind:"test.camera2"`, `implements:["vms.camera/2"]`;
- `acs` — копия `acfa_lock`: `kind:"acme.acs"`;
- `campos` — копия `camera`: `kind:"acme.campos"`, `implements:["vms.pos/1","vms.camera/1"]`;
- `sens` — копия `sensor`: `kind:"acme.sensor"`, `implements:[]`;
- `srv`, `dom`, `fld` — копии `server`, `domain`, `folder` с кодами `acme.srv`, `acme.dom`, `acme.fld`.

```js
ok(screenFor("test.camera-like") === "hand:camera" && screenType("test.camera-like") === "camera", "вид с vms.camera/1 и другим кодом — экран камеры");
ok(screenFor("test.camera2") === "schema" && isSchemaKind("test.camera2"), "незнакомая старшая версия vms.camera/2 — форма по схеме");
// код camera с vms.camera/2 и без implements (описание camera подменено на время проверки)
ok(screenFor("camera") === "schema", "код camera без vms.camera/1 — форма по схеме, а не экран по коду");
// KINDS очищен на время проверки, затем возвращён
ok(screenFor("camera") === "hand:camera" && screenFor("archive.local") === "hand:archive" && screenFor("volume") === "hand:vol" && screenFor("acme.x") === "schema", "описаний нет — экран по коду, как прежде");
ok(screenFor("acme.acs") === "schema" && screenFor("acfa_lock") === "hand:acfa_lock" && screenFor("acfa") === "hand:acfa", "неоднозначный vms.acs/1 — экран по коду среди своих, чужой код — форма по схеме");
ok(screenFor("acme.campos") === "hand:camera", "камера и касса — экран камеры: порядок SCREEN_OF_PROFILE");
ok(screenFor("sensor") === "hand:sensor" && screenFor("acme.sensor") === "schema", "экран без профиля — только по своему коду");
ok(screenPageStep("camera") === null && screenFor("security_controller/CONTROLLER") === "schema", "ступень 1 до части 05: вид с setupUi — форма по схеме");
// карточка: камера набора, отданная как test.camera-like (asKind)
ok(tabsFor(n).map((t) => t[0]).join() === camTabs && nodeKind(n) === "test.camera-like" && !!main().querySelector(".cs-cq"), "карточка вида с профилем камеры — вкладки и экран камеры");
ok(kindText("test.camera-like") === "Камера по профилю" && kindText("camera") === i18n(LB.camera), "подпись вида плагина — из /kinds, встроенного — словарь экрана");
// та же камера как test.camera2
ok(isSchemaNode(n2) && !!main().querySelector("[data-schema-card]"), "объект вида vms.camera/2 открывается формой по схеме");
// unitNode объектов, отданных как acme.srv, acme.dom, acme.fld
ok(unitNode(asS).type === "server" && nodeKind(unitNode(asS)) === "acme.srv" && nodeKind(unitNode(asD)) === "acme.dom" && nodeKind(unitNode(asF)) === "acme.fld", "сервер, домен и папка плагина хранят свой вид");
```

`camTabs` — `tabsFor` камеры набора до подмены.

- [ ] **Step 4: Запустить и увидеть провал**

Run: `python3 tools/check_ui.py --page index_NN_ekran-po-profilyu.html tests/ui-ekran-po-profilyu.js`
Expected:
- `FAIL  код camera без vms.camera/1 — форма по схеме…`: сейчас `screenType` возвращает код `camera`;
- `FAIL  подпись вида плагина…`: сейчас подпись из словаря экрана;
- `FAIL  сервер, домен и папка плагина хранят свой вид`: сейчас `_kind` только у `devNode`;
- остальные строки раздела А — `PASS`. Они закрепляют то, что уже работает: описаний нет, СКУД, несколько профилей, экран без профиля.

- [ ] **Step 5: Сделать выбор экрана по решению «Правило экрана»**

В прототипе:
- `SCREEN_OF_PROFILE` — в порядке из раздела «Решения», `vms.acs/1` — массив;
- `CODE_SCREENS`, `HAND_SCREENS`, `PROFILES_KNOWN` — по Interfaces;
- `screenPageStep(kind)`, `handScreenOf(kind)`, `screenFor(kind)` — по решению. Временная опора шага 2 уходит;
- `screenType(kind)` — `screenFor(kind)`: `"hand:X"` → `X`, иначе `kind`;
- `isSchemaKind(kind)` — `!screenFor(kind).startsWith("hand:")`;
- `unitNode` ставит `n._kind=u.kind` у каждого узла ручного экрана, если `u.kind!==t` (сейчас — только у `devNode`). `nodeKind` уже читает `_kind` первым;
- `kindText`: словарь экрана `LB[t]` — если `kind===t`, у видов без описания или у `archive.*`; иначе `textOf(label)`.

Комментарий над `SCREEN_OF_PROFILE` переписать по правилу (ступени, массив, `CODE_SCREENS`, описаний нет).

- [ ] **Step 6: Запустить сценарий и соседей**

Run: `python3 tools/check_ui.py --page index_NN_ekran-po-profilyu.html tests/ui-ekran-po-profilyu.js tests/ui-unknown.js tests/ui-kinds.js tests/ui-profile.js`
Expected: все строки `PASS`, `RESULT pass`. `ui-profile.js` идёт на наборе `one-domain` (`FIXTURE_OF`).

- [ ] **Step 7: Сценарий в самопроверку и документ**

Добавить `"ui-ekran-po-profilyu.js"` в `SCENARIOS` (`tests/selftest.js`). Добавить строку в таблицу раздела 2 `api/TESTS.md`: файл, число проверок, «экран по профилю: ступени 2 и 3, неоднозначный профиль, несколько профилей, `vms.camera/2`, описаний нет, узлы плагина хранят вид».
Run: `python3 tools/check_ui.py tests/ui-ekran-po-profilyu.js` (на `index.html`)
Expected: `PASS  на странице нет screenFor: проверять нечего`, `RESULT pass`.

- [ ] **Step 8: Коммит**

```bash
git add index_NN_ekran-po-profilyu.html tests/ui-ekran-po-profilyu.js tests/selftest.js api/TESTS.md
git commit -m "Прототип NN: экран по профилю — screenFor, ступени 2 и 3, неоднозначный vms.acs/1, вид плагина хранит свой вид; тест ui-ekran-po-profilyu.js"
git pull --rebase && git push
```

---

### Task 2: Ручной экран читает свой вид, а не вид с кодом экрана

**Files:**
- Modify: `index_NN_ekran-po-profilyu.html` — функции строк 5–11 таблицы «Что осталось»; `tests/ui-ekran-po-profilyu.js` — раздел Б

**Interfaces:**
- Consumes: `screenFor`, `screenType`, `kindsOfScreen(t)`, `kindProps`, `kindHasProp`, `kindCan`, `kindActionOn(kind,action)`, `unitsAll(params)`, `unitsCreate(items)`.
- Produces: `nodeProps(n)`, `profileKinds(id)`, `kindsLike(kind)`, `kindToCreate(code,parentKind)`, `screenActionOn(code,action)`. Подписи меняются: `pmSchema(n)`, `posDef(n,k)`, `posMulti(n)`, `detAkOn(ak,n)`, `devParams(n)`, `deviceToUnit(d,kind)`. Все вызовы передают узел.

- [ ] **Step 1: Написать раздел Б**

Описания видов:
- `like` — с `schema.properties.privacyMasks.maxItems = 3` и новым свойством `covProbe: {type:"string","x-label":{text:"Проба",lang:"ru"}}`;
- `pos` — копия `eventsrc`: `kind:"acme.pos"`, `schema.properties.baudRate.default = 19200`;
- `srvNoProbe` — описание `server` без команды `probe` в `actions`;
- `srvProbe` — `acme.srv` с `probe`;
- `edge` — `acme.edge`: копия `storage`. На время проверки `storage` теряет `vms.edge/1`;
- `sub` — `acme.subdet`: копия `subdet`, а `subdet` снят из `KINDS`;
- `domMake` — `acme.dom` с `capabilities` ∋ `create`, а у `domain` `create` снят.

```js
ok(pmSchema(likeNode).maxItems === 3 && pmSchema(camNode).maxItems === 16, "маска приватности — по схеме вида узла");
ok(posDef(posNode, "baudRate") === 19200 && posDef(evNode, "baudRate") === 9600, "касса читает умолчания своего вида");
ok(screenActionOn("server", "probe") === true, "опрос адресов: команду объявил вид плагина с vms.server/1");   // srvNoProbe + srvProbe
ok(screenActionOn("server", "probe") === false, "ни один вид экрана сервера не объявил probe");               // только srvNoProbe
ok(edgeOn() === true, "встроенное хранилище — по vms.edge/1, а не по коду storage");                          // edge
ok(dwSubsOk() === true, "поддетекторы — по vms.subdetector/1 с create");                                       // sub
ok(kindsLike("domain").includes("acme.dom") && canCreateKind("domain") && kindToCreate("domain", null) === "acme.dom", "создать домен — видом, который умеет create");
ok(nodeToUnit(likeNodeWithProbe).kind === "test.camera-like" && nodeToUnit(likeNodeWithProbe).properties.covProbe === "x", "новый объект — со своим видом и полями своей схемы");
// CONSOLEM_TRACE во время edgeLoadAll()
ok(trace.some((t) => /implements=vms\.edge%2F1|implements=vms.edge\/1/.test(t.path)) && !trace.some((t) => /kind=storage/.test(t.path)), "встроенные хранилища читаются по профилю");
```

- `likeNode` и `posNode` — узлы `unitNode(u)` объектов набора, отданных как `test.camera-like` и `acme.pos` (`asKind`);
- `camNode` и `evNode` — исходные узлы;
- `likeNodeWithProbe` — `likeNode` с `covProbe:"x"` в полях узла (как поле `devNode`).

- [ ] **Step 2: Запустить и увидеть провал**

Run: `python3 tools/check_ui.py --page index_NN_ekran-po-profilyu.html tests/ui-ekran-po-profilyu.js`
Expected: раздел Б — `FAIL` на маске, кассе, `screenActionOn is not defined`, `edgeOn`, `dwSubsOk`, создании домена, `nodeToUnit`, чтении по профилю. Раздел А — `PASS`.

- [ ] **Step 3: Заменить чтение по коду (строки 5–11 таблицы)**

- `nodeProps(n)`, `profileKinds(id)` — по Interfaces.
- `kindsLike(kind)` — вид ручного экрана при прочитанных описаниях: `kindsOfScreen(screenType(kind))`, иначе `[kind]`. Особый случай `archive` уходит: `kindsOfScreen("archive")` даёт то же.
- `screenActionOn(code,action)` — `kindsLike(code).some(k=>kindActionOn(k,action))`.
- `kindToCreate(code,parentKind)`:
  1. первый из `kindsLike(code)` с `kindCan(k,"create")` и с `createParents`, где есть `parentKind` (`null` — корень);
  2. вид с кодом `code` — первым, если подходит;
  3. ни один не подошёл — `code`.
- Строки 5–6: схема вида узла (`nodeProps(n)`, `kindHasProp(nodeKind(n),…)`). `deviceToUnit(d,kind)` получает вид от `nodeToUnit`. Создание дочерних берёт `nodeKind` дочернего узла.
- Строка 7: `edgeOn()` — `profileKinds("vms.edge/1").length>0`. `dwSubsOk()` — `profileKinds("vms.subdetector/1").some(k=>kindCan(k,"create"))`. `dwSubUnits` — по `profileKinds("vms.subdetector/1")`. `apiOnEvent` — `screenType(m.kind)==="det"||profileKinds("vms.subdetector/1").includes(m.kind)`.
- Строка 8: `unitsAll({implements:"vms.edge/1",…})`, `{implements:"vms.subdetector/1",parentId}`.
- Строки 9 и 11: `screenActionOn` и `kindToCreate` в названных функциях. `dwSteps` создаёт поддетектор `kindToCreate("subdet", nodeKind(det))`.

- [ ] **Step 4: Запустить сценарий и сценарии задетых экранов**

Run: `python3 tools/check_ui.py --page index_NN_ekran-po-profilyu.html tests/ui-ekran-po-profilyu.js tests/ui-pos.js tests/ui-edge.js tests/ui-okno-detektora.js tests/ui-maska-privatnosti.js tests/ui-servers-add.js tests/ui-domains.js tests/ui-storage.js tests/ui-unknown.js`
Expected: `RESULT pass`.

- [ ] **Step 5: Проверка карты кода**

Run: `python3 tools/outline.py index_NN_ekran-po-profilyu.html --check`
Expected: без отказов (новые функции — в разделе с заголовком `// ── … ──`).

- [ ] **Step 6: Коммит**

```bash
git add index_NN_ekran-po-profilyu.html tests/ui-ekran-po-profilyu.js
git commit -m "Прототип NN: ручной экран читает схему, команды и создание своего вида — маска, касса, детектор, встроенное хранилище, поддетекторы, опрос серверов, создание домена, папки, потока, тома"
git pull --rebase && git push
```

---

### Task 3: Поля своего экрана и счёт покрытия

**Files:**
- Modify: `index_NN_ekran-po-profilyu.html` — раздел «Базовая форма у ручного экрана» (`kindExtraProps`); раздел «Виды объектов» (`profileProps`, `handScreenFields`, `screenCoverage`); `tests/ui-ekran-po-profilyu.js` — раздел В

**Interfaces:**
- Consumes: `KIND_PROFILES` (`GET /kinds` → `profiles[]`), `PROFILES_KNOWN`, `SCREEN_OF_PROFILE`, `handScreenOf`, `sfEntries(schema)`.
- Produces: `profileProps(p)`, `handScreenFields(kind)`, `screenCoverage(kind, own)`. `kindExtraProps(kind)` = `screenCoverage(kind, handScreenFields(kind)).missing`, если у вида есть знакомый профиль, иначе `[]`.

- [ ] **Step 1: Написать раздел В**

```js
const camProfiles = ["vms.camera/1", "vms.live/1", "vms.ptz/1", "vms.timeline/1"].flatMap((id) => profileProps(KIND_PROFILES.get(id)));
ok(sameSet(handScreenFields("camera"), camProfiles), "поля экрана камеры — профили камеры, видео, PTZ и шкалы");
ok(!handScreenFields("acme.campos").includes("overlays") && handScreenFields("acme.campos").includes("fps"), "экран камеры не считает поля кассы своими");
ok(handScreenFields("test.camera2").length === 0, "у вида с vms.camera/2 полей ручного экрана нет");
const c = screenCoverage("test.camera-like", handScreenFields("test.camera-like"));
ok(c.total === Object.keys(like.schema.properties).length && c.missing.includes("covProbe") && c.unknown.length === 0 && c.shown.length === c.total - c.missing.length, "счёт покрытия: всего, показаны, не показаны");
ok(screenCoverage("camera", ["fps", "nope"]).unknown.join() === "nope", "поле, которого нет в схеме, — отдельно");
ok(kindExtraProps("test.camera-like").includes("covProbe") && !kindExtraProps("acme.campos").includes("fps"), "«сверх профиля» — по полям своего экрана");
ok(profileProps({ properties: ["a", "b"] }).join() === "a,b" && profileProps({ properties: { a: {}, b: {} } }).join() === "a,b" && profileProps({}).length === 0, "имена профиля — из массива или из объекта (часть 02)");
```

`sameSet` — помощник сценария.

- [ ] **Step 2: Запустить и увидеть провал**

Run: `python3 tools/check_ui.py --page index_NN_ekran-po-profilyu.html tests/ui-ekran-po-profilyu.js`
Expected: раздел В — `FAIL` (`profileProps is not defined`), разделы А и Б — `PASS`.

- [ ] **Step 3: Сделать функции по решению «Поля своего экрана»**

`handScreenFields(kind)`:
1. берёт `implements ∩ PROFILES_KNOWN`, у которых есть запись в `KIND_PROFILES`;
2. убирает профили-ключи `SCREEN_OF_PROFILE`, чей экран ≠ `handScreenOf(kind)`;
3. объединяет `profileProps`;
4. у вида без ручного экрана возвращает `[]`.

`screenCoverage`:
- `total` — число имён `sfEntries(KINDS.get(kind)?.schema)`;
- `shown` — `own ∩ схема`;
- `missing` — `схема − own`;
- `unknown` — `own − схема`;
- порядок — как в схеме.

`kindExtraProps` — через них. `baseFormHtml` и отметка «сверх профиля» не меняются.

- [ ] **Step 4: Запустить сценарий и «Все параметры»**

Run: `python3 tools/check_ui.py --page index_NN_ekran-po-profilyu.html tests/ui-ekran-po-profilyu.js tests/ui-unknown.js`
Expected: `RESULT pass`. В `ui-unknown.js` проверка «свойства сверх профиля у камеры» проходит.

- [ ] **Step 5: Коммит**

```bash
git add index_NN_ekran-po-profilyu.html tests/ui-ekran-po-profilyu.js
git commit -m "Прототип NN: поля своего экрана по профилям вида и счёт покрытия (handScreenFields, screenCoverage) — для «сверх профиля», режима сравнения и инструмента"
git pull --rebase && git push
```

---

### Task 4: Инструмент покрытия профилей

**Files:**
- Create: `tools/profile_coverage.py`, `tools/profile_coverage.js`, `tools/profile_coverage.allow.json` (`{}`)
- Modify: `api/TESTS.md` — новый раздел «11. Покрытие профилей» и строка в таблице «Коротко»

**Interfaces:**
- Consumes: `check_ui.run(scenario_path, query)` (импорт модуля `tools/check_ui.py`; `--page` разбирает `cli_paths`, как у `check_ui`); в странице — `screenFor`, `handScreenOf`, `handScreenFields`, `screenCoverage`, `profileProps`, `profileKinds`, `KIND_PROFILES`, `hwApplyUnit(u)`, `tabsFor(n)`, `pick`, `goTab`, `paint`; если есть — `ConsolemContract.validate`.
- Produces: CLI и JSON из раздела Interfaces. В странице: `pcovPerturb(schema, value, ctx) → {ok:true, value} | {ok:false, why}`, `pcovSnap(view) → string`, `pcovRun(profileId, opts) → отчёт профиля`.

- [ ] **Step 1: Написать самопроверку `--selfcheck`**

Это ветка `tools/profile_coverage.js`, её включает `?pcov=selfcheck`. Утверждения через `ok()`:

```js
const P = (s, v) => pcovPerturb(s, v, ctx);
ok(P({ enum: ["a", "b"] }, "a").value === "b" && !P({ enum: ["a"] }, "a").ok, "перечень: другое значение; одно значение — не проверить");
ok(P({ type: "boolean" }, true).value === false && P({ type: "integer", maximum: 5 }, 5).value === 4 && P({ type: "integer", multipleOf: 10 }, 20).value === 30, "логическое и число в границах");
ok(P({ type: "string", format: "ipv4" }, "10.0.0.1").value === "10.0.0.2" && P({ type: "string", maxLength: 3 }, "abc").value.length === 3, "адрес и строка в границах");
ok(P({ type: "array", minItems: 1, items: { type: "string" } }, ["x"]).value.length === 2 && P({ type: "array", items: { type: "string" } }, ["x", "y"]).value.length === 1, "массив: убрать или добавить элемент");
ok(P({ type: ["string", "null"], "x-ref": { implements: ["vms.archive/1"] } }, archA).value === archB, "ссылка — на другой объект нужного профиля");
// камера набора; в схему вида camera на время самопроверки добавлено covHidden:{type:"string"}, у объекта covHidden:"a"
ok(rep.fields.fps.shown === true, "fps камеры виден (вкладка «Видео»)");
ok(rep.fields.covHidden.tried === true && rep.fields.covHidden.shown === false, "поле, которое экран не читает, — не показано");
ok(streamRep.fields.res.shown === true && streamRep.fields.res.views.some((v) => v.startsWith("camera:")), "поле потока видно в карточке камеры (родителя)");
ok(posRep.fields.baudRate.shown === true, "baudRate кассы виден: среди объектов есть касса с protocol rs232");
```

Если в наборе нет кассы с `rs232`, самопроверка сама переводит одну кассу на `rs232` возмущением `protocol`. Это проверяет выбор разных объектов (шаг 3).

- [ ] **Step 2: Запустить и увидеть провал**

Run: `python3 tools/profile_coverage.py --page index_NN_ekran-po-profilyu.html --selfcheck`
Expected: ошибка «нет tools/profile_coverage.js» или `FAIL` на каждой строке, `RESULT fail`.

- [ ] **Step 3: Сделать сценарий в странице (`tools/profile_coverage.js`)**

Это сценарий `UiCheck`, как `tests/ui-*.js`, но лежит вне `tests/`, поэтому `check_ui.py` его не гоняет. Профиль он берёт из `?pcov=<id>`, число объектов — из `&units=N` (по умолчанию 2). Для профиля P:

1. **Виды:** `profileKinds(P)`, у которых `screenFor(k)` начинается с `hand:`.
2. **Объекты:** до N объектов вида из `GET /units?kind=k` (полное чтение). Жадный выбор: каждый следующий добавляет больше новых значений полей-перечней (`enum`, `boolean`).
3. **Виды экрана (views)** у объекта:
   - каждая вкладка `tabsFor(n)` своей карточки (`pick`, `goTab`; «Все параметры» выключены);
   - каждая вкладка карточки родителя, если родитель — ручной экран (поток в камере, детектор в камере);
   - у экрана с пустым `tabsForHand` (детектор) — окно, которое открывает его кнопка в карточке родителя. Имя вызова — найти `python3 tools/outline.py index.html "Окно детектора"`.
4. **Снимок** `pcovSnap` — разметка `#main` и открытого окна:
   - без атрибутов `style`;
   - время `\d\d:\d\d(:\d\d)?` заменено на `HH:MM`;
   - значения `input`, `select`, `textarea` дописаны.
   Два снимка без возмущения должны совпасть. Иначе вид неустойчив, он выходит из прогона и попадает в `views` отчёта с пометкой.
5. **Поля:**
   - имена `properties` и `status` профиля P;
   - все свойства схемы вида — чтобы найти «на экране, но не в профиле»;
   - у `writeOnly` вместо значения меняется `secrets[имя]`.
6. **Возмущение** поля: `pcovPerturb` по таблице самопроверки. Значение проходит `ConsolemContract.validate`, если он есть. `{ok:false}` — поле `tried:false` с `why`.
7. **Применение:** `hwApplyUnit(u')` → `paint()` → снимки всех видов → `hwApplyUnit(u)`. У потока `hwApplyUnit` перечитывает потоки с сервера, поэтому для `vms.stream/1` подменяется `API.get` для этого объекта, как `asKind` (задача 1).
8. **Отчёт:**
   - поле `shown`, если хоть один снимок отличается;
   - `summary` по видам профиля: `keep` = профиль ∩ показано, `remove` = профиль − показано − `allow.keep`, `add` = показано − все знакомые профили вида − `allow.extra`, `untested` = профиль и `tried:false` на всех видах;
   - JSON — строкой `ok(true, "COVERAGE " + JSON.stringify(rep))`.

- [ ] **Step 4: Сделать запуск (`tools/profile_coverage.py`)**

- Один запуск Chrome на профиль, через `check_ui.run`. Профили — из `--profile` или все из `GET /kinds` (читать `api/fixtures/<fixture>.json` → `profiles`).
- Разбор строки `PASS  COVERAGE {…}`, строки на вид — формат Interfaces. Счёт «S из T» печатает `screenCoverage(kind, shown)` из отчёта страницы.
- `--json FILE` — весь отчёт.
- `--check` — код 1, если у какого-нибудь профиля непусты `remove`, `add` или `untested`.
- `--selfcheck` — `?pcov=selfcheck`, код 1 при `FAIL`.
- `tools/profile_coverage.allow.json`: `{"<профиль>": {"keep": {"<поле>": "почему остаётся"}, "extra": {"<поле>": "почему на экране, но не в профиле"}}}`. Поле без причины — ошибка разбора.

- [ ] **Step 5: Запустить самопроверку**

Run: `python3 tools/profile_coverage.py --page index_NN_ekran-po-profilyu.html --selfcheck`
Expected: все строки `PASS`, `RESULT pass`.

- [ ] **Step 6: Описать в `api/TESTS.md`**

Раздел «11. Покрытие профилей»:
- что меряет (возмущение, виды экрана, родитель, окно);
- что «не показано» — повод проверить (условие, окно, режим правки), три условия снятия;
- формат исключений;
- запуск и время на профиль.

В таблице «Коротко» — строка. Кому: тем, кто правит ручной экран или профиль. Запуск: `python3 tools/profile_coverage.py --check`. После задачи 7 эта проверка обязательна для правок ручных экранов и `api/profiles/` (открытый вопрос 6).

- [ ] **Step 7: Проверки общего**

Run: `python3 tools/check_ui.py tests/ui-ekran-po-profilyu.js`
Expected: `RESULT pass` — `tools/check_ui.py` не менялся, импорт его не ломает.

- [ ] **Step 8: Коммит**

```bash
git add tools/profile_coverage.py tools/profile_coverage.js tools/profile_coverage.allow.json api/TESTS.md
git commit -m "Тесты: покрытие профилей — tools/profile_coverage.py: какие поля вида ручной экран показывает (возмущение поля и снимки вкладок), --check и --selfcheck"
git pull --rebase && git push
```

---

### Task 5: Перенос прототипа в `index.html`

**Files:**
- Modify: `index.html`, `CHANGES.md`, `protos.html`; отчёт о пробелах — если перенос задел его пункты
- Delete: `index_NN_ekran-po-profilyu.html`

**Interfaces:**
- Consumes: всё, что сделали задачи 1–3.
- Produces: те же имена в `index.html`. С этого момента часть 05 опирается на `screenFor` и `screenPageStep` в `index.html`.

- [ ] **Step 1: Полная проверка прототипа**

Run: `python3 tools/check_ui.py --page index_NN_ekran-po-profilyu.html`, затем `python3 tools/check_ui.py --page index_NN_ekran-po-profilyu.html --selftest`, затем `python3 tools/check_perf.py --page index_NN_ekran-po-profilyu.html` (правка задела кэш и дерево: `unitNode`, `screenType`)
Expected: `RESULT pass` у всех трёх.

- [ ] **Step 2: Перенос по скиллу `proto-promote`**

Загрузить скилл. `git diff <коммит копии> HEAD -- index_NN_ekran-po-profilyu.html`. Перенести всё поверх текущего `index.html`.

- [ ] **Step 3: Проверки `index.html`**

Run: `python3 tools/check_api.py`, `python3 tools/check_ui.py`, `python3 tools/check_perf.py --quick`, `python3 tools/profile_coverage.py --selfcheck`
Expected: `RESULT pass`. Сценарий `ui-ekran-po-profilyu.js` теперь проверяет по-настоящему (строки охраны нет). Сбой `check_perf` — по `api/TESTS.md`: повторить шаг `--steps <id>`.

- [ ] **Step 4: Записи и удаление**

- `CHANGES.md` — запись о переносе;
- `protos.html` — статус «принят: экран по профилю перенесён в index.html целиком»;
- отчёт о пробелах — по шагу 5 `proto-promote` (`grep` по «профил», «плагин» в `docs/axxon-one-gaps.html`). Строк `PROTO` у прототипа нет;
- `git rm index_NN_ekran-po-profilyu.html`, в `protos.html` — «(удалён)».

- [ ] **Step 5: Коммиты**

```bash
git add index.html CHANGES.md protos.html
git commit -m "Макет: из прототипа NN — экран по профилю: ручной экран только по implements вида, вид плагина читает свою схему и команды, поля своего экрана"
git rm index_NN_ekran-po-profilyu.html && git add protos.html
git commit -m "Прототип NN: удалён — перенесён в index.html"
git pull --rebase && git push
```

---

### Task 6: Сверка п. 10 — какие поля каждый экран показывает

**Files:**
- Create: `docs/contract-layers/2026-MM-DD-profili-po-ekranam.md` (дата — день сверки)
- Modify: `tools/profile_coverage.allow.json`; `docs/contract-layers/README.md` — строка в таблице документов

**Interfaces:**
- Consumes: `tools/profile_coverage.py` (задача 4), `index.html` после переноса.
- Produces: решение по каждому полю 17 профилей: `оставить`, `снять`, `добавить`, `оставить: <причина>` — вход задачи 7.

- [ ] **Step 1: Прогон по всем профилям**

Run: `python3 tools/profile_coverage.py --units 3 --json <папка сессии>/pcov.json` (отчёт прогона — вне репозитория)
Expected: строка на каждый вид каждого профиля. `vms.live/1` и `vms.timeline/1` — без полей (только `apis`), `vms.folder/1` — без полей.

- [ ] **Step 2: Разобрать каждое «не показано» и «не проверено»**

По каждому полю `remove` и `untested`:
- `python3 tools/outline.py index.html <поле>` — есть в функциях экрана (не `baseFormHtml`, не `schemaFormHtml`, не поиск и не чипы)? Тогда поле **не снимают**, а ищут условие показа. Найденное условие становится строкой `allow.keep`, например «только при protocol rs232; в наборе такой кассы нет»;
- поле читает не экран, а движок правил, поиск (`x-search`), события (`match`) или другой профиль: `grep -n '"<поле>"' api/rule-engine.js api/fixtures/demo.json` в `reference.ruleConditions`. Тогда оставить с причиной «нужно <кому>» (открытый вопрос 2);
- иначе — `снять`.

По каждому полю `add` — `добавить` в профиль экрана, который выбрал вид. Поле вторичного профиля (PTZ на экране камеры) — в этот вторичный профиль. Поле есть сразу в двух профилях вида (у `vms.camera/1` и `vms.ptz/1` — `ptz`, `presets`, `presetMax`) — оставить в обоих и отметить (открытый вопрос 5).

- [ ] **Step 3: Записать отчёт**

Шапка: дата, коммит `index.html`, набор, команда прогона. Таблица на профиль: `поле | в профиле | на экране (вкладки) | проверка по коду | решение`. Итог на профиль: сколько оставить, снять, добавить, новая младшая версия. Ожидаемые находки (гипотезы, их проверяет прогон):
- у `vms.pos/1` экран показывает `ip`, `port`, `vendor`, `model`, `login`, `password`, `enabled` сверх профиля;
- у `vms.edge/1` — `enabled`, `short`, `channel`.

Тексты — по `docs/TEXTS.md`.

- [ ] **Step 4: Чистый `--check` на исключениях**

Перенести причины из шага 2 в `tools/profile_coverage.allow.json`.
Run: `python3 tools/profile_coverage.py --check`
Expected: `RESULT fail`. Остались только поля с решением `снять` или `добавить`, и их список совпадает с отчётом.

- [ ] **Step 5: Коммит**

```bash
git add docs/contract-layers/2026-MM-DD-profili-po-ekranam.md docs/contract-layers/README.md tools/profile_coverage.allow.json
git commit -m "Исследование: профили по особым экранам — сверка 17 профилей с ручными экранами (п. 10): что оставить, снять, добавить"
git pull --rebase && git push
```

---

### Task 7: Профили по особым экранам — младшие версии

**Files:**
- Modify: `api/profiles/*.json` (профили с решениями `снять` или `добавить`), `api/profiles/README.md` (правило снятия), `tools/check_api.py` (снятие по `changes[].removed`), собранные файлы — `python3 tools/build_api.py` (`api/profiles/*.md`, `api/fixtures/demo.json` → `profiles`, `api/fixture.js`, `one-domain.json` через `tools/profile_fixture.py`), `tests/api-*.js` — только тесты, которые опирались на снятые имена
- Create: `api/requests/<ГГГГ-ММ-ДД-ЧЧММССZ>-owner-profiles-by-screens-request.md`, строка в `api/requests/README.md`

**Interfaces:**
- Consumes: отчёт задачи 6. Проверка части 02 «поле сняли без старшей версии» сравнивает с `git show origin/main:api/profiles/<имя>.json` (если часть 02 сделала иначе — то же исключение, на её месте).
- Produces: файл профиля: `changes[]: {version, what, removed?: string[]}`. В `check_api.py` — правило: снятое поле разрешено, если оно в `removed` записи с версией = `version` файла, `version` выше прежней, и поля нет в `properties` и `status`.

- [ ] **Step 1: Проверки `check_api` на копии папки `api`**

Скопировать `api/` в папку сессии (`…/scratchpad/api-neg`) четыре раза, в каждой одна правка `profiles/vms.camera.json`:
- (а) снять поле без `removed` → `check_api.py --api DIR` даёт `FAIL` «поле снято без новой старшей версии»;
- (б) снять поле, `version` +0.1, `changes` с `removed:[поле]` → `PASS`;
- (в) `removed:[поле]`, а поле осталось в `properties` → `FAIL` «снятое поле осталось в профиле»;
- (г) `removed` без подъёма `version` → `FAIL` «снятие без новой младшей версии».

Run: `python3 tools/check_api.py --api …/api-neg-a` и т. д.
Expected до правки `check_api.py`: (б) — `FAIL`, остальные — `FAIL` с прежним сообщением части 02 или без него.

- [ ] **Step 2: Правило в `tools/check_api.py`**

По Interfaces. В шапку модуля — строка о правиле. В `api/profiles/README.md` — абзац:
- снять поле, которого нет на особом экране, можно в младшей версии с `removed`;
- условие — отчёт `tools/profile_coverage.py` и три условия из плана;
- поле, которое экран показывает, снимают только старшей версией.

Run: (а)–(г) снова
Expected: (а), (в), (г) — `FAIL` со своими сообщениями, (б) — `PASS`.

- [ ] **Step 3: Правка профилей по отчёту**

По скиллу `api-contract`. На каждый профиль с решениями — одна младшая версия:
- `снять` — строка ушла из `properties` (или `status`);
- `добавить` — `properties.<имя> = {schema: <кусок схемы вида>, meaning, since: <новая>}`;
- `changes` — `{version, what: "Профиль по особому экрану: добавлены …, сняты …", removed: […]}`.

Схема вида в `demo.json` не меняется: снятое поле остаётся у вида и видно в «Все параметры».
Run: `python3 tools/build_api.py`, затем `python3 tools/build_api.py --check`
Expected: сборка без ошибок, `--check` — pass.

- [ ] **Step 4: Тесты API**

Тест, который проверяет снятое поле со слоем `profile:<id>` (часть 03), получает слой и условие вида эталонного набора (`kind:<вид>`), а не профиля (открытый вопрос 3). Утверждения тестов не меняются.
Run: `python3 tools/run_api_tests.py`, `python3 tools/run_api_tests.py --fixture one-domain`
Expected: `RESULT pass`.

- [ ] **Step 5: Полные проверки**

Run: `python3 tools/check_api.py`, `python3 tools/check_ui.py`, `python3 tools/check_perf.py --quick`, `python3 tools/profile_coverage.py --check`
Expected: `RESULT pass` у всех. У `profile_coverage --check` списки `remove`, `add`, `untested` пусты. В «Все параметры» камеры снятые поля отмечены «сверх профиля» (`ui-unknown.js`, проверка `camExtra`).

- [ ] **Step 6: Коммит правки**

```bash
git add api/profiles tools/check_api.py api/fixtures api/fixture.js tests
git commit -m "API: профили по особым экранам — <N> профилей, младшие версии: поля экрана добавлены, поля вне экрана сняты в схему вида (changes.removed); контракт не менялся"
git pull --rebase && git push
```

- [ ] **Step 7: Уведомление reviewers**

По скиллу `api-contract` (как его переписала часть 01: уведомление о правке профиля идёт тем, кто в `reviewers`). `Кому: w2c, NGP`, `Статус: новый`, коммит правки из `origin/main`. Разделы:
- «Что мы сделали» — по профилю: новая версия, добавлено, снято, ссылка на отчёт задачи 6;
- «Что это значит для вас»:
  - снятое поле можно больше не переводить под нашим именем, но и отдавать его дальше не запрещено: экран его не читает, «Все параметры» его покажут;
  - добавленное поле экран показывает, если вид его отдаёт;
  - объявленный `/1` остаётся в силе;
- «Что проверить».

Строка в `api/requests/README.md`.

```bash
git add api/requests
git commit -m "API: запрос к w2c и NGP — профили по особым экранам, новые младшие версии, проверить"
git pull --rebase && git push
```

---

## Открытые вопросы владельцу

1. **`changes[].removed` и снятие в младшей версии.** Это расширяет формат файла профиля части 02 и её правило в `check_api.py`. Принимаем? Иначе каждое снятие — `vms.X/2`, и у бэкендов с `/1` (w2c) ручные экраны выключатся до их перехода.
2. **Поле, которое экран не показывает, но читает другое** (движок правил, `x-search`, события): оставить в профиле с причиной в исключениях (так в плане) или вынести таких читателей в свой профиль?
3. **Тесты API снятых полей** (часть 03 знает слои `mechanism`, `video`, `profile:<id>`). Предложение: условие `kind:<вид>` эталонного набора внутри слоя профиля, чтобы бэкенд без поля получил пропуск, а не сбой. Нужен ли слою части 03 четвёртый вид — «вид эталонного набора»?
4. **Экраны без профиля** (`ipsrv`, `channel`, `mic`, `sensor`, `relay`, `export`, `email`, `sms`) и **неоднозначный `vms.acs/1`** остаются по коду. Вид бэкенда с другим кодом получит форму по схеме. Заводить ли профили (`vms.acs.sensor/1`…) сейчас или по первому запросу бэкенда? Профиль — слой подсистемы, это дёшево.
5. **Поле в двух профилях вида** (`ptz`, `presets`, `presetMax` — у `vms.camera/1` и `vms.ptz/1`): снять из `vms.camera/1` (младшая версия по правилу п. 1) или оставить в обоих?
6. **`profile_coverage.py --check` в обязательных проверках** правки ручного экрана и `api/profiles/` (`api/TESTS.md`, `CLAUDE.md`). Прогон всех профилей идёт несколько минут. Делаем обязательной или «по таблице, если правка задела»?

## Что не входит

- Ступень 1 (`"page"`, iframe, протокол `setup/1`) и режим сравнения «Свой / Общие» — части 05 и 06. Здесь только точка `screenPageStep` и счёт `screenCoverage`.
- Какие вкладки ручного экрана относятся к виду, а какие к механизму (их заменяет страница), — часть 05 (`tabsForHand`).
- Младшая версия профиля на клиенте: скрыть на ручном экране поля, которых нет в версии сервера (`1.4` при известной `1.5`), — часть 02 (п. 2 переработки).
- Вторичные функции экрана по `implements` (PTZ, разговор): сейчас они включаются по данным объекта (`n.ptz`, дочерний `spk`). Это не меняется.
- Один черновик у ручного экрана и «Все параметры» (`cardDiff` и `n.xprops`).
- Пути профилей вне `openapi.json`, разбиение стенда, API видео (пп. 7, 8, 11).
- Разметка тестов API по слоям — часть 03. Здесь меняются только условия тестов снятых полей.
