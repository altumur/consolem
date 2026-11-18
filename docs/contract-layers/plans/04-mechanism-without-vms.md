# Часть 04. Механизм без VMS (п. 13) — план работ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** система сама объявляет раскладки дерева и разделы приложения. Пути домена VMS, справочники VMS и каталог правил VMS уходят в профили, в описания видов и в пути профилей. Механизм контракта (всё без `x-layer`) больше не знает камер и серверов. Набор «оркестратор агентов» доказывает это тестами API и интерфейса.

**Architecture:** раскладку описывают данные: `TreeLayout` в ответе `GET /kinds` — список правил «где лежит объект» (под областью, под родителем, в папках, под целью ссылки `x-ref`, в группе). Встроенный сервер строит `/tree/children`, `/tree/paths` и `tree.changed` одним общим движком по этим правилам. Четыре нынешние раскладки (`folders`, `servers`, `archives`, `detectors`) становятся данными набора `demo.json`. Разделы приложения система объявляет в `capabilities.sections`. Пути `/domains/{domainId}/…` переезжают в пути профилей `/units/{uid}/…`, справочники — в схемы видов и в ответы путей своих профилей. Всё новое сначала добавляется, а старое помечается `deprecated` и работает. Интерфейс переходит на новое в одном прототипе. После переноса прототипа в `index.html` владелец снимает старое одной ломающей версией (задача 15).

**Tech Stack:** JSON (контракт, наборы), JavaScript (встроенный сервер `api/server.js`, `api/profiles.js`, `api/rule-engine.js`, тесты `tests/*.js`, интерфейс `index.html` и прототип), Python 3 (`tools/*.py`), headless Chrome (`tools/check_ui.py`), Node.js 22 (`tools/check_perf.py`).

**Spec:** [предложение о слоях](../2026-11-16-kontrakt-i-podsistemy-predlozhenie.md): раздел «Для каких систем», п. 4 «Что предлагаем» (таблица «Что в механизме сейчас от VMS»), п. 13 таблицы «Что придётся переработать». Позиция w2c — [запрос](../../../api/requests/2026-11-18-114831Z-w2c-contract-layers-request.md), вопросы 9 и 10, и [ответ](../../../api/requests/2026-11-18-114831Z-w2c-contract-layers-response.md): первыми нужны раскладки дерева и разделы приложения; домен — общее понятие «область системы». Раскладка «по местам» — [«Всё — плагин»](../2026-11-18-everything-is-a-plugin.md), раздел «Места».

> **Сверка с общим планом** ([00-master.md](00-master.md), раздел «Сверка частей» — главнее текста ниже):
>
> - Часть исполняется после 07 (порядок общего плана): `SCREEN_OF_PROFILE`, `PROFILES_KNOWN` уже есть;
> - Review Focus 1 — `tests/ui-bez-vms.js` остаётся в наборе сценариев и запускается в проверках прототипов частей 05 и 06;
> - Review Focus 2 — в задаче 15: шаг `python3 tools/run_api_tests.py --fixture agents --layer mechanism`, ожидание — ни одного `FAIL`, тесты профилей и видео `SKIP` с причиной;
> - О3, О4 — умолчания: `Feature` открытой строкой с кодами VMS в профилях (задача 15), префикс `core.*`.

## Порядок и версии

Части 01, 02, 03 и 07 к началу этой части уже в `main`. Внутри части — порядок w2c: раскладки и разделы первыми.

| Группа | Задачи | Что | Версия контракта |
|---|---|---|---|
| 0. Набор без VMS | 1 | набор `agents` и его проверки | — (новый набор стенда, контракт не меняется) |
| A. Раскладки | 2–4 | `TreeLayout`, общий движок дерева, срезы прототипа от раскладок | V2 (с разделом «Ломающие изменения в V2»: снят `enum` у `layout`), V3 |
| B. Разделы | 5–7 | `capabilities.sections`, рельс прототипа, запрос к w2c | V5 |
| C. Область системы | 8–10 | `core.domain/1`, `core.folder/1`, пути домена — в пути профилей | V8, V9 (с разделом «Ломающие изменения в V9»: у старых путей домена новые `operationId`) |
| D. Справочники и правила | 11–13 | справочники — в виды и пути профилей; каталог правил без VMS | V11, V12 |
| E. Перенос и снятие | 14–15 | прототип → `index.html`; снять устаревшее; граница проверкой; запрос к w2c | V15 (ломающая) |

`V<N>` — версия задачи N: следующая младшая после `origin/main` в момент задачи. Задачи 1, 4, 6, 7, 10, 13, 14 версию не поднимают.

## Global Constraints

- Исполнитель — владелец контракта (`git config user.name` — `joynickray`). Правку механизма и ломающую правку он делает сам. Ломающие правки — только в V2 (`enum` у `layout`), V9 (новые `operationId` у старых путей домена) и V15. Остальные версии только добавляют: старое — `deprecated: true`, работает, как раньше.
- У каждой версии — раздел «Что добавлено в V<N>» в `api/README.md` над последним таким разделом; у V2 и V15 ещё «Ломающие изменения в V<N>» (что снято, чем заменено, что сделать клиенту и бэкенду). `info.version` в `api/openapi.json`.
- `index.html` до задачи 14 не меняется: он работает на старых путях и ключах, стенд их отдаёт. Весь интерфейс этой части — в одном прототипе `index_NN_mehanizm-bez-vms.html` (NN — по правилу `CLAUDE.md`), английский — в `assets/i18n-en-NN.js`. Проверки прототипа — в задаче 14, шаг 1. Правка общих `api/`, `tests/`, `tools/` — проверки сразу.
- Проверки после правки `api/`: `python3 tools/check_api.py`, `python3 tools/run_api_tests.py` (и `--fixture one-domain`, и `--fixture agents`), `python3 tools/check_ui.py`, `python3 tools/check_perf.py --quick`. После правки дерева на стенде ещё `python3 tools/check_scale.py`.
- Слои контракта — по части 01: новый путь профиля получает `x-layer: <id профиля>`, новые схемы механизма — без `x-layer`. Поле, которое уходит из общей схемы, уходит и из `KNOWN_LEAKS` в `tools/layers.py`.
- Профили — файлами по части 02: `api/profiles/<id без /N>.json`, ключи ровно `id`, `version`, `label`, `owner`, `reviewers`, `uses`, `properties`, `status`, `apis`, `changes`. Раздел `profiles` наборов собирает `tools/build_api.py`. У профилей механизма `core.*` — `owner: "владелец контракта"`.
- Тесты API — по части 03: `ApiTest.test(name, fn, {needs, layer, since})`. Тесты механизма — `layer: "mechanism"`. Тест пути профиля — `layer: "profile:<id>"`.
- Движок дерева на стенде читает только индексы склада: `store.byParent`, `store.byFolder`, `store.byRef`, `store.byKind`. Проход по всем объектам запрещён: на `large` 250 000 камер.
- Описания новых схем механизма (`TreeLayout`, `PlaceRule`, `KindSelector`, `TreeGroup`, `AppSection`) и путей `/tree/*` — без слов VMS: «камер», «сервер», «видео», «архив», «детектор», «хранилищ», «VMS». Это проверяет `tools/mechanism.py` (задача 2, правило B5).
- На стенде область — по-прежнему вид с кодом `domain`, папка — `folder`: стенд живёт на старых таблицах (`tableOf` в `api/server.js`). Бэкенд узнаёт область и папку по профилю, а не по коду. Набор `agents` тоже пользуется кодами `domain` и `folder`.
- Карта кода: новые разделы прототипа — заголовком `// ── Заголовок ──`. Объект `const ui={…}` в `paint()` остаётся литералом: по нему `tools/outline.py` находит разделы.
- Правила интерфейса `CLAUDE.md`: тексты — по `docs/TEXTS.md`; обработчики — `onEv`, без `on…` в атрибутах; переход по ссылке моргает.
- Коммиты — по `CLAUDE.md` («API: …; контракт V<N>», «Прототип NN: …», «Макет: из прототипа NN — …», «Тесты: …»), с подписью `Co-Authored-By` из системного напоминания; после задачи — `git pull --rebase && git push`.

## Review Focus

1. **Старый бэкенд без `layouts` и `sections`** (до V15 поля необязательны; w2c переходит не сразу). Интерфейс показывает прежние четыре раскладки и прежние разделы по операциям, а не пустое дерево и пустой рельс. Тест — задача 4 (`slicesFor(null)`) и задача 6 (`appsFor(null, …)`).
2. **Ссылка без цели.** У агента `modelId: null` или цель ссылки убрали правкой. В раскладке «по ссылке» объект уходит к следующему правилу (под область), а `tree.changed` называет и прежнее, и новое место. Тест — задача 3, «Раскладка по ссылке…».
3. **Раздел объявлен, а его операций нет** (ошибка бэкенда). Интерфейс раздел не показывает, `check_api` называет набор. Тест — задача 5 (`section_problems`, S2) и задача 6 (`appsFor`).
4. **Большой домен.** Общий движок на `large` и `xl`: дети домена с 200 000 камер-кластеров, сервер с 1 000 камер, раскрытие и поиск по пути. Время и число запросов — как до правки. Проверка — задача 3, шаг 7 (`check_scale.py`, `check_perf.py --quick`).
5. **Код раскладки с точкой и дефисом** (`agent.models`). Срез `lay:agent.models` переживает смену среза и перерисовку, кнопка находится по `data-slice`. Тест — задача 4.

---

## Карта файлов

| Файл | Что меняется | Задачи |
|---|---|---|
| `api/fixtures/agents.json` | новый набор «оркестратор агентов», руками | 1, 2, 5, 8, 12 |
| `api/fixtures/demo.json` | `layouts`, `sections`, `implements` области и папки, справочники в видах | 2, 5, 8, 9, 11, 12, 15 |
| `api/openapi.json` | `TreeLayout`…, `AppSection`, пути профилей, справочники, каталог правил | 2, 5, 8, 9, 11, 12, 15 |
| `api/server.js` | раздел «Дерево» — общий движок; `/kinds` с `layouts`; пути профилей | 2, 3, 8, 9, 11, 15 |
| `api/profiles.js` | хук `treeHasChildren`; хуки `core.*`; правила VMS (`ruleCondition`, `ruleCheck`) | 3, 8, 12 |
| `api/rule-engine.js` | ядро без условий, проверок и действий VMS; область цели — по раскладке | 12 |
| `api/profiles/*.json` | `core.domain`, `core.folder`, `vms.discovery`, `vms.scenarios`, `vms.relays` | 8, 9, 15 |
| `tools/mechanism.py`, `tools/check_mechanism.py` | новые: проверки раскладок, разделов, границы и их самопроверка | 2, 5, 15 |
| `tools/check_api.py`, `tools/build_api.py`, `tools/profile_fixture.py` | набор `agents`, `layouts`, `sections`, `examples` | 1, 2, 5, 9, 11 |
| `tests/harness.js` | условия `layout:<id>`, `section:<id>` в `needs` | 2, 5 |
| `tests/api-pages.js`, `api-read.js`, `api-domains.js`, `api-automation.js`, `api-devices.js`, `api-cluster.js` | новые тесты и тесты на новых путях | 1–3, 5, 8, 9, 11, 12, 15 |
| `tests/ui-bez-vms.js`, `tests/selftest.js` | новый сценарий на наборе `agents` | 4, 6, 10, 13 |
| `index_NN_mehanizm-bez-vms.html`, `assets/i18n-en-NN.js`, `protos.html` | прототип | 4, 6, 10, 13, 14 |
| `index.html`, `assets/i18n-en.js`, `CHANGES.md` | перенос | 14 |
| `api/README.md`, `api/BACKEND.md`, `api/FRONTEND.md`, `api/ACCEPTANCE.md`, `api/TESTS.md` | договорённости и разделы версий | каждая задача с контрактом |
| `api/requests/…-owner-…-request.md`, `api/requests/README.md` | запросы к w2c | 7, 15 |

## Interfaces (для других частей)

### Раскладка дерева — `KindsList.layouts`

`GET /kinds` → `{items, profiles, layouts}`. В V2 поле необязательное, в V15 обязательное. Порядок — порядок кнопок срезов.

```text
TreeLayout {
  id: string            // ^[a-z][A-Za-z0-9_.-]*$; folders — раскладка механизма (папки);
                        // servers, archives, detectors — раскладки слоя VMS; своя — с префиксом системы (agent.models)
  label: Text           // подпись кнопки
  hint?: Text           // подсказка: «Домен → папки → объекты»
  icon?: string
  place: PlaceRule[]    // minItems 1; первое подходящее правило решает, где объект лежит
  show?: KindSelector   // объект виден, если подходит сам или у него есть ребёнок в этой раскладке, который подходит
  hide?: KindSelector   // объекты этих видов не видны, вместе с их поддеревом
  groups?: TreeGroup[]  // виртуальные узлы под областью
}
PlaceRule {
  what?: KindSelector   // нет — любой вид
  root?: boolean        // true — только корни (parentId: null), false — только дочерние, нет — все
  where?: {property: string, equals: string|number|boolean|null}   // значение свойства объекта
  by: "area" | "parent" | "folders" | "ref" | "group" | "none"
  ref?: KindSelector    // для by: ref — обязательно
  group?: string        // для by: group — id из groups
}
KindSelector { kinds?: string[], implements?: string[] }   // как x-ref; пустой — любой вид
TreeGroup   { id: string, label: Text }
```

Смысл `by`: `area` — прямо под областью (домен объекта); `parent` — под `parentId`, у корня — под областью; `folders` — под каждой папкой из `Unit.folders`; `ref` — под объектом, на который ссылается первое свойство вида с `x-ref`, подходящим под `ref` (значение из `status.observed` под тем же именем главнее значения из `properties`); `group` — под узлом группы; `none` — объекта в раскладке нет. Правило подходит, если подходят `what`, `root`, `where` **и** правило даёт место: у `folders` есть папки, у `ref` есть значение, у `parent` для дочернего объекта есть родитель. Не подошло ни одно правило — объекта в раскладке нет. Объекты видов с `shape: document` в дереве не бывают никогда.

Узел группы: `TreeNode {id: "<group.id>:<uid области>", kind: <group.id>, name: <label.text>, parentId: <uid области>, hasChildren: true, group: true}`. В `/tree/paths` шага группы нет: шаг — всегда объект.

Параметр `layout` у `GET /tree/children` и `GET /tree/paths` — строка, `id` из `layouts`. Другая строка — `422 VALIDATION_FAILED`, `field: layout`. `tree.changed {layout, parentIds}` приходит по каждой объявленной раскладке; незнакомый `layout` клиент пропускает.

Порядок детей: у области, группы и папки — по номеру правила, затем порядок сервера (`partKey`); у остальных узлов — по номеру правила, затем по имени.

### Разделы приложения — `Capabilities.sections`

```text
AppSection { id: string /* ^[a-z][A-Za-z0-9_.-]*$ */, label?: Text, icon?: string }
Capabilities { operations, features, sections?: AppSection[] }   // sections обязательно с V15
```

| `id` | Слой | Нужные операции (`SECTION_OPS`) | Раздел макета (`app`) |
|---|---|---|---|
| `objects` | механизм | `listKinds`, `listUnits`, `getTreeChildren` | `hw` |
| `automation` | механизм | `listRules` | `rules` |
| `access` | механизм | `getAccess` | `acc` |
| `journal` | механизм | `listJournal` | `log` |
| `settings` | механизм | `getSettings` | `sys` |
| `vms.export` | VMS (уйдёт в API видео) | `listExports` | `exp` |

Порядок — порядок рельса. `label` заменяет подпись консоли. Незнакомый `id` клиент пропускает: экрана для него нет. Раздел «Обучение» (`learn`) — раздел самого макета, система его не объявляет: он виден, когда `learnShown()` и у системы есть вид с `vms.camera/1` (главы обучения — про демо VMS).

### Область системы и пути домена

- Профили механизма `core.domain/1` (область системы: по ней считаются права и лицензии; у VMS — домен, у оркестратора — рабочее пространство) и `core.folder/1` (папка). С V8 виды объявляют их рядом с `vms.domain/1` и `vms.folder/1`; в V15 `vms.domain/1` и `vms.folder/1` сняты.
- Пути профилей вместо путей домена (V9). `operationId` переходят на новые пути без изменений, у старых путей — новые `operationId` с `deprecated: true` до V15:

| Профиль (`apis`) | Новый путь | `operationId` | Старый путь до V15 (`operationId`) |
|---|---|---|---|
| `vms.discovery/1` (`discovery`) | `GET`, `POST`, `DELETE /units/{uid}/discovery` | `getDiscovery`, `startDiscovery`, `stopDiscovery` | `/domains/{domainId}/discovery` (`getDomainDiscovery`, `startDomainDiscovery`, `stopDomainDiscovery`) |
| `vms.scenarios/1` (`scenarios`, `scenarios/status`) | `GET`, `PUT /units/{uid}/scenarios`; `GET /units/{uid}/scenarios/status` | `getScenarios`, `putScenarios`, `getScenariosStatus` | `/domains/{domainId}/scenarios…` (`getDomainScenarios`, `putDomainScenarios`, `getDomainScenariosStatus`) |
| `vms.relays/1` (`relays`) | `GET /units/{uid}/relays`, `GET /units/{uid}/relays/{name}` | `listRelays`, `getRelay` | `/domains/{domainId}/relays…` (`listDomainRelays`, `getDomainRelay`) |

`uid` — объект области, вид которого объявил профиль. Объект другого вида — `422 NOT_SUPPORTED`, объекта нет — `404 NOT_FOUND`.

### Справочники и каталог правил

| Было в `Reference` | Стало (V11, V12) |
|---|---|
| `deviceModels` | `examples` у свойства `vendor` видов `camera`, `ipsrv`; `allOf` `if {vendor: {const}}` → `then {model: {examples}}` |
| `recordModes` | `enum` свойства `recordMode` вида; у хранилища — `x-archive.recordModes` (уже есть) |
| `cloudProviders` | `enum` свойства `provider` вида `archive.cloud` (уже есть); регионы — `allOf` `if {provider: {const}}` → `then {region: {enum}}` |
| `serverLabels` | `examples` у `labels.items` вида `server` |
| `analyticsConflicts` | `x-conflicts {значение: [значения]}` у свойства `analyticsKind` вида `det` (расширение профиля `vms.detector/1`) |
| `scenarioKinds`, `limits.scenariosMax` | `ScenarioDoc.kinds`, `ScenarioDoc.maxItems` в ответе `GET /units/{uid}/scenarios` |
| `limits.ipScanMax` | `Discovery.ipScanMax` в ответе `GET /units/{uid}/discovery` |
| `limits.defaultServerPort` | `default` у свойства `port` вида `server` |
| `export` | `GET /exports/reference` (`getExportReference`, `x-layer: video`), ответ — `ExportReference` |
| `layouts`, `monitors` | `schema` у поля действия правила: `RuleActionField.schema` (`enum` + `x-enum-labels`); `RuleActionField.options` — устарело |
| `serviceTypes`, `supportLevels` | нигде: интерфейс их не читает |
| enum `RuleCondition.kind`, `RuleCheck.what`, `RuleTarget.include[].area`, `ruleTargets.areas[]` | открытая строка (V15); каталог — `ruleConditions`, новый `Reference.ruleChecks [{what, implements?}]`, `ruleTargets.areas` |
| смысл области цели `server` | `Reference.ruleTargets.areaLayouts {id области: id раскладки}`: область — все объекты под узлом `uid` в этой раскладке; нет строки — область целиком |

### Тесты, наборы, инструменты

- Набор `agents` (`api/fixtures/agents.json`): `?fixture=agents`, `POST /test/reset {fixture: "agents"}`, `python3 tools/run_api_tests.py --fixture agents`. Сценарий интерфейса на нём — `tests/ui-bez-vms.js` (`FIXTURE_OF` в `tests/selftest.js`).
- Условия в `needs`: `layout:<id>` — система объявила раскладку; `section:<id>` — система объявила раздел.
- `tools/mechanism.py`: `SECTION_OPS: dict[str, list[str]]`; `layout_problems(fx: dict) -> list[str]`; `section_problems(fx: dict) -> list[str]`; `border_problems(spec: dict) -> list[str]`; `VMS_WORDS: tuple[str, ...]`.
- Прототип (после задачи 14 — `index.html`): `layoutDeclared(id) -> boolean`, `slicesFor(layouts: TreeLayout[]|null) -> string[]`, `appsFor(sections: AppSection[]|null, can: (op) => boolean) -> string[]`, `sysPageShown(o) -> boolean`.
- Часть 06 (мост) пользуется `getDiscovery` и другими операциями по `operationId`: путь меняется, имя — нет. Новая операция `getExportReference` получает разметку `x-bridge` в части 06 (`read`).

---

## Группа 0. Набор без VMS

### Task 1: Набор «оркестратор агентов» и его проверки

**Files:**
- Create: `api/fixtures/agents.json`
- Modify: `tools/build_api.py` (`FIXTURES`, профили набора), `tools/check_api.py` (`main`, `check_capabilities`)
- Modify: `tests/api-units.js` (тест набора), тесты, которым на `agents` не хватает `needs`
- Modify: `api/README.md` («Эталонный набор»: «Набор agents»), `api/TESTS.md` (строка `?fixture=agents`, числа)
- Generated: `api/fixture.js`

**Interfaces:**
- Consumes: часть 02 — сборка раздела `profiles` из `api/profiles/*.json` (`profile_wire`); часть 03 — `needs`, `layer`, отказ на необъявленную операцию на встроенном сервере; часть 01 — `layers.layer_of_path(spec, path)`.
- Produces: набор `agents`; `tools/build_api.py`: `PROFILE_FIXTURES = ["demo", "agents"]`, `render_fixture_profiles(name: str) -> str` — текст набора с разделом `profiles` (у `agents` — только профили, которые объявляют его виды); строка `check_api` «agents: только операции механизма».

Набор пишут руками. Содержание:

| Что | Значение |
|---|---|
| виды | `domain` (подпись «Рабочее пространство», `implements: ["vms.domain/1"]`, без `create` и `delete`); `folder` (`vms.folder/1`); `agent.pipeline` «Конвейер» (корень; дети `agent.step`; команды `start`, `stop`; события `finished`, `failed`); `agent.step` «Шаг» (родитель `agent.pipeline`; `order`, `agentId` — `x-ref {kinds: ["agent.agent"]}`); `agent.agent` «Агент» (корень; `modelId` — `x-ref {kinds: ["agent.model"]}`, `toolIds` — массив `x-ref {kinds: ["agent.tool"]}`, `prompt`, `enabled`; команды `start`, `stop`, `check` с `ruleAction: true`; события `failed`, `done`; класс доступа `agent` с уровнями `view`, `run`, `edit`); `agent.model` «Модель» (`provider` — `enum`, `contextTokens`); `agent.tool` «Инструмент» (`kind` — `enum` `http`, `shell`, `search`) |
| объекты | 1 рабочее пространство; папки «Поддержка», «Аналитика»; 2 модели; 3 инструмента; 3 агента (2 в папках, у одного `modelId: null`); 2 конвейера по 2–3 шага |
| правила | одно: «Агент упал — перезапустить» (событие `failed` вида `agent.agent` → `unitAction start`, цель — объект из события) |
| `reference` | `ruleActions`: `net.http`, `rule.runrule`; `ruleConditions`: `time`, `online`; `ruleStarts`: `event`, `manual`; `ruleControls`: `[]`; `ruleTargets`: `{areas: ["folder", "domain"], fromEvent: true}`; `access` — минимальный (класс `agent`); `limits` — как в `demo`; обязательные пока ключи VMS (`deviceModels`, `recordModes`, `cloudProviders`, `layouts`, `monitors`, `serviceTypes`, `supportLevels`) — пустые массивы |
| `capabilities.operations` | все операции путей без `x-layer`, кроме опций (`getSettings`, `patchSettings`), лицензий и ключей, ассистента (`assistTurn`), каталогов (`syncCatalog`); `features: []` |
| прочее | `access` с одной ролью и одним пользователем `admin`; `settings {version: "1", values: {}}`; `licenses`, `journal`, `network`, `discovery` — пустые или по нескольку записей |

- [ ] **Step 1: Тест набора.** В `tests/api-units.js` тест `"Набор без VMS: виды без профилей vms.* сверх области и папки, дерево папок, команда агента"`, `needs: ["listKinds", "getTreeChildren", "runUnitAction", "kind:agent.agent"]`, `layer: "mechanism"`:

```js
const kinds = (await env.ok("GET", "/kinds")).items;
assert.ok(kinds.every((k) => (k.implements || []).every((p) => ["vms.domain/1", "vms.folder/1", "core.domain/1", "core.folder/1"].includes(p))), "сверх области и папки профилей нет");
const top = await env.pages("/tree/children?layout=folders");
assert.eq(top.length, 1, "одна область");
assert.ok((await env.pages(`/tree/children?layout=folders&parentId=${top[0].id}`)).every((n) => n.kind === "folder"), "под областью — папки");
const agent = (await env.ok("GET", "/units?kind=agent.agent")).items[0];
assert.status(await env.call("POST", `/units/${agent.uid}/actions/check`, { params: {} }), 200);
```

- [ ] **Step 2: Запустить и увидеть отказ.** Run: `python3 tools/run_api_tests.py --fixture agents`. Expected: `FAIL` — набора `agents` нет в `api/fixture.js`.

- [ ] **Step 3: Написать набор и подключить его.** `api/fixtures/agents.json` по таблице; `$comment` — «Набор системы не из мира VMS: оркестратор агентов. Правится руками; раздел profiles собирает tools/build_api.py». `tools/build_api.py`: `"agents"` в `FIXTURES`, `render_fixture_profiles` для `PROFILE_FIXTURES`. `tools/check_api.py`: набор `agents` — в `check_fixture`, `check_units`, `check_capabilities` и новой строке «agents: только операции механизма» (операция, у пути которой `layers.layer_of_path` не `None`, — отказ `agents: операция <op> — слоя <layer>`).

- [ ] **Step 4: Прогнать тесты API на наборе.** Run: `python3 tools/build_api.py && python3 tools/run_api_tests.py --fixture agents`. Expected: `RESULT pass` — только `PASS` и `SKIP`. Каждый `FAIL` «тест вызвал операцию …, которую система не объявила» или сбой теста механизма на видах VMS: дописать тесту `needs` (`kind:…`, `implements:…`, операцию). Сбой самого стенда на наборе (`api/server.js`, `api/profiles.js` ждут вида VMS) — починить, не меняя ответов на `demo`. Имена тестов и починки — в сообщение коммита.

- [ ] **Step 5: Остальные проверки.** Run: `python3 tools/check_api.py && python3 tools/run_api_tests.py && python3 tools/run_api_tests.py --fixture one-domain && python3 tools/check_ui.py`. Expected: `RESULT pass` у всех; на `demo` и `one-domain` числа PASS те же, что до задачи, плюс новый тест (на них он `SKIP`).

- [ ] **Step 6: Документы.** `api/README.md`, «Эталонный набор»: подраздел «Набор agents» — зачем (система не из мира VMS), что в нём, как загрузить. `api/TESTS.md`: строка `?fixture=agents` в таблице наборов, число тестов и пропусков на `agents`.

- [ ] **Step 7: Коммит.**

```bash
git add api/fixtures/agents.json api/fixture.js tools/build_api.py tools/check_api.py tests/ api/README.md api/TESTS.md api/server.js api/profiles.js
git commit -m "API: набор agents — система не из мира VMS (оркестратор агентов), тесты API на нём"
git pull --rebase && git push
```

## Группа A. Раскладки дерева от системы

### Task 2: Объявление раскладок в контракте и наборах

**Files:**
- Modify: `api/openapi.json` (схемы `TreeLayout`, `PlaceRule`, `KindSelector`, `TreeGroup`; `KindsList.layouts`; параметр `layout` у `/tree/children` и `/tree/paths`; `TreeNode.group`, описание `TreeNode.kind`; описание `tree.changed`; `info.version`)
- Modify: `api/fixtures/demo.json`, `api/fixtures/agents.json` (раздел `layouts`)
- Modify: `api/server.js` (`kindsList` отдаёт `layouts`, `ETag` их учитывает; проверка `layout` — по объявленным вместо `LAYOUTS`)
- Modify: `tools/profile_fixture.py` (раздел `layouts` переходит в `one-domain`, `large` как есть), `tools/check_api.py` (`known` += `layouts`, проверка схемой `TreeLayout`, строки отчёта)
- Create: `tools/mechanism.py`, `tools/check_mechanism.py`
- Modify: `tests/harness.js` (условие `layout:<id>`), `tests/api-pages.js`
- Modify: `api/README.md` («Что добавлено в V2», «Ломающие изменения в V2», «Договорённости»: «Раскладки дерева»), `api/TESTS.md` (`check_mechanism.py`)
- Generated: `api/openapi.js`, `api/fixture.js`, `api/fixtures/one-domain.json`, `large.json`

**Interfaces:**
- Consumes: задача 1 (набор `agents`).
- Produces: схемы и поле из раздела Interfaces «Раскладка дерева»; `tools/mechanism.py`: `layout_problems(fx) -> list[str]`, `border_problems(spec) -> list[str]` (пока только B5), `VMS_WORDS`; условие `layout:<id>`.

Раскладки `demo.json` — ровно так (подписи — `Text` с ключами `layout.<id>`, `layout.<id>.hint`, `layout.servers.unalloc`):

```json
[
 {"id": "folders", "label": "По папкам", "hint": "Домен → папки → объекты", "icon": "folder",
  "place": [{"what": {"implements": ["vms.folder/1"]}, "root": true, "by": "area"},
            {"what": {"implements": ["vms.folder/1"]}, "by": "parent"},
            {"by": "folders"},
            {"root": false, "by": "parent"}],
  "hide": {"implements": ["vms.stream/1"]}},
 {"id": "servers", "label": "По серверам", "hint": "Домен → серверы → камеры, хранилища и службы", "icon": "server",
  "place": [{"what": {"implements": ["vms.server/1"]}, "where": {"property": "allocated", "equals": true}, "by": "area"},
            {"what": {"implements": ["vms.server/1"]}, "by": "group", "group": "unalloc"},
            {"root": true, "by": "ref", "ref": {"implements": ["vms.server/1"]}},
            {"what": {"implements": ["vms.folder/1", "vms.archive/1", "vms.volume/1"], "kinds": ["export", "email", "sms"]}, "by": "none"},
            {"root": true, "by": "area"},
            {"by": "parent"}],
  "hide": {"implements": ["vms.stream/1"]},
  "groups": [{"id": "unalloc", "label": "Нераспределённые серверы"}]},
 {"id": "archives", "label": "Хранилища", "icon": "archive",
  "place": [{"what": {"implements": ["vms.server/1"]}, "where": {"property": "allocated", "equals": true}, "by": "area"},
            {"what": {"implements": ["vms.archive/1"]}, "root": true, "by": "area"},
            {"what": {"implements": ["vms.archive/1", "vms.volume/1"]}, "root": false, "by": "parent"}]},
 {"id": "detectors", "label": "Детекторы", "icon": "det",
  "place": [{"what": {"implements": ["vms.server/1"]}, "where": {"property": "allocated", "equals": true}, "by": "area"},
            {"root": true, "by": "ref", "ref": {"implements": ["vms.server/1"]}},
            {"root": false, "by": "parent"}],
  "show": {"implements": ["vms.server/1", "vms.detector/1", "vms.subdetector/1"]},
  "hide": {"implements": ["vms.stream/1"]}}
]
```

Раскладки `agents.json`: `folders` — как в `demo`; `agent.pipelines` «Конвейеры»: `[{"what": {"kinds": ["agent.pipeline"]}, "root": true, "by": "area"}, {"what": {"kinds": ["agent.step"]}, "by": "parent"}]`; `agent.models` «По моделям»: `[{"what": {"kinds": ["agent.model"]}, "root": true, "by": "area"}, {"what": {"kinds": ["agent.agent"]}, "by": "ref", "ref": {"kinds": ["agent.model"]}}, {"what": {"kinds": ["agent.agent"]}, "by": "area"}]`.

Правила `layout_problems(fx)` — каждое своя строка отказа `<набор>: раскладка <id>: …`:
- **L1** `id` уникальны; **L2** `group` правила есть в `groups`; **L3** у `by: ref` непустой `ref`, у `by: group` есть `group`; **L4** `where.property` есть в схеме хотя бы одного вида, подходящего под `what`; **L5** коды из `kinds` и профили из `implements` во всех селекторах объявлены в наборе; **L6** у `folders` есть правило `by: folders`; **L7** `getTreeChildren` объявлена — раскладок не меньше одной.

Правило **B5** `border_problems(spec)`: описания (`description`, вложенные) схем `TreeLayout`, `PlaceRule`, `KindSelector`, `TreeGroup`, `TreeNode`, `TreePath`, `TreePathStep`, `KindsList` и операций путей `/tree/*` не содержат ни одного слова из `VMS_WORDS = ("камер", "сервер", "видео", "архив", "детектор", "хранилищ", "VMS")` без учёта регистра. Отказ: `<схема или путь>: в описании механизма «<слово>»`.

- [ ] **Step 1: Самопроверка модуля.** `tools/check_mechanism.py` по образцу `tools/check_outline.py` (`ok(cond, what)`, код выхода 1). Каждый случай — `copy.deepcopy` живого набора или контракта с одной правкой:

```python
ok(layout_problems(demo) == [] and layout_problems(agents) == [], "живые наборы: раскладки целы")
x = dup(demo); x["layouts"].append(dict(x["layouts"][0]))
ok(any("folders" in p and "повтор" in p for p in layout_problems(x)), "L1: повтор id")
x = dup(demo); servers(x)["place"][1]["group"] = "нет"
ok(any("нет" in p and "groups" in p for p in layout_problems(x)), "L2: группа не объявлена")
x = dup(demo); servers(x)["place"][2].pop("ref")
ok(any("ref" in p for p in layout_problems(x)), "L3: by ref без ref")
x = dup(demo); servers(x)["place"][0]["where"]["property"] = "нетТакого"
ok(any("нетТакого" in p for p in layout_problems(x)), "L4: свойства нет у вида")
x = dup(agents); models(x)["place"][1]["ref"] = {"kinds": ["agent.нет"]}
ok(any("agent.нет" in p for p in layout_problems(x)), "L5: вид не объявлен")
x = dup(demo); folders(x)["place"] = [p for p in folders(x)["place"] if p["by"] != "folders"]
ok(any("folders" in p and "by: folders" in p for p in layout_problems(x)), "L6: папки без правила папок")
s = dup(spec); s["components"]["schemas"]["TreeLayout"]["description"] += " Камеры"
ok(any("TreeLayout" in p and "камер" in p for p in border_problems(s)), "B5: слово VMS в механизме")
ok(border_problems(spec) == [], "живой контракт: B5 цела")
```

- [ ] **Step 2: Тест API.** В `tests/api-pages.js` тест `"Раскладки V2: GET /kinds отдаёт layouts — id уникальны, у каждой label и place; раскладка не из списка — 422"`, `needs: ["listKinds", "getTreeChildren"]`, `layer: "mechanism"`: `layouts` — непустой массив, `new Set(ids).size === ids.length`, у каждой `label.text` и `place.length > 0`; `GET /tree/children?layout=нет` → `422 VALIDATION_FAILED`, `field: layout`; на `demo` ещё `ids` равны `["folders", "servers", "archives", "detectors"]`, на `agents` — `["folders", "agent.pipelines", "agent.models"]`. В `tests/harness.js` условие `layout:<id>` — `!KINDS || !(KINDS.layouts || []).some((l) => l.id === id)`.

- [ ] **Step 3: Запустить и увидеть отказ.** Run: `python3 tools/check_mechanism.py; python3 tools/run_api_tests.py --only "Раскладки V2"`. Expected: `ModuleNotFoundError: mechanism`; тест — `FAIL`: в `/kinds` нет `layouts`.

- [ ] **Step 4: Контракт, наборы, стенд, проверки.** Схемы по Interfaces. Параметр `layout`: `{"type": "string", "pattern": "^[a-z][A-Za-z0-9_.-]*$"}`, описание «Код раскладки из GET /kinds → layouts. Другой — 422 VALIDATION_FAILED, field: layout». `TreeNode.kind` — «код вида; у узла группы — код группы раскладки (TreeLayout.groups)», `TreeNode.group` — «true: виртуальный узел группы, объекта за ним нет». Описания без слов VMS (B5). `tools/mechanism.py` по правилам выше; `check_api.py` — строки «Раскладки дерева в наборах: объявления сходятся с видами» (`layout_problems` по `demo`, `one-domain`, `large`, `agents`) и «Граница механизма: без VMS в общих описаниях» (`border_problems`). Стенд в этой задаче только отдаёт `layouts` и проверяет код по ним; дерево строит прежний код (задача 3).

- [ ] **Step 5: Собрать и проверить.** Run: `python3 tools/profile_fixture.py && python3 tools/build_api.py && python3 tools/check_mechanism.py && python3 tools/check_api.py && python3 tools/run_api_tests.py && python3 tools/run_api_tests.py --fixture one-domain && python3 tools/run_api_tests.py --fixture agents && python3 tools/check_ui.py && python3 tools/check_perf.py --quick`. Expected: `check_mechanism` без `FAIL`, остальные — `RESULT pass`; на `agents` тест V2 проходит, тесты дерева по раскладкам VMS — `SKIP` (у них `needs` `layout:servers` и т. п.; где такого условия нет — дописать).

- [ ] **Step 6: Документы.** `api/README.md`: «Договорённости» — пункт «Раскладки дерева» (смысл правил, порядок детей, узел группы, незнакомая раскладка); «Что добавлено в V2» — `layouts`, схемы, `TreeNode.group`, четыре раскладки — данные `demo.json`; «Ломающие изменения в V2» — у `layout` снят `enum`: бэкенд принимает код из своих `layouts`, клиент пропускает `tree.changed` незнакомой раскладки. `api/TESTS.md`: `python3 tools/check_mechanism.py` — после правки `tools/mechanism.py`.

- [ ] **Step 7: Коммит.**

```bash
git add api/openapi.json api/openapi.js api/fixtures/ api/fixture.js api/server.js tools/mechanism.py tools/check_mechanism.py tools/check_api.py tools/profile_fixture.py tests/harness.js tests/api-pages.js api/README.md api/TESTS.md
git commit -m "API: раскладки дерева объявляет система — GET /kinds → layouts, layout без enum; контракт V2"
git pull --rebase && git push
```

### Task 3: Общий движок раскладок на стенде

**Files:**
- Modify: `api/server.js`, раздел «Дерево» (`treeKids`, `treeChildren`, `treeChains`, `treePaths`, `unitHasChildren` — заменить; константы `LAYOUTS`, `SERVICE` — снять) и раздел «Поток событий» (`treeTouch`, `unitTreeTouch`, `treeFlush`)
- Modify: `api/profiles.js` (хук `vms.camera/1` `treeHasChildren`)
- Modify: `api/openapi.json` (`info.version`), `tests/api-pages.js`, `api/README.md` («Что добавлено в V3»), `api/BACKEND.md` (раздел «Раскладки дерева»: как бэкенд считает места)

**Interfaces:**
- Consumes: задача 2 (`layouts` в наборе, схема правил).
- Produces (внутри `create()` в `api/server.js`):
  - `layoutOf(id: string) -> TreeLayout | null`;
  - `placeOf(layout: TreeLayout, u: Unit) -> {rule: number, at: string[]} | null` — первое подходящее правило и места: `uid` узла-родителя или `<group>:<uid области>`;
  - `layoutKids(layout, parentId: string | null) -> Array<[key: string, node: TreeNode | (() => TreeNode)]> | null`;
  - `layoutVisible(layout, u) -> boolean`, `layoutHasKids(layout, u) -> boolean` (до первого видимого ребёнка);
  - `layoutChains(layout, uid) -> TreePathStep[][]`;
  - `layoutDescendants(layout, nodeId, limit: number) -> Unit[]` — для области цели правила (задача 12);
  - `treeTouch(after: Unit | null, before: Unit | null)` — по каждой объявленной раскладке места `before` и `after` идут в `tree.changed`;
  - хук профиля `treeHasChildren(unit, ctx) -> boolean | undefined` (`api/profiles.js`): `true` — у узла «может быть» дети (камера-кластер), `undefined` — решает движок.

Кандидаты в дети узла `P` — только из индексов; место каждого кандидата проверяет `placeOf`:

```text
P = null                → области: объекты видов с core.domain/1 или vms.domain/1 (до V15)
P = "<g>:<area>"        → корни области store.byParent(null, area), у которых placeOf → группа g
P — область             → корни области store.byParent(null, P) + узлы групп, в которые попал хоть один корень
P — папка               → store.byFolder(P) ∪ store.byParent(P)
P — другой объект       → store.byParent(P) ∪ store.byRef(P)
ребёнок c узла P        ⇔ P ∈ placeOf(L, c).at  и  layoutVisible(L, c)
layoutVisible(L, c)     ⇔ вид c не подходит под hide, предок c в раскладке не скрыт,
                          и (нет show, или c подходит под show, или есть ребёнок c в L, который подходит под show)
hasChildren             ⇔ область или группа; иначе treeHasChildren(c) === true или layoutHasKids(L, c)
```

`show` смотрит на детей на один уровень вниз, без обхода всего поддерева: так раскладка `detectors` совпадает с нынешней (`camHasDets`) и не дороже её.

- [ ] **Step 1: Снять образец дерева прежним кодом.** Скрипт в рабочей папке сессии (в git не идёт) поднимает встроенный сервер (`ConsolemServer.create` с набором из `api/fixture.js`, как `tools/serve_api.mjs`) и по каждой раскладке обходит дерево целиком: все страницы `/tree/children` от корня до листьев, для каждого узла — `id`, `kind`, `name`, `parentId`, `hasChildren`, порядок, `parentCount`; затем `/tree/paths` по 200 первым объектам. Run: для `demo` и `one-domain` → `tree-before-<набор>.json`. Expected: файлы записаны, в каждом четыре раскладки.

- [ ] **Step 2: Новые тесты API.** В `tests/api-pages.js`, `layer: "mechanism"`:
  - `"Раскладки V3: путь /tree/paths сходится с /tree/children у каждой объявленной раскладки"`, `needs: ["listKinds", "getTreeChildren", "getTreePaths"]`: для каждой раскладки — корень, дети первых пяти областей и дети первых десяти их узлов-объектов (не групп); для каждого такого узла `n` есть цепочка, у которой последний шаг — `n.id`, а ближайший узел-объект над `n` в дереве есть в цепочке;
  - `"Раскладка по ссылке V3: агент под своей моделью, без модели — под областью, правка модели — tree.changed по обоим местам"`, `needs: ["patchUnit", "layout:agent.models", "kind:agent.agent"]`: дети модели — ровно агенты с её `modelId`; агент с `modelId: null` — ребёнок области; `PATCH modelId` у агента с модели A на модель B → в течение секунды по часам стенда `tree.changed {layout: "agent.models"}` с `parentIds`, где есть A и B; `PATCH modelId: null` → агент среди детей области;
  - `"Раскладка show и hide V3: в detectors видны только камеры с детекторами, потоков нет ни в одной раскладке"`, `needs: ["getTreeChildren", "layout:detectors", "implements:vms.detector/1"]`: под каждым сервером первого домена у каждого узла камеры есть ребёнок с `vms.detector/1` или `vms.subdetector/1` в `implements`; ни в одной раскладке нет узла вида `stream`.

- [ ] **Step 3: Запустить и увидеть отказ.** Run: `python3 tools/run_api_tests.py --fixture agents --only "Раскладка по ссылке V3"`. Expected: `FAIL` — прежний код не знает раскладки `agent.models` (дети модели пусты).

- [ ] **Step 4: Движок.** Функции из Interfaces. Прежние `treeKids` и `treeChains` снимаются целиком. Камера-кластер («может быть» дети) — хук `treeHasChildren` у `vms.camera/1` в `api/profiles.js` (сейчас — `isClusterCam` в `unitHasChildren`). `unitTreeTouch` и `treeTouch` зовут `treeTouch(after, before)` там, где объект меняется, создаётся, удаляется и переносится; `treeFlush` шлёт по одному `tree.changed` на раскладку, как сейчас.

- [ ] **Step 5: Сравнить с образцом.** Run: скрипт шага 1 на новом коде → `tree-after-<набор>.json`, затем сравнение по узлам. Expected: совпадает всё, кроме трёх допустимых расхождений: (а) у сервера без размещённых объектов `hasChildren: false` (было `true`); (б) объект в папке, у которого есть родитель, лежит только под папкой, а не ещё и под родителем; (в) `tree.changed` теперь приходит и по `archives`, и по `detectors`. Каждое найденное расхождение (а) или (б) — с `id` в отчёт задачи; другое расхождение — ошибка движка.

- [ ] **Step 6: Тесты.** Run: `python3 tools/run_api_tests.py && python3 tools/run_api_tests.py --fixture one-domain && python3 tools/run_api_tests.py --fixture agents && python3 tools/check_ui.py`. Expected: `RESULT pass`; прежние тесты дерева (`tests/api-pages.js`, `api-units.js`, `api-devices.js`) проходят без правок. Сценарий интерфейса, который ждал стрелку у пустого сервера, — поправить ожидание и назвать в отчёте.

- [ ] **Step 7: Скорость.** Run: `python3 tools/check_scale.py && python3 tools/check_scale.py --fixture xl && python3 tools/check_perf.py --quick`. Expected: `RESULT pass` у `check_scale`; `check_perf` — без новых сбоев против запуска на коде до задачи (сбой — по `api/TESTS.md`, раздел 9: повторить шаг с `--steps <id>`, сравнить с прежним кодом).

- [ ] **Step 8: Версия и документы.** `info.version` = V3. `api/README.md`, «Что добавлено в V3»: стенд строит дерево общим движком по `layouts`; `tree.changed` — по каждой объявленной раскладке; расхождения (а) и (б). `api/BACKEND.md`, раздел «Раскладки дерева»: алгоритм кандидатов и мест (блок выше), пределы — только индексы, страницы.

- [ ] **Step 9: Коммит.**

```bash
git add api/server.js api/profiles.js api/openapi.json api/openapi.js tests/api-pages.js api/README.md api/BACKEND.md
git commit -m "API: стенд строит дерево общим движком по объявленным раскладкам, tree.changed по каждой; контракт V3"
git pull --rebase && git push
```

### Task 4: Прототип — срезы дерева от объявленных раскладок

**Files:**
- Create: `index_NN_mehanizm-bez-vms.html` (копия `index.html`), `assets/i18n-en-NN.js`, `tests/ui-bez-vms.js`
- Modify: `protos.html` (строка прототипа), `tests/selftest.js` (`FIXTURE_OF["ui-bez-vms.js"] = "agents"`)

**Interfaces:**
- Consumes: задачи 2–3 (`/kinds` → `layouts`, движок).
- Produces (прототип, раздел `// ── Раскладки дерева от системы ──`):
  - `TREE_LAYOUTS: TreeLayout[] | null` — из `kindsLoad()`; `null` — система не прислала `layouts`;
  - `layoutDeclared(id: string) -> boolean` — при `TREE_LAYOUTS === null` верно для `folders`, `servers`, `archives`, `detectors`;
  - `SLICE_LAYOUTS = {all: ["folders", "servers"], cam: ["folders", "servers"], acfa: ["folders", "servers"], srv: ["servers"], arch: ["archives"], det: ["detectors"]}` — срез виден, если объявлена хоть одна его раскладка, а у `cam` и `acfa` ещё есть вид с `x-ui-category.view` `cam` или `acfa`;
  - `slicesFor(layouts: TreeLayout[] | null) -> string[]` — видимые срезы в порядке `SLICE`, затем `lay:<id>` — по одному на объявленную раскладку, которой нет среди `folders`, `servers`, `archives`, `detectors`, в порядке объявления;
  - срез `lay:<id>`: подпись — `textOf(layout.label)`, значок — `layout.icon || "folder"`, `SLICE_GROUPS["lay:<id>"] = ["layout"]`, кнопка «Папки» неактивна, `treeLayout()` → `<id>`, подсказка — `layout.hint`, если есть.

- [ ] **Step 1: Создать прототип.** `git pull --rebase`; номер NN — по правилу `CLAUDE.md`; копия `index.html` → `index_NN_mehanizm-bez-vms.html`, коммит `Прототип NN: копия index.html`; строка в `protos.html`: номер, ссылка, автор, «механизм без VMS: раскладки и разделы от системы, пути домена и справочники из профилей», статус «обсуждается»; push.

- [ ] **Step 2: Сценарий.** `tests/ui-bez-vms.js`, первая строка сценария — `if (typeof slicesFor !== "function") { ok(true, "срезов от раскладок на этой странице нет: проверять нечего"); return; }`. Проверки:

```js
ok(slicesFor(null).join() === "all,cam,acfa,srv,arch,det", "без layouts — прежние срезы");
ok(slicesFor(TREE_LAYOUTS).join() === "all,lay:agent.pipelines,lay:agent.models", "срезы набора agents");
const chips = [...document.querySelectorAll(".ph-choice[data-slice]")].map((b) => b.textContent).join(" | ");
ok(!/Камеры|ОПС|Серверы|Хранилища|Детекторы/.test(chips), "кнопок срезов VMS нет: " + chips);
ok(document.getElementById("viewBtn").disabled, "«Папки» неактивна: второй раскладки у среза нет");
setSlice("lay:agent.models"); await until(() => treeRowsText().includes("GPT"), "модели в дереве");
// раскрыть модель → под ней агенты этой модели; агент без модели — прямо под рабочим пространством
setSlice("all"); setSlice("lay:agent.models"); ok(slice === "lay:agent.models", "срез с точкой в коде переживает смену среза");
```

Имена моделей и агентов — из `agents.json`; `treeRowsText` — помощник сценария над `#tree`.

- [ ] **Step 3: Запустить и увидеть отказ.** Run: `python3 tools/check_ui.py --page index_NN_mehanizm-bez-vms.html tests/ui-bez-vms.js`. Expected: одна строка `PASS` («проверять нечего»): функции ещё нет. После шага 4 тот же запуск — уже настоящие проверки.

- [ ] **Step 4: Срезы от раскладок.** В прототипе: `kindsLoad()` кладёт `layouts` в `TREE_LAYOUTS`; `panelHeadHtml` и `panelHeadHtmlRun` берут срезы из `slicesFor(TREE_LAYOUTS)` вместо `Object.keys(SLICE)`; `setSlice` и `normSlice` принимают `lay:<id>` объявленной раскладки, неизвестный — пропускают, как сейчас; `treeLayout()`, `treeOpenable()` (узел с `hasChildren` в срезе `lay:`), `sliceGroups()` — по таблице Interfaces. Срез из адреса страницы (`#…`) с `lay:<id>` открывается после `kindsLoad()`. Новых текстов интерфейса нет: подписи — от системы.

- [ ] **Step 5: Посмотреть в браузере.** Открыть `index_NN_mehanizm-bez-vms.html?fixture=agents` и `index_NN_mehanizm-bez-vms.html` (набор `demo`): снимок шапки дерева, ошибки консоли. Expected: на `agents` — «Оборудование» (подпись поменяет задача 6), «Конвейеры», «По моделям»; на `demo` — прежние шесть срезов; ошибок нет.

- [ ] **Step 6: Коммит.** Проверки прототипа отложены до задачи 14 (`CLAUDE.md`); `tests/` общие, поэтому сценарий на `index.html` прогнать сразу: Run: `python3 tools/check_ui.py tests/ui-bez-vms.js`. Expected: `PASS` «проверять нечего».

```bash
git add index_NN_mehanizm-bez-vms.html assets/i18n-en-NN.js tests/ui-bez-vms.js tests/selftest.js protos.html
git commit -m "Прототип NN: срезы дерева — от раскладок системы (GET /kinds → layouts)"
git pull --rebase && git push   # в фоне; ссылка на Pages — сразу
```

## Группа B. Разделы приложения от системы

### Task 5: `capabilities.sections` в контракте и наборах

**Files:**
- Modify: `api/openapi.json` (схема `AppSection`, `Capabilities.sections`, `info.version`)
- Modify: `api/fixtures/demo.json`, `api/fixtures/agents.json`, `tools/profile_fixture.py` (у `one-domain` и `large` — разделы `demo` без тех, чьих операций нет)
- Modify: `tools/mechanism.py` (`SECTION_OPS`, `section_problems`), `tools/check_mechanism.py`, `tools/check_api.py` (строка отчёта)
- Modify: `tests/harness.js` (условие `section:<id>`), `tests/api-read.js`
- Modify: `api/README.md` («Что добавлено в V5», «Возможности системы»), `api/BACKEND.md` («Разделы приложения»)

**Interfaces:**
- Consumes: задача 1.
- Produces: `AppSection`, `Capabilities.sections`, таблица кодов и `SECTION_OPS` (Interfaces «Разделы приложения»); `section_problems(fx) -> list[str]`; условие `section:<id>`.

Данные: `demo` — `[{"id": "objects"}, {"id": "automation"}, {"id": "access"}, {"id": "journal"}, {"id": "settings"}, {"id": "vms.export"}]`; `agents` — `[{"id": "objects", "label": {"key": "section.agent.objects", "text": "Агенты", "lang": "ru"}}, {"id": "automation"}, {"id": "access"}, {"id": "journal"}]`.

Правила `section_problems(fx)`: **S1** `id` уникальны; **S2** у раздела из `SECTION_OPS` объявлены все его операции — иначе `<набор>: раздел <id> без операций <ops>`; **S3** `id` по шаблону; **S4** `demo` объявляет все коды `SECTION_OPS` (эталон — весь контракт).

- [ ] **Step 1: Самопроверка.** В `tools/check_mechanism.py`: живые наборы — `[]`; `demo` с повтором `objects` — S1; `agents` без `listRules` в `operations` — S2 с `automation`; `demo` без `vms.export` — S4.

- [ ] **Step 2: Тест API.** `tests/api-read.js`, `"Разделы V5: capabilities.sections — коды уникальны, у раздела механизма объявлены его операции"`, `needs: ["getReference"]`, `layer: "mechanism"`: `sections` есть; коды уникальны; для каждого кода из таблицы (копия `SECTION_OPS` в тесте) все его операции есть в `capabilities.operations`. В `tests/harness.js` условие `section:<id>`.

- [ ] **Step 3: Запустить и увидеть отказ.** Run: `python3 tools/check_mechanism.py; python3 tools/run_api_tests.py --only "Разделы V5"`. Expected: `FAIL` — функции и поля нет.

- [ ] **Step 4: Контракт и данные.** `AppSection` по Interfaces; описание `Capabilities.sections` — таблица кодов механизма с операциями, «незнакомый код клиент пропускает», «нет поля — клиент выводит разделы из операций, как до V5» (B5 — без слов VMS: о `vms.export` в описании не писать, он в `api/README.md`). `profile_fixture.py` снимает раздел, если у профиля нет его операций (`SECTION_OPS` из `tools/mechanism.py`).

- [ ] **Step 5: Собрать и проверить.** Run: `python3 tools/profile_fixture.py && python3 tools/build_api.py && python3 tools/check_mechanism.py && python3 tools/check_api.py && python3 tools/run_api_tests.py && python3 tools/run_api_tests.py --fixture one-domain && python3 tools/run_api_tests.py --fixture agents && python3 tools/check_ui.py && python3 tools/check_perf.py --quick`. Expected: всё `RESULT pass`, `check_perf` — без новых сбоев.

- [ ] **Step 6: Документы и коммит.** `api/README.md`: «Возможности системы» — абзац о `sections`; «Что добавлено в V5». `api/BACKEND.md`: «Разделы приложения» — таблица кодов, «объявлять только раздел, операции которого сделаны».

```bash
git add api/openapi.json api/openapi.js api/fixtures/ api/fixture.js tools/ tests/harness.js tests/api-read.js api/README.md api/BACKEND.md
git commit -m "API: разделы приложения объявляет система — capabilities.sections; контракт V5"
git pull --rebase && git push
```

### Task 6: Прототип — рельс и страницы «Опций» по объявлению

**Files:**
- Modify: `index_NN_mehanizm-bez-vms.html`, `assets/i18n-en-NN.js`, `tests/ui-bez-vms.js`

**Interfaces:**
- Consumes: задача 5 (`capabilities.sections`), задача 4 (прототип).
- Produces (раздел `// ── Разделы приложения от системы ──`):
  - `APP_SECTION = {hw: "objects", rules: "automation", acc: "access", log: "journal", sys: "settings", exp: "vms.export"}`;
  - `appsFor(sections: AppSection[] | null, can: (op: string) => boolean) -> string[]` — `app` в порядке объявления; раздел виден, если объявлен и прежнее условие `appsShown()` для него верно (`can("listRules")`, `!accDenied`…); `learn` — последним, если `learnShown()` и есть вид с `vms.camera/1`; `sections === null` — прежний список `appsShown()`;
  - `appLabel(id) -> string` — `textOf(section.label)` или прежняя подпись;
  - `SYS_PAGE_NEEDS = {keys: ["implements:vms.ptz/1"], ptz: ["implements:vms.ptz/1"], cloud: ["implements:vms.camera/1"], maps: ["implements:vms.camera/1"], alarm: ["implements:vms.camera/1"], export: ["op:listExports"], lic: ["op:listLicenses"]}`; `sysPageShown(o) -> boolean`;
  - срез `all` подписан `appLabel("hw")`.

- [ ] **Step 1: Сценарий.** В `tests/ui-bez-vms.js`, после проверок срезов, с той же защитой (`typeof appsFor !== "function"` → `ok(true, …)`):

```js
ok(appsFor(null, can).join() === appsShown().join(), "без sections — прежние разделы");
ok(appsFor(CAPS_SECTIONS, can).join() === "hw,rules,acc,log", "разделы agents");
ok(appsFor([{ id: "automation" }], () => false).length === 0, "раздел без своих операций не виден");
const rail = [...document.querySelectorAll("#rail .asw")].map((b) => b.textContent.trim());
ok(rail.join() === "Агенты,Автоматизация,Права,Журнал", "рельс: " + rail.join());
ok(!/Оборудование|Экспорт|Опции|Обучение/.test(document.getElementById("rail").textContent), "разделов VMS на рельсе нет");
goApp("sys"); ok(app === "hw", "необъявленный раздел не открывается");
ok(document.querySelector('.ph-choice[data-slice="all"]').textContent.includes("Агенты"), "срез «все» — подписью раздела");
```

`CAPS_SECTIONS` — `capabilities.sections` из `capsLoad()`, `null` без поля.

- [ ] **Step 2: Запустить и увидеть отказ.** Run: `python3 tools/check_ui.py --page index_NN_mehanizm-bez-vms.html tests/ui-bez-vms.js`. Expected: проверки срезов — `PASS`, новая часть — `PASS` «проверять нечего» (функции нет); после шага 3 — настоящие проверки.

- [ ] **Step 3: Рельс по объявлению.** `capsLoad()` кладёт `sections` в `CAPS_SECTIONS`; `appSwitchHtml` и `appsShown` идут через `appsFor`; подписи — `appLabel` (рельс, заголовок раздела — строка с `APPS_LIST.find` в шапке); `goApp(id)` для невидимого раздела ничего не делает; после `appLoad()` открытый раздел не виден — открыть первый видимый; видимых нет — `paintMain` с текстом «Система не объявила ни одного раздела.» (новый ключ; английский — «The system declares no sections.» в `assets/i18n-en-NN.js`). `sysOpts` фильтрует `sysPageShown`. `const ui={…}` в `paint()` остаётся литералом.

- [ ] **Step 4: Посмотреть в браузере.** `?fixture=agents`, `?fixture=one-domain`, без набора: снимок рельса, ошибки консоли. Expected: на `agents` — четыре раздела с подписью «Агенты»; на `demo` и `one-domain` — как в `index.html`.

- [ ] **Step 5: Коммит.**

```bash
git add index_NN_mehanizm-bez-vms.html assets/i18n-en-NN.js tests/ui-bez-vms.js
git commit -m "Прототип NN: разделы и страницы «Опций» — по объявлению системы (capabilities.sections)"
git pull --rebase && git push   # в фоне
```

### Task 7: Запрос к w2c — раскладки и разделы от системы

**Files:**
- Create: `api/requests/<ГГГГ-ММ-ДД-ЧЧММССZ>-owner-tree-layouts-sections-request.md`
- Modify: `api/requests/README.md` (строка таблицы)

**Interfaces:**
- Consumes: задачи 2–6 (версии V2, V3, V5 в `origin/main`, ссылка на прототип на Pages).

- [ ] **Step 1: Написать запрос** по `api/requests/README.md` и скиллу `api-contract` («Запрос вместо правки», п. 1): шапка (дата, `owner`, коммит контракта V5 из `origin/main`, `Кому: w2c`, `Статус: новый`). Пункты: 1) что в V2, V3, V5 — форма `TreeLayout` и `AppSection` (ссылки на `api/README.md`); 2) как платформа объявляет раскладку из манифеста: `folders` — у механизма, своя — с префиксом системы, раскладки VMS (`servers`, `archives`, `detectors`) объявляет бэкенд VMS; 3) что снимет V15 и когда: `layouts` и `sections` станут обязательными; 4) вопрос — кто у w2c объявляет раскладки и разделы: платформа или подсистема; 5) вопрос — нужен ли разделу подсистемы свой экран-страница (`setupUi`), а не экран consolem (это части 05–06). Ссылка на прототип на Pages с `?fixture=agents`.

- [ ] **Step 2: Коммит.**

```bash
git add api/requests/
git commit -m "API: запрос владельца к w2c — раскладки дерева и разделы приложения от системы (контракт V2, V3, V5)"
git pull --rebase && git push
```

## Группа C. Область системы и пути домена

### Task 8: Область и папка — профили механизма `core.domain/1`, `core.folder/1`

**Files:**
- Create: `api/profiles/core.domain.json`, `api/profiles/core.folder.json`
- Modify: `api/profiles/vms.domain.json`, `vms.folder.json` (строка `changes`: «Устарел в V8: заменён core.…/1, снимается в V15»)
- Modify: `api/fixtures/demo.json`, `agents.json` (`implements` вида `domain` и `folder`; селекторы раскладок — `core.folder/1`)
- Modify: `api/openapi.json` (описания со словом «домен» в схемах и путях без `x-layer`; `info.version`)
- Modify: `api/server.js` (`isArea(kind)`, `isFolder(kind)` вместо `kinds.profileOf(…, "vms.domain/1")`, `"vms.folder/1"`), `api/profiles.js` (ключи `HOOKS` `"vms.domain/1"` → `"core.domain/1"`, `"vms.folder/1"` → `"core.folder/1"`)
- Modify: `tools/check_api.py` (`creates("core.domain/1")`), `tools/mechanism.py` (B5 — ещё `Profile`, `UnitBrief.domainId`, `Unit.domainId`)
- Modify: `tests/api-domains.js`, `api-access.js`, `api-read.js`, `api-cluster.js`, `api-pages.js`, `scale-large.js` (константа `AREA = "core.domain/1"` в `tests/harness.js` вместо `vms.domain/1`)
- Modify: `api/README.md` («Область системы» в «Договорённостях»; «Что добавлено в V8»), `api/BACKEND.md`

**Interfaces:**
- Consumes: часть 02 (формат файла профиля, сборка), задача 3 (`layoutKids(null)` — области по профилю).
- Produces: `core.domain/1`, `core.folder/1` (Interfaces «Область системы»); `tests/harness.js`: `AREA`, `FOLDER`.

Файлы: `id`, `version: "1.0"`, `label` «Область системы» и «Папка», `owner: "владелец контракта"`, `reviewers: ["w2c", "NGP"]`, `uses: []`, `properties: {}`, `changes: [{"version": "1.0", "what": "Профиль механизма вместо vms.domain/1 (vms.folder/1), контракт V8"}]`. Свойство домена `license` (устарело в 0.20.0) в `core.domain/1` не входит: оно остаётся в `vms.domain/1` и уходит вместе с ним в V15.

Смысл области — одна фраза, её повторяют `api/README.md`, `api/BACKEND.md` и `core.domain.json`: «Область системы (домен) — часть системы, у которой свои объекты, права и лицензии. У VMS это домен, у оркестратора агентов — рабочее пространство».

- [ ] **Step 1: Тест API.** `tests/api-domains.js`, `"Область системы V8: вид области объявляет core.domain/1; области — верх дерева в каждой раскладке"`, `needs: ["listKinds", "getTreeChildren"]`, `layer: "mechanism"`: виды с `core.domain/1` есть; во всех объявленных раскладках верх `/tree/children` — ровно объекты этих видов; на `agents` ни один вид не объявляет `vms.domain/1`.

- [ ] **Step 2: Запустить и увидеть отказ.** Run: `python3 tools/run_api_tests.py --only "Область системы V8"`. Expected: `FAIL` — `core.domain/1` никто не объявляет.

- [ ] **Step 3: Профили, наборы, стенд.** Виды `demo`: `domain` — `["core.domain/1", "vms.domain/1"]`, `folder` — `["core.folder/1", "vms.folder/1"]`; `agents` — только `core.*`. Ключи `HOOKS` переименованы, поэтому хук вызывается один раз, хотя вид объявляет оба профиля. Описания в `openapi.json`: «домен» → «область системы (домен)», без камер и серверов; `TreePath.chains` — «от корня (области)».

- [ ] **Step 4: Собрать и проверить.** Run: `python3 tools/build_api.py && python3 tools/check_mechanism.py && python3 tools/check_api.py && python3 tools/run_api_tests.py && python3 tools/run_api_tests.py --fixture one-domain && python3 tools/run_api_tests.py --fixture agents && python3 tools/check_ui.py && python3 tools/check_perf.py --quick`. Expected: всё `RESULT pass`; `index.html` работает: он узнаёт домен по `vms.domain/1`, профиль пока есть.

- [ ] **Step 5: Коммит.**

```bash
git add api/profiles/ api/fixtures/ api/fixture.js api/openapi.json api/openapi.js api/server.js api/profiles.js tools/ tests/ api/README.md api/BACKEND.md
git commit -m "API: область системы и папка — профили механизма core.domain/1 и core.folder/1, vms.domain/1 и vms.folder/1 устарели; контракт V8"
git pull --rebase && git push
```

### Task 9: Поиск в сети, сценарии, ретрансляторы — пути профилей

**Files:**
- Create: `api/profiles/vms.discovery.json`, `vms.scenarios.json`, `vms.relays.json`
- Modify: `api/openapi.json` (новые пути по таблице Interfaces с `x-layer: <профиль>`; старые `/domains/{domainId}/…` — новые `operationId`, `deprecated: true`; события `discovery.progress`, `discovery.finished` — описание: `domainId` — `uid` области; `info.version`)
- Modify: `api/fixtures/demo.json` (`implements` вида `domain` += три профиля), `tools/profile_fixture.py` (профиль снимается с вида, если у набора нет его операций: у `one-domain` нет `vms.discovery/1`)
- Modify: `api/server.js` (маршруты: новые пути зовут те же обработчики; объект не вида с профилем — `422 NOT_SUPPORTED`)
- Modify: `tests/api-domains.js`, `api-devices.js`, `api-cluster.js`, `api-read.js`, `api-assist.js` (тесты поиска, сценариев, ретрансляторов — на новых путях, `layer: "profile:vms.discovery/1"` и т. п.)
- Modify: `api/README.md` («Карта API», «Что добавлено в V9», «Устарело в V9», «Ломающие изменения в V9»: `getDiscovery` и другие имена теперь у новых путей, старые пути до V15 — под `getDomainDiscovery`…), `api/BACKEND.md`

**Interfaces:**
- Consumes: задача 8, часть 01 (`x-layer`), часть 03 (`layer`).
- Produces: пути, профили и `operationId` из таблицы Interfaces «Область системы и пути домена».

- [ ] **Step 1: Тесты на новых путях.** Тесты, которые сейчас зовут `/domains/{id}/discovery`, `/scenarios`, `/relays`, переписать на `/units/{uid}/…` (тот же `uid`) и слой профиля. Новые:
  - `"Пути профилей V9: объект без профиля — 422 NOT_SUPPORTED, объекта нет — 404"`, `needs: ["getScenarios", "implements:vms.scenarios/1"]`: `GET /units/<uid камеры>/scenarios` → 422; `GET /units/<случайный uuid>/scenarios` → 404;
  - `"Устаревшие пути домена V9: ответ как у нового пути"`, `needs: ["getDomainDiscovery", "getDiscovery"]`: тела ответов старого и нового пути равны для `discovery`, `scenarios`, `relays`.

- [ ] **Step 2: Запустить и увидеть отказ.** Run: `python3 tools/run_api_tests.py --only "Пути профилей V9"`. Expected: `FAIL` — путей нет (`404 NO_ROUTE`).

- [ ] **Step 3: Контракт, профили, стенд.** Файлы профилей: `owner: "mockup"`, `reviewers: ["w2c", "NGP"]`, `apis` по таблице, `properties: {}`. Стенд: новые маршруты — тонкая обёртка над прежними обработчиками; `limits.ipScanMax` и `limits.scenariosMax` пока читаются, как раньше (задача 11). `demo.capabilities.operations` — весь контракт вместе с устаревшими.

- [ ] **Step 4: Собрать и проверить.** Run: `python3 tools/profile_fixture.py && python3 tools/build_api.py && python3 tools/check_layers.py && python3 tools/check_api.py && python3 tools/run_api_tests.py && python3 tools/run_api_tests.py --fixture one-domain && python3 tools/run_api_tests.py --fixture agents && python3 tools/check_ui.py && python3 tools/check_perf.py --quick`. Expected: всё `RESULT pass`; `index.html` работает на старых путях.

- [ ] **Step 5: Коммит.**

```bash
git add api/ tools/ tests/
git commit -m "API: поиск в сети, сценарии между камерами и ретрансляторы — пути профилей /units/{uid}/…, пути /domains/… устарели; контракт V9"
git pull --rebase && git push
```

### Task 10: Прототип — новые пути и область по `core.domain/1`

**Files:**
- Modify: `index_NN_mehanizm-bez-vms.html`, `tests/ui-bez-vms.js`; тесты `tests/ui-*.js`, которые сами зовут `/domains/{id}/…` (`grep -n '/domains/' tests/ui-*.js`) — на новые пути

**Interfaces:**
- Consumes: задачи 8–9; часть 07 — `SCREEN_OF_PROFILE` (порядок ключей — приоритет), `PROFILES_KNOWN`, `kindToCreate(code, parentKind)`.
- Produces: в прототипе `SCREEN_OF_PROFILE` начинается с `"core.domain/1": "domain"`, `"core.folder/1": "folder"` (перед `vms.domain/1`), оба — в `PROFILES_KNOWN`; `DOMAIN_TAB_NEEDS = {cams: ["view:cam"], srvs: ["implements:vms.server/1"], lic: ["op:listLicenses"], topo: ["implements:vms.server/1"]}` — вкладка карточки области в `tabsForHand` видна, если условия верны (`view:cam` — есть вид с `x-ui-category.view` `cam`).

- [ ] **Step 1: Сценарий.** В `tests/ui-bez-vms.js`: `pick(domains[0].id)` → `tabsFor(find(domains[0].id).n).map(([id]) => id)` ⊆ `["flds", "gen"]`; на рельсе и в шапке карточки нет «Серверы», «Устройства», «Лицензии», «Топология».

- [ ] **Step 2: Запустить и увидеть отказ.** Run: `python3 tools/check_ui.py --page index_NN_mehanizm-bez-vms.html tests/ui-bez-vms.js`. Expected: `FAIL` по вкладкам карточки рабочего пространства.

- [ ] **Step 3: Прототип.** Восемь мест, где прототип зовёт `/domains/${…}/discovery`, `/scenarios`, `/relays`, — на `/units/${…}/…` (места: `python3 tools/outline.py index_NN_mehanizm-bez-vms.html discovery scenarios relays`). `can(…)` не меняются: `operationId` те же. Вкладки карточки области — по `DOMAIN_TAB_NEEDS`.

- [ ] **Step 4: Посмотреть в браузере** (`demo`: поиск в сети в мастере, «Между камерами», топология с ретранслятором; `agents`: карточка рабочего пространства) и коммит.

```bash
git add index_NN_mehanizm-bez-vms.html tests/
git commit -m "Прототип NN: пути профилей вместо /domains/…, область — по core.domain/1, вкладки области — по профилям"
git pull --rebase && git push   # в фоне
```

## Группа D. Справочники и каталог правил

### Task 11: Справочники VMS — в описания видов и пути профилей

**Files:**
- Modify: `api/openapi.json` (`ExportReference` — путь `GET /exports/reference`, `getExportReference`, тег `export`, `x-layer: video`; `ScenarioDoc.kinds`, `ScenarioDoc.maxItems`; `Discovery.ipScanMax`; `Reference.deviceModels`, `serviceTypes`, `supportLevels`, `recordModes`, `cloudProviders`, `serverLabels`, `scenarioKinds`, `analyticsConflicts`, `export`, `limits.ipScanMax`, `limits.defaultServerPort`, `limits.scenariosMax` — `deprecated: true` и вне `required`; «Расширения описаний»: `examples` в подмножестве схемы вида; `info.version`)
- Modify: `api/fixtures/demo.json` (схемы видов по таблице Interfaces «Справочники»; `stand.ipScanMax`, `stand.scenariosMax`)
- Modify: `api/server.js` (маршрут `/exports/reference`; `kinds` и `maxItems` в ответе сценариев; `ipScanMax` в ответе поиска; стенд читает пределы из `stand`), `api/profiles.js` (`ipScanMax` из `ctx.db.stand`; несовместимые детекторы — из `x-conflicts` вида)
- Modify: `tools/check_api.py` (`KIND_KEYWORDS` += `examples`)
- Modify: `tests/api-read.js`, `api-devices.js`, `api-export.js`
- Modify: `api/README.md` («Что добавлено в V11», «Устарело в V11»), `api/BACKEND.md`

**Interfaces:**
- Consumes: задачи 9 (пути сценариев и поиска).
- Produces: строки V11 таблицы Interfaces «Справочники»; `GET /exports/reference` → `ExportReference`.

- [ ] **Step 1: Тесты.** Новые, по одному на новый дом:
  - `"Справочники в видах V11: модели — examples у vendor и model, метки сервера — examples, порт сервера — default; те же значения, что в reference"` (`needs: ["listKinds", "implements:vms.camera/1", "implements:vms.server/1"]`, `layer: "mechanism"`): множество `vendor.examples` = множество `reference.deviceModels[].vendor`; для каждого производителя с моделями есть `allOf` с `then.properties.model.examples`, равным его `models`; `labels.items.examples` = `serverLabels`; `port.default` = `limits.defaultServerPort`;
  - `"Несовместимые детекторы V11: x-conflicts у analyticsKind — то же, что reference.analyticsConflicts"` (`needs: ["implements:vms.detector/1"]`, `layer: "profile:vms.detector/1"`);
  - `"Справочник выгрузки V11: GET /exports/reference — то же, что reference.export"` (`needs: ["getExportReference"]`, `layer: "video"`);
  - `"Сценарии и поиск V11: kinds и maxItems у документа сценариев, ipScanMax у поиска — те же, что в reference"` (`needs: ["getScenarios", "getDiscovery"]`).

  Сравнение «то же, что в reference» живёт до V15: задача 15 меняет его на проверку схемой.

- [ ] **Step 2: Запустить и увидеть отказ.** Run: `python3 tools/run_api_tests.py --only "V11"`. Expected: `FAIL` у всех четырёх.

- [ ] **Step 3: Контракт, данные, стенд.** По таблице Interfaces. `x-conflicts` — расширение профиля `vms.detector/1`: описание в `api/README.md`, «Расширения описаний», и строкой в `api/profiles/vms.detector.json` (`changes`: новая младшая версия профиля). Клиент, который не знает `x-conflicts`, его пропускает.

- [ ] **Step 4: Собрать и проверить.** Run: `python3 tools/profile_fixture.py && python3 tools/build_api.py && python3 tools/check_layers.py && python3 tools/check_api.py && python3 tools/run_api_tests.py && python3 tools/run_api_tests.py --fixture one-domain && python3 tools/run_api_tests.py --fixture agents && python3 tools/check_ui.py && python3 tools/check_perf.py --quick`. Expected: всё `RESULT pass`; `KNOWN_LEAKS` в `tools/layers.py` не меняется (поля ещё в `Reference`).

- [ ] **Step 5: Коммит.**

```bash
git add api/ tools/ tests/
git commit -m "API: справочники VMS — в схемы видов и ответы путей профилей, ключи reference устарели; контракт V11"
git pull --rebase && git push
```

### Task 12: Каталог правил без VMS

**Files:**
- Modify: `api/openapi.json` (схема `RuleActionField {id, optional?, options? (deprecated), schema?}` для `ruleActions[].fields[]`; `Reference.ruleChecks [{what, implements?}]`; `Reference.ruleTargets.areaLayouts`; описания `RuleCondition.kind`, `RuleCheck.what`, `RuleTarget.include[].area` — «код из каталога reference…»; `Reference.layouts`, `monitors` — `deprecated: true`, вне `required`; `info.version`)
- Modify: `api/fixtures/demo.json` (у полей `layoutId` и `monitorId` действий — `schema` с `enum` id и `x-enum-labels` имён; `ruleChecks`: `record`, `safe`, `armed` с `implements: ["vms.camera/1"]` и `online`; `areaLayouts: {"folder": "folders", "server": "servers"}`), `api/fixtures/agents.json` (`ruleChecks: [{"what": "online"}]`, `areaLayouts: {"folder": "folders"}`)
- Modify: `api/rule-engine.js` (ядро: условия `time`, `mode`, `online`, проверка `online`, действия `ntf.*`, `net.http`, `rule.runrule`; остальное — у хуков профилей; область цели — `layoutDescendants`), `api/profiles.js` (`vms.camera/1`: `ruleCondition`, `ruleCheck`; `RULE_ACTIONS` — действия `client.*`), `api/server.js` (контекст движка правил получает `layoutDescendants`)
- Modify: `tests/api-automation.js`, `tests/api-rules.js`
- Modify: `api/README.md` («Что добавлено в V12», «Устарело в V12»), `api/BACKEND.md` («Каталог правил»)

**Interfaces:**
- Consumes: задача 3 (`layoutDescendants`).
- Produces: `RuleActionField`, `Reference.ruleChecks`, `Reference.ruleTargets.areaLayouts`; хуки профиля `ruleCondition(kind: string, unit, cond, ctx) -> {code: string} | null | undefined` (`undefined` — условие не этого профиля), `ruleCheck(what: string, unit, check, ctx) -> boolean | undefined`; `Profiles.RULE_ACTIONS: Array<{source, action, fields, tpl?}>`.

Без `ruleChecks` система исполняет прежние четыре проверки (`record`, `safe`, `armed`, `online`) — так до V15; с V15 каталог обязателен.

- [ ] **Step 1: Тесты.** В `tests/api-automation.js`, `layer: "mechanism"`:
  - `"Каталог правил V12: проверка не из ruleChecks — 422 NOT_SUPPORTED control.notDeclared"` (`needs: ["createRule"]`): правило со шагом `check` и `what`, которого нет в `ruleChecks`, включённым → 422, `params.issue.code` — `control.notDeclared`;
  - `"Поле действия по schema V12: значение вне enum — action.fieldNotDeclared"` (`needs: ["createRule"]`, на `demo` — `client.layout` с `layoutId` не из `enum`);
  - `"Область цели по раскладке V12: {area: server} задевает те же объекты, что /tree/children servers под этим сервером"` (`needs: ["testRule", "layout:servers"]`): `POST /rules/test` с целью-областью сервера — список целей равен объектам ветки сервера в раскладке `servers`, у которых есть событие триггера;
  - `"Область папки у оркестратора V12: правило на папку задевает агентов папки"` (`needs: ["testRule", "kind:agent.agent", "layout:folders"]`).

- [ ] **Step 2: Запустить и увидеть отказ.** Run: `python3 tools/run_api_tests.py --only "V12" && python3 tools/run_api_tests.py --fixture agents --only "V12"`. Expected: `FAIL` — каталога `ruleChecks` и `schema` у полей нет.

- [ ] **Step 3: Контракт, движок, хуки.** Движок правил: `CONDITIONS`, `CHECKS`, `ACTIONS` ядра — только механизм; остальное он спрашивает у хуков профилей объекта цели (`ruleCondition`, `ruleCheck`) и у `Profiles.RULE_ACTIONS`. Поле действия: значение проверяется по `schema` (`enum`), а без `schema` — по `options`, как раньше. Область цели `{area, uid}`: раскладка — `ruleTargets.areaLayouts[area]`; есть — объекты `layoutDescendants(layout, uid, limits.selectMax)`; нет — область целиком.

- [ ] **Step 4: Собрать и проверить.** Run: `python3 tools/build_api.py && python3 tools/check_api.py && python3 tools/run_api_tests.py && python3 tools/run_api_tests.py --fixture one-domain && python3 tools/run_api_tests.py --fixture agents && python3 tools/check_ui.py && python3 tools/check_perf.py --quick`. Expected: всё `RESULT pass`; прежние тесты правил — без правок.

- [ ] **Step 5: Коммит.**

```bash
git add api/ tests/
git commit -m "API: каталог правил без VMS — поля действий по schema, ruleChecks, область цели по раскладке; reference.layouts и monitors устарели; контракт V12"
git pull --rebase && git push
```

### Task 13: Прототип — справочники и каталог из новых мест

**Files:**
- Modify: `index_NN_mehanizm-bez-vms.html`, `tests/ui-bez-vms.js`, `tests/ui-rules.js` (или сценарий правил, где проверяются раскладки и мониторы)

**Interfaces:**
- Consumes: задачи 11–12.
- Produces: `stripDeprecatedRef(ref) -> Reference` — копия справочника без ключей, устаревших в V11 и V12 (помощник сценария, в `tests/ui-harness.js`); `autoRef(ref, kinds)` читает каждый список из нового места.

| Список прототипа | Откуда после задачи |
|---|---|
| `DEVICE_MODELS` | `examples` и `allOf` вида `camera` |
| `refRecModes` | `enum` `recordMode` вида `camera` |
| `refLabels` | `examples` `labels.items` вида `server` |
| `detAkClashSet` | `x-conflicts` `analyticsKind` вида `det` |
| `refScenKinds` | `ScenarioDoc.kinds` при чтении документа сценариев |
| `EXP_REF` | `GET /exports/reference`, если `can("getExportReference")` |
| `RULE_LAYOUTS`, `RULE_MONS`, `REF_LAYOUT`, `REF_MONITOR` | `schema` полей `layoutId`, `monitorId` в `ruleActions` |
| области цели в редакторе правил | `ruleTargets.areas` и `areaLayouts` |

- [ ] **Step 1: Сценарий.** В `tests/ui-bez-vms.js` (на `agents`) и в `tests/ui-rules.js` (на `demo`), с защитой `typeof autoRef !== "function" || autoRef.length < 2`: `autoRef(stripDeprecatedRef(REF_LAST), KINDS)` → `Object.keys(DEVICE_MODELS).length`, `refRecModes`, `RULE_LAYOUTS` — те же, что после `autoRef(REF_LAST, KINDS)` (на `demo`); на `agents` списки VMS пусты, а редактор правил предлагает действия `net.http`, `rule.runrule`, `unitAction` и не предлагает «Открыть раскладку».

- [ ] **Step 2: Запустить и увидеть отказ.** Run: `python3 tools/check_ui.py --page index_NN_mehanizm-bez-vms.html tests/ui-bez-vms.js tests/ui-rules.js`. Expected: `FAIL` — без устаревших ключей списки пусты.

- [ ] **Step 3: Прототип** по таблице. Старые ключи `reference` прототип больше не читает.

- [ ] **Step 4: Посмотреть в браузере** (`demo`: мастер камеры — подсказки модели; правило «Открыть раскладку»; выгрузка; окно детектора с несовместимыми лицами) и коммит.

```bash
git add index_NN_mehanizm-bez-vms.html tests/
git commit -m "Прототип NN: справочники и каталог правил — из описаний видов и путей профилей"
git pull --rebase && git push   # в фоне
```

## Группа E. Перенос и снятие старого

### Task 14: Проверка прототипа и перенос в `index.html`

**Files:**
- Modify: `index.html`, `assets/i18n-en.js`, `CHANGES.md`, `protos.html`; удалить `index_NN_mehanizm-bez-vms.html`, `assets/i18n-en-NN.js`
- Modify: `api/FRONTEND.md` (раскладки, разделы, справочники — что повторить в своём интерфейсе), `api/ACCEPTANCE.md` (шаги на наборе `agents`), `api/TESTS.md` (`ui-bez-vms.js` в таблице сценариев)
- Modify (если перенос задел пункты): `docs/axxon-one-gaps.html`

**Interfaces:**
- Consumes: всё из задач 4, 6, 10, 13.

- [ ] **Step 1: Полная проверка прототипа** (`CLAUDE.md`, «Проверки прототипа»; правка трогала дерево и поток). Run: `python3 tools/check_ui.py --page index_NN_mehanizm-bez-vms.html`, затем `index_NN_mehanizm-bez-vms.html?selftest` в браузере, затем `python3 tools/check_perf.py --page index_NN_mehanizm-bez-vms.html`. Expected: `RESULT pass`; самопроверка — все сценарии, включая `ui-bez-vms.js` на `agents`; `check_perf` — без новых сбоев против `index.html`.

- [ ] **Step 2: Перенос** по скиллу `proto-promote`: `git diff <коммит копии> HEAD -- index_NN_mehanizm-bez-vms.html`, перенос поверх текущего `index.html`; английские ключи — из `assets/i18n-en-NN.js` в `assets/i18n-en.js`.

- [ ] **Step 3: Проверки `index.html`.** Run: `python3 tools/check_api.py && python3 tools/check_ui.py && python3 tools/run_api_tests.py && python3 tools/check_perf.py --quick && python3 tools/check_scale.py`. Expected: всё `RESULT pass`; `tests/ui-bez-vms.js` на `index.html` идёт настоящими проверками, а не «проверять нечего».

- [ ] **Step 4: Коммиты.** `Макет: из прототипа NN — раскладки и разделы от системы, пути профилей вместо путей домена, справочники из видов` и запись в `CHANGES.md`; `protos.html` — «принят»; отчёт о пробелах — по шагу 5 скилла `proto-promote` (строк в `PROTO` у прототипа нет: найти задетые пункты `grep`-ом по «раскладк», «срез», «раздел», «справочник»); `Прототип NN: удалён — перенесён в index.html` (`git rm`). После каждого — `git pull --rebase && git push`.

### Task 15: Ломающие изменения V15 — снять устаревшее, граница проверкой

**Files:**
- Modify: `api/openapi.json` (снять устаревшее; `KindsList.layouts`, `Capabilities.sections` — в `required`; `enum` снять у `RuleCondition.kind`, `RuleCheck.what`, `RuleTarget.include[].area`, `Reference.ruleTargets.areas[]`; `Reference.ruleChecks` — в `required`; `info.version`)
- Delete: `api/profiles/vms.domain.json`, `api/profiles/vms.folder.json`
- Modify: `api/fixtures/demo.json`, `agents.json` (без снятых ключей и профилей), `tools/profile_fixture.py`
- Modify: `api/server.js` (снять маршруты `/domains/…`, `isArea` и `isFolder` — только `core.*`), `api/rule-engine.js` (без запасного списка проверок)
- Modify: `tools/mechanism.py` (правила B1–B4), `tools/check_mechanism.py`, `tools/layers.py` (`KNOWN_LEAKS` — без снятых полей), `tools/check_api.py`
- Modify: `tests/` (тесты устаревших путей и сравнения «то же, что в reference» из задач 9 и 11 — снять или заменить проверкой схемой)
- Modify: `index.html` — только если он ещё читает снятое (ожидается: нет)
- Modify: `api/README.md` («Ломающие изменения в V15»), `api/BACKEND.md`, `api/FRONTEND.md`, `api/TESTS.md`; `docs/contract-layers/2026-11-16-kontrakt-i-podsistemy-predlozhenie.md` (под таблицей «Что в механизме сейчас от VMS» — строка «Вынесено в V2–V15, план 04»)
- Create: `api/requests/<ГГГГ-ММ-ДД-ЧЧММССZ>-owner-mechanism-without-vms-request.md`; Modify: `api/requests/README.md`

**Interfaces:**
- Consumes: задачи 2–14.
- Produces: правила `border_problems(spec)` B1–B4; контракт V15 без частей VMS в механизме.

Правила границы (каждое — строка отказа):
- **B1** нет путей, которые начинаются с `/domains/`;
- **B2** нет `enum` у параметра `layout`, у `RuleCondition.kind`, `RuleCheck.what`, `RuleTarget.include[].area`, `Reference.ruleTargets.areas.items`;
- **B3** свойства `Reference` — только `ruleActions`, `ruleConditions`, `ruleChecks`, `ruleControls`, `ruleFeatures`, `ruleStarts`, `ruleTargets`, `ruleCrossDomainActions`, `access`, `limits`, `capabilities`;
- **B4** свойства `Reference.limits` — только `pageMax`, `idsMax`, `selectMax`, `watchMax`, `scanPartsMax`, `fileMaxBytes`, `filesPerTurnMax`, `fileTypes`.

- [ ] **Step 1: Самопроверка.** В `tools/check_mechanism.py`: живой контракт до правки — `FAIL` по B1–B4 (перечень того, что снимается); копия с путём `/domains/x` — B1; с `enum` у `RuleCheck.what` — B2; с `Reference.recordModes` — B3; с `limits.ipScanMax` — B4.

- [ ] **Step 2: Запустить и увидеть отказ.** Run: `python3 tools/check_mechanism.py`. Expected: случаи с копиями — `PASS`, «живой контракт: граница цела» — `FAIL` с перечнем из таблицы Interfaces «Справочники» и путей домена.

- [ ] **Step 3: Снять устаревшее** — всё, что помечено `deprecated` в задачах 9, 11, 12, профили `vms.domain/1` и `vms.folder/1`, `RuleActionField.options`. Обязательность `layouts`, `sections`, `ruleChecks`. `KNOWN_LEAKS` — без строк снятых полей (часть 01, S4 сама называет лишние).

- [ ] **Step 4: Собрать и проверить.** Run: `python3 tools/profile_fixture.py && python3 tools/build_api.py && python3 tools/check_mechanism.py && python3 tools/check_layers.py && python3 tools/check_api.py && python3 tools/run_api_tests.py && python3 tools/run_api_tests.py --fixture one-domain && python3 tools/run_api_tests.py --fixture agents && python3 tools/check_ui.py && python3 tools/check_perf.py --quick && python3 tools/check_scale.py`. Expected: всё `RESULT pass`; `check_api` «Ломающие изменения против контракта старого макета» и проверка раздела V15 (`check_breaking_doc`) — `PASS`.

- [ ] **Step 5: Документы.** `api/README.md`, «Ломающие изменения в V15»: таблица «что снято → чем заменено → что сделать клиенту и бэкенду» по Interfaces «Справочники» и «Область системы и пути домена», плюс обязательные `layouts`, `sections`, `ruleChecks` и открытые строки вместо `enum`. Для w2c на 0.2.0 — абзац «переход с 0.2.0 сразу на V15: механизм без VMS» со ссылкой на таблицу версий по слоям (часть 01).

- [ ] **Step 6: Коммит контракта.**

```bash
git add api/ tools/ tests/ index.html docs/contract-layers/2026-11-16-kontrakt-i-podsistemy-predlozhenie.md
git commit -m "API: механизм без VMS — сняты пути /domains/…, справочники VMS в reference, vms.domain/1 и vms.folder/1; layouts и sections обязательны; граница проверкой; контракт V15"
git pull --rebase && git push
```

- [ ] **Step 7: Запрос к w2c.** Шапка по `api/requests/README.md` (коммит V15 из `origin/main`, `Кому: w2c`, `Статус: новый`). Пункты: 1) механизм V15 — что в нём нет VMS (ссылка на «Ломающие изменения в V15»); 2) что объявляет платформа (области, папки, `folders`, разделы механизма) и что — бэкенд VMS (профили `vms.*`, раскладки `servers`, `archives`, `detectors`, раздел `vms.export`, справочники в видах); 3) набор `agents` как образец системы без VMS и тесты на нём (`run_api_tests.py --fixture agents`); 4) ответ на запрос задачи 7, если он пришёл, — как его учли. Коммит `API: запрос владельца к w2c — механизм без VMS (контракт V15)`, `git pull --rebase && git push`.

---

## Открытые вопросы владельцу

1. **Префикс профилей механизма.** План называет их `core.domain/1` и `core.folder/1`. Другие варианты — `consolem.*` или без профиля, по полю вида (`UnitKind.role: "area"`). От имени зависят тексты задач 8 и 15 и запрос к w2c.
2. **Сценарии между камерами — путь профиля или документ.** План переносит их в путь `/units/{uid}/scenarios` (дёшево, поведение то же). Это настройка, поэтому правильнее документ области (`shape: document`, вид `scenarios`): права, журнал и откат — общие. Документ — ещё 0,5–1 день и правка экрана «Между камерами».
3. **`Feature` с кодами VMS.** В `Feature` механизма лежат `serverRoles`, `serverNetwork`, `archiveEncryption`, `streamGrants`, `export*`. План их не трогает. Сделать `Feature` открытой строкой, а коды VMS перенести в файлы профилей (поля для этого в формате части 02 нет)?
4. **«Обучение» на системе без VMS.** План прячет раздел, если нет вида с `vms.camera/1`. Другой вариант — главы со своим `needs`, и раздел виден, если доступна хоть одна глава.

## Что не входит

- API видео (п. 11): выгрузка (`vms.export`, `GET /exports/reference`), живое видео, архив. Здесь справочник выгрузки только уходит из `Reference` в путь выгрузки.
- Права «по месту» и раскладка «по местам» с плагином «Места» ([«Всё — плагин»](../2026-11-18-everything-is-a-plugin.md)). Механизм раскладок их позволяет (`by: ref`), сам плагин — работа продукта.
- Права `Reference.access` с кодами VMS (`DEVICES_SETUP`, `LAYOUTS_TAB`…): это уже данные системы, их форма — механизм.
- Ручные экраны по профилю, кроме вкладок карточки области, — часть 07.
- Раздел подсистемы своей страницей (`setupUi` в рельсе) — части 05–06, по ответу w2c на п. 5 запроса задачи 7.
- Стенд по-прежнему узнаёт область по коду вида `domain` (старые таблицы `api/server.js`). Переделка стенда на склад без старых таблиц — вне частей 01–07.
