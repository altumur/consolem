# Часть 01. Процесс и слои — план работ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** граница «механизм или подсистема» записана в правилах, видна в самом контракте (`x-layer`) и закреплена проверкой в `tools/check_api.py`; версии 0.3.0 — текущая и открытые запросы разложены по слоям.

**Architecture:** слой пишется в `api/openapi.json` расширением `x-layer` у схем, путей и полей подсистем. Модуль `tools/layers.py` проверяет пометки (статически) и называет слои правки против `origin/main` (по git), `tools/check_api.py` вызывает обе проверки, `tools/check_layers.py` проверяет сам модуль, как `tools/check_outline.py` проверяет карту кода. Таблица версий по слоям лежит в `docs/contract-layers/versions-by-layer.md`, `check_api` следит, чтобы в ней была каждая версия. Правила (`CLAUDE.md`, скиллы) пишутся последними: они ссылаются на инструмент и таблицу, которые к этому моменту уже лежат в `main`. Так другие сессии не прочтут правило, которое ссылается на несуществующий файл.

**Tech Stack:** Python 3 (стандартная библиотека, `subprocess` к `git`), JSON, Markdown. Узел и браузер нужны только общим проверкам `api/TESTS.md`.

**Spec:** [`docs/contract-layers/2026-11-16-kontrakt-i-podsistemy-predlozhenie.md`](../2026-11-16-kontrakt-i-podsistemy-predlozhenie.md): п. 4 «Что предлагаем», «Что проверяет `tools/check_api.py`», пп. 1 и 3 таблицы «Что придётся переработать». Ответ владельца w2c — [`api/requests/2026-11-18-114831Z-w2c-contract-layers-response.md`](../../../api/requests/2026-11-18-114831Z-w2c-contract-layers-response.md), вопросы 1, 4, 7.

> **Сверка с общим планом** ([00-master.md](00-master.md), раздел «Сверка частей» — главнее текста ниже):
>
> - С1 — соответствие `x-layer` и слоя теста части 03;
> - С7 — `DEFAULT_REVIEWERS=["w2c"]` до ответа владельца на О1;
> - С8 — порядок задач этой части (правила процесса после `tools/layers.py`).

## Global Constraints

- Исполнитель — владелец контракта (`git config user.name` — `joynickray`): правку механизма и ломающую правку ему делать можно. Чужие запросы: только строка статуса и только у запросов, которые ведёт владелец (скилл `vms-requests`); текст чужого запроса не правят.
- Версия контракта: «следующая младшая после `origin/main`». Ниже она обозначена `V`, исполнитель подставляет число. Часть 01 меняет `api/openapi.json` один раз, в задаче 1. Задачи 2–5 версию не поднимают.
- Значения `x-layer`: id профиля из набора (`vms.pos/1`…), `video` (просмотр, архив, выгрузка — будущий API видео, п. 11) или `vms` (часть VMS без своего профиля; где ей жить, решает часть 04). Других значений нет.
- Формат файла профиля задаёт часть 02: `api/profiles/<имя без /N>.json`, поля `owner`, `reviewers`, `version`, `changes`. Часть 01 файлов профилей не создаёт, а только читает их, если они есть.
- Проверки: правка `api/` — `python3 tools/check_api.py`, `python3 tools/run_api_tests.py`, `python3 tools/check_ui.py`, `python3 tools/check_perf.py --quick`. Правка `tools/` — `python3 tools/check_api.py` и `python3 tools/check_layers.py` (после задачи 1).
- Коммиты — на русском, в стиле `CLAUDE.md`; после каждой задачи `git pull --rebase && git push`. Если `V` занял другой — следующая, по скиллу `api-contract` («Две правки одновременно», п. 1).
- Документы — простым языком, как остальные `docs/contract-layers/`: полные предложения, без пассива. Интерфейс (`index.html`) часть 01 не трогает.

## Review Focus

1. **Нет git или нет `origin/main`** (архив, мелкий клон, `--api` с копией папки): проверки слоёв правки и версий по git пропускаются строкой `INFO`, а `check_api` не падает. Тест — задача 3, `case_no_git`.
2. **`origin/main` ушёл вперёд** (кто-то запушил, а `git pull` ещё не было): правка чужого коммита не должна выглядеть своей. Слои считаются от общего предка `git merge-base HEAD <base>`. Тест — задача 3, `case_merge_base`.
3. **Новый файл ещё не добавлен в git** (`api/profiles/vms.test.json`, не прошедший `git add`): классификатор его видит. Тест — задача 3, `case_untracked`.
4. **В `openapi.json` поправили только описание** (опечатку в `description`): это не правка механизма без версии, а строка `INFO`. Тест — задача 3, `case_description_only`.
5. **Версию подняли, а строки в таблице версий и раздела в `api/README.md` ещё нет:** `check_api` называет версию, которой не хватает. Тест — задача 2, `case_current_version_missing`.

---

## Задача 1. `x-layer` в контракте и проверка границы

**Files:**
- Create: `tools/layers.py` — модуль слоёв (статическая часть).
- Create: `tools/check_layers.py` — проверка модуля, по образцу `tools/check_outline.py` (`ok(cond, what)`, счётчик сбоев, код выхода 1).
- Modify: `tools/check_api.py` — новая функция `check_layers(rep, spec)`, вызов в `main()` после `check_core_field`; строка о проверке в docstring (п. 9).
- Modify: `api/openapi.json` — пометки `x-layer`, `info.version` = `V`.
- Modify: `api/README.md` — пункт «Слои контракта» в «Договорённостях» (после «Возможности системы»); раздел «## Что добавлено в V» перед «## Что добавлено в 0.23.0» (там лежат новые версии).
- Modify: `api/BACKEND.md` — строка в таблице «Что реализовать»: «Слои контракта: что механизм, что профиль» → «`x-layer` в `openapi.json`; README, «Слои контракта»».
- Modify: `api/TESTS.md` — строка в таблице раздела 4 и строка в «Коротко» (`python3 tools/check_layers.py` — после правки `tools/layers.py`).
- Generated: `api/openapi.js` (`python3 tools/build_api.py`).

**Interfaces:**
- Consumes: `api/openapi.json`, `api/fixtures/demo.json` (`profiles[].id`), `api/profiles/*.json`, если они есть (`id`, `owner`, `reviewers`).
- Produces (`tools/layers.py`):
  - `LAYER_EXTRA = ("video", "vms")`; `DEFAULT_OWNER = "mockup"`; `DEFAULT_REVIEWERS = ["w2c"]`.
  - `profile_ids(api_dir: str = "api") -> set[str]` — `id` из `demo.json` `profiles` и из `api/profiles/*.json`.
  - `profile_file(pid: str, api_dir: str = "api") -> str` — `"vms.camera/1"` → `"<api_dir>/profiles/vms.camera.json"`.
  - `owner_of(pid, api_dir="api") -> str` и `reviewers_of(pid, api_dir="api") -> list[str]` — поле файла профиля; файла нет — `DEFAULT_OWNER` и `DEFAULT_REVIEWERS`.
  - `layer_of_schema(spec: dict, name: str) -> str | None`, `layer_of_path(spec: dict, path: str) -> str | None`. `None` — механизм.
  - `leak_marks(spec: dict) -> dict[str, str]` — пометки внутри непомеченных схем, ключ — путь поля в записи `check_api.schema_removed`: `Схема.поле.подполе`, `[]` — элемент массива, `{}` — `additionalProperties`, `|N` — вариант `anyOf`/`oneOf`/`allOf`.
  - `KNOWN_LEAKS: dict[str, str]` — путь поля → кто его выносит (`"часть 04"` или `"API видео"`). Список только сокращается, как `PENDING` в `check_api.py`.
  - `EXAMPLE_MENTIONS: dict[str, str]` — путь поля → почему id профиля в его описании — пример, а не поле подсистемы.
  - `static_problems(spec: dict, ids: set[str]) -> list[str]` — пустой список, если граница цела.
- Produces (`tools/check_api.py`): проверка `"Граница слоёв: поля подсистем в общих схемах"`.

Правила `static_problems` (каждое — своя строка отказа):

- **S1. Где стоит `x-layer`.** Только у схемы `components.schemas.<Имя>` целиком, у пути `paths.<путь>` целиком или у узла схемы внутри непомеченной схемы (через `properties`, `items`, `additionalProperties`, `anyOf`, `oneOf`, `allOf`). Внутри помеченной схемы или пути, в операции, параметре, ответе: `<где>: x-layer только у схемы, пути или поля общей схемы`.
- **S2. Значение** — из `ids | set(LAYER_EXTRA)`, иначе: `<где>: x-layer <значение> — нет такого профиля`.
- **S3. Механизм не ссылается на подсистему.** Обход непомеченной схемы или непомеченного пути: `$ref` на помеченную схему — отказ `<где> ссылается на схему подсистемы <Имя> (x-layer <L>): вынеси поле в схему вида или пометь его x-layer`. Узел с `x-layer` обход пропускает. Помеченная схема может ссылаться на что угодно (зависимости профилей проверяет часть 02, поле `uses`).
- **S4. Пометки полей = `KNOWN_LEAKS`.** Новая пометка: `<путь>: новое поле подсистемы в общей схеме — его нет в KNOWN_LEAKS`. Пропавшая: `<путь>: в KNOWN_LEAKS, а пометки нет — убери из KNOWN_LEAKS`.
- **S5. Id профиля в описании поля общей схемы.** Описание узла непомеченной схемы содержит `vms.<имя>/<N>`, а узел не помечен и его нет в `EXAMPLE_MENTIONS`: `<путь>: в описании <id> — пометь поле x-layer или внеси в EXAMPLE_MENTIONS`. Пропавший пункт `EXAMPLE_MENTIONS` — тоже отказ.

Начальная разметка (шаг 6). Решения ниже; что `S3` и `S5` найдут сверх них, исполнитель размечает по правилу «поле служит одному профилю — его id; нескольким профилям VMS — `vms`; просмотр, архив, выгрузка — `video`» и перечисляет в сообщении коммита.

| Что | `x-layer` |
|---|---|
| пути из `apis` профилей: `/units/{uid}/live` | `vms.live/1` |
| `/units/{uid}/talk` | `vms.talk/1` |
| `/units/{uid}/ptz`, `/units/{uid}/presets/{n}` | `vms.ptz/1` |
| `/units/{uid}/timeline`, `playback`, `holds`, `bookmarks`, `archive-fetch`; `/holds/{holdId}`, `/holds/{holdId}/verify` | `vms.timeline/1` |
| `/units/{uid}/recording-target`, `/units/{uid}/recording-days` | `vms.camera/1` |
| `/units/{uid}/pos/raw` | `vms.pos/1` |
| `/exports…` (6 путей), `/me/export`, `/archive-scans…`, `/archive-watches…` | `video` |
| `/stream-accounts…` (3 пути), `/domains/{domainId}/discovery`, `/scenarios`, `/scenarios/status`, `/relays`, `/relays/{name}` | `vms` |
| схема, на которую ссылаются только пути и схемы одного слоя | слой этих путей |
| `WebServerSettings`, `WebCertificate`, `WebReservedPorts` | `vms.webserver/1` |
| `EdgeReplicationStatus`, `EdgeReplicationGap` | `vms.edge/1` |
| `DetectorZone` | `vms.detector/1` |
| поля `Reference`: `deviceModels`, `supportLevels`, `serviceTypes`, `scenarioKinds`, `layouts`, `monitors` | `vms` |
| `Reference.recordModes` | `vms.camera/1` |
| `Reference.cloudProviders` | `vms.archive/1` |
| `Reference.serverLabels`, `Reference.limits.defaultServerPort` | `vms.server/1` |
| `Reference.limits.ipScanMax` | `vms` |
| `Reference.analyticsConflicts` | `vms.detector/1` |
| `Reference.export` | `video` |
| `UnitStatus.observed.replicaLagSec` | `vms.camera/1` |
| `UnitStatus.observed.replicationStatus` | `vms.edge/1` |
| `UnitStatus.observed.webCertificate`, `UnitStatus.observed.webReservedPorts` | `vms.webserver/1` |
| `UnitKind.x-archive` | `vms.archive/1` |
| `RuleTrigger.match.detector`, `AssistFoundFilter.noDetector` | `vms.detector/1` |
| `AssistFoundFilter.noRecord` | `vms.camera/1` |
| `UnitMoveRequest.params` | `vms.server/1` |
| `TestEventRequest.type`, `TestEventRequest.eventId` | `vms` |
| в `EXAMPLE_MENTIONS`: `Profile.id`, `UnitKind.implements`, `UnitKind.apiRights` | — (пример в описании механизма) |

Механизм, без пометки: `Reference.access`, `capabilities`, `limits.pageMax` и прочие пределы страниц, `ruleActions`, `ruleConditions`, `ruleControls`, `ruleFeatures`, `ruleStarts`, `ruleTargets`, `ruleCrossDomainActions`. У них общая схема, а значения VMS — данные набора (у условий уже есть `implements`). Параметр `layout` у `GET /tree/children` и разделы приложения в `index.html` не помечаются: это перечень значений, а не поле. Их выносит часть 04.

- [ ] **Step 1: Написать проверку модуля** `tools/check_layers.py`. Каждый случай — копия живого контракта (`copy.deepcopy`) с одной правкой и вызов `layers.static_problems(spec, ids)`. Помощник `base()` перед правкой ставит в копии `x-layer: "vms.pos/1"` у `PosRawLine` и `PosRawLines` и путь `/units/{uid}/pos/raw`, если их там ещё нет: до шага 6 пометок в контракте нет, а случаям нужна схема подсистемы. Сам случай «живой контракт» идёт без `base()`:

```python
# живой контракт
ok(static_problems(spec, ids) == [], "живой контракт: граница цела")
# S2: незнакомый слой
s["components"]["schemas"]["PosRawLine"]["x-layer"] = "vms.nope/1"
ok(any("vms.nope/1" in p and "PosRawLine" in p for p in static_problems(s, ids)), "S2: незнакомый слой")
# S1: пометка в операции
s["paths"]["/units"]["get"]["x-layer"] = "vms"
ok(any("/units" in p and "x-layer только" in p for p in static_problems(s, ids)), "S1: x-layer в операции")
# S1: пометка внутри помеченной схемы
s["components"]["schemas"]["PosRawLines"]["properties"]["items"]["x-layer"] = "vms.pos/1"
ok(any("PosRawLines" in p and "x-layer только" in p for p in static_problems(s, ids)), "S1: вложенная пометка")
# S3: общая схема ссылается на схему подсистемы
s["components"]["schemas"]["Unit"]["properties"]["posRaw"] = {"$ref": "#/components/schemas/PosRawLines"}
ok(any("Unit.posRaw" in p and "PosRawLines" in p for p in static_problems(s, ids)), "S3: ссылка механизма на подсистему")
# S4: то же поле с пометкой, но без KNOWN_LEAKS
s["components"]["schemas"]["Unit"]["properties"]["posRaw"]["x-layer"] = "vms.pos/1"
ok(any("Unit.posRaw" in p and "KNOWN_LEAKS" in p for p in static_problems(s, ids)), "S4: новое поле подсистемы")
# S4: пометку сняли, а KNOWN_LEAKS помнит
first = sorted(KNOWN_LEAKS)[0]   # снять пометку по пути first
ok(any(first in p and "убери из KNOWN_LEAKS" in p for p in static_problems(s, ids)), "S4: устаревшая строка KNOWN_LEAKS")
# S5: id профиля в описании общего поля
s["components"]["schemas"]["Unit"]["properties"]["foo"] = {"type": "string", "description": "Поле vms.camera/1"}
ok(any("Unit.foo" in p and "vms.camera/1" in p for p in static_problems(s, ids)), "S5: профиль в описании")
# законно: помеченная схема ссылается на общую
s["components"]["schemas"]["PosRawLines"]["properties"]["unit"] = {"$ref": "#/components/schemas/Unit"}
ok(static_problems(s, ids) == static_problems(base(), ids), "помеченная схема ссылается на механизм — можно")
```

- [ ] **Step 2: Запустить и увидеть отказ.** Run: `python3 tools/check_layers.py`. Expected: падает на `import layers` (`ModuleNotFoundError`).

- [ ] **Step 3: Написать `tools/layers.py`** — функции из Interfaces, `KNOWN_LEAKS = {}`, `EXAMPLE_MENTIONS = {}` пока пусты. Обход схем — один рекурсивный обходчик с путём поля, его используют S1, S3, S4, S5.

- [ ] **Step 4: Запустить проверку модуля.** Run: `python3 tools/check_layers.py`. Expected: случаи S1–S5 и «помеченная схема…» — `PASS`; «живой контракт: граница цела» — `FAIL` (S5 находит около 20 полей без пометки). Случай «устаревшая строка KNOWN_LEAKS» до шага 6 пропускается строкой `SKIP`, пока `KNOWN_LEAKS` пуст.

- [ ] **Step 5: Подключить к `check_api.py`** — `check_layers(rep, spec)`: `rep.check("Граница слоёв: поля подсистем в общих схемах", layers.static_problems(spec, layers.profile_ids(API)), f"{len(schemas)} схем, {len(paths)} путей подсистем, {len(leaks)} полей подсистем в общих схемах")`. Run: `python3 tools/check_api.py`. Expected: `FAIL  Граница слоёв…` с полями из S5, остальное `PASS`.

- [ ] **Step 6: Разметить контракт** по таблице выше, заполнить `KNOWN_LEAKS` (каждой пометке поля — `"часть 04"`, полям со слоем `video` — `"API видео"`) и `EXAMPLE_MENTIONS`, поднять `info.version` до `V`.

- [ ] **Step 7: Записать договорённость.** В `api/README.md`, «Договорённости», пункт **«Слои контракта.»**: механизм — всё без `x-layer`, его делает каждый бэкенд; схема или путь с `x-layer: <профиль>` нужны бэкенду, который объявил профиль; `video` — будущий API видео; `vms` — часть VMS без профиля, её выносит переделка по слоям; клиент пропускает `x-layer`, как любой `x-*`. Раздел «## Что добавлено в V»: решение владельца по запросу w2c (`requests/2026-11-18-114831Z-w2c-contract-layers-response.md`, вопрос 1); что помечено (числа схем, путей и полей); ничего не снято, клиент пропускает ключ. Строка в `api/BACKEND.md` и `api/TESTS.md` (Files).

- [ ] **Step 8: Собрать и проверить.** Run: `python3 tools/build_api.py && python3 tools/check_layers.py && python3 tools/check_api.py && python3 tools/run_api_tests.py && python3 tools/check_ui.py && python3 tools/check_perf.py --quick`. Expected: `check_layers` без `FAIL`; `check_api` — `RESULT pass`; тесты API и сценарии — без новых сбоев; `check_perf` — как до правки (сбой — по `api/TESTS.md`, раздел 9).

- [ ] **Step 9: Коммит.**

```bash
git add tools/layers.py tools/check_layers.py tools/check_api.py api/openapi.json api/openapi.js api/README.md api/BACKEND.md api/TESTS.md
git commit -m "API: слои контракта — x-layer у схем, путей и полей подсистем, проверка границы в check_api; контракт V"
git pull --rebase && git push
```

## Задача 2. Версии 0.3.0 — `V` по слоям

**Files:**
- Create: `docs/contract-layers/versions-by-layer.md`.
- Modify: `tools/layers.py` — `versions_table_problems`; `tools/check_layers.py` — случаи; `tools/check_api.py` — `check_versions_by_layer(rep, spec)`, вызов в `main()` после `check_layers`.
- Modify: `api/README.md` — в пункт «Слои контракта» (задача 1) фраза: какой слой у каждой версии с 0.3.0 — `docs/contract-layers/versions-by-layer.md`, новая версия добавляет туда строку.
- Modify: `docs/contract-layers/README.md` — ссылка на таблицу в разделе «Что лежит в других местах и почему» или новым разделом «Разметка»; `docs/contract-layers/2026-11-16-kontrakt-i-podsistemy-predlozhenie.md` — одна строка под таблицей «Версия | Что | Слой»: полная разметка с 0.3.0 по текущую — в `versions-by-layer.md`.

**Interfaces:**
- Consumes: `layers.profile_ids`, `layers.LAYER_EXTRA` (задача 1).
- Produces: `versions_table_problems(readme: str, table_md: str, current: str, ids: set[str]) -> list[str]`. Версии README — все `X.Y.Z` из заголовков `## Что добавлено в X.Y.Z` и `## Ломающие изменения в X.Y.Z`, плюс `current`. Проверка `"Версии контракта по слоям"` в `check_api`.
- Produces (формат таблицы, на него опираются части 02–06): строка `| X.Y.Z | что | слой | схемы и пути openapi.json |`. Столбец «Слой» — токены через `; `: `механизм` или значение `x-layer` в обратных кавычках (`` `vms.pos/1` ``, `` `video` ``, `` `vms` ``). Пояснения — только в столбце «Что».

Смысл слоя версии: **кому из бэкендов её делать.** Механизм делает каждый бэкенд, профиль — тот, кто его объявил. Так w2c переходит с 0.2.0 сразу на механизм: делает строки «механизм» и строки профилей, которые объявит. Разметка (исполнитель сверяет каждую строку с `git show --stat` коммита версии; коммиты — `git log -G'"version": "0\.[0-9]+\.0"' -- api/openapi.json`):

| Версия | Слой | Основание (схемы и пути) |
|---|---|---|
| 0.3.0 | механизм; `vms` | `Rule*`, `RuleAbort`, `RuleAfter`, `RuleCheck`, `Reference.ruleFeatures`, `ruleControls`; события и команды видов камеры, реле, сервера, тома — данные набора |
| 0.4.0 | механизм | `ObjectMode`, `Modes*`, `ModeCurrent*`, `RuleCondition`, `RuleStatus` |
| 0.5.0 | `vms.pos/1` | `PosRawLine`, `PosRawLines`, `/units/{uid}/pos/raw` |
| 0.6.0 | `vms.edge/1`; `vms.timeline/1` | `EdgeReplication*`, `UnitStatus`, `StreamMessage`, `ArchiveFetch*` (`edgeOnly`) |
| 0.7.0 | `vms.camera/1` | данные вида (`preRecordSec`) |
| 0.8.0 | механизм | `Journal*`, `/journal/facets`, `/journal/kinds`, `Feature` |
| 0.9.0 | механизм | `/journal/export`, `Feature.journalAudit`, `JournalEvent` |
| 0.10.0 | `vms.camera/1` | команды вида `defaults`, `readConfig` |
| 0.11.0 | `vms.webserver/1`; механизм | `WebServerSettings`, `WebCertificate`, `WebReservedPorts`, `UnitStatus`, коды `PORT_TAKEN`, `CERTIFICATE_*`, `KEY_MISMATCH`; механизм — `ActionDescriptor.direct` |
| 0.12.0 | `vms.detector/1`; `vms.subdetector/1` | данные видов `det`, `subdet` |
| 0.13.0 | `vms.detector/1` | данные вида `det` |
| 0.14.0 | механизм | `JournalEvent.actor` обязательно (ломающее) |
| 0.15.0 | `vms.detector/1`; `vms.subdetector/1` | данные видов `det`, `subdet` |
| 0.16.0 | механизм | `SetupUiLink`, `/units/{uid}/setup-ui`, `UnitKind`, `Unit`, `UnitCondition`, `JsonSchema`, `Text`, `/kinds` (и ломающее) |
| 0.17.0 | `vms.camera/1`; `vms.detector/1` | данные видов; `EventDescriptor` — описание |
| 0.18.0 | `vms.detector/1` | `params.detector` событий камеры; движок правил знает `vms.detector/1` — в «Что»: выносит часть 04 |
| 0.19.0 | механизм | `FileUpload`, `/files`, `AssistTurnRequest.fileIds`, `Reference.limits` |
| 0.20.0 | механизм | `LicenseKey*`, `/licenses/keys…`, `License` (и ломающее) |
| 0.21.0 | `vms.detector/1` | `Reference.analyticsConflicts`, `ProblemCode` |
| 0.22.0 | `vms.detector/1` | `params.with` в `409 BUSY` (ломающее) |
| 0.23.0 | `vms.detector/1` | `RuleTrigger.match.detector` |
| V | механизм | `x-layer` (задача 1) |

В файле над таблицей — абзац «Как читать»: смысл слоя (кому делать), что значат `video` и `vms`, что строки «механизм; профиль» — смешанные версии и что из них механизм (в «Что»). Под таблицей — «Как дополнять»: каждая новая версия контракта — строка; после части 02 правка только профиля версию контракта не поднимает и сюда не попадает, её история — `changes` в файле профиля.

- [ ] **Step 1: Случаи в `tools/check_layers.py`** (`readme`, `table` — тексты живых файлов, `cur` — `info.version`):

```python
ok(versions_table_problems(readme, table, cur, ids) == [], "живая таблица версий цела")
ok(any("0.12.0" in p for p in versions_table_problems(readme, drop_row(table, "0.12.0"), cur, ids)), "нет строки версии")
ok(any("механизмы" in p for p in versions_table_problems(readme, set_layer(table, "0.8.0", "механизмы"), cur, ids)), "незнакомое слово в слое")
ok(any("vms.nope/1" in p for p in versions_table_problems(readme, set_layer(table, "0.5.0", "`vms.nope/1`"), cur, ids)), "незнакомый профиль в слое")
ok(any("9.9.0" in p for p in versions_table_problems(readme, table, "9.9.0", ids)), "case_current_version_missing")
ok(any("0.99.0" in p for p in versions_table_problems(readme, add_row(table, "0.99.0", "механизм"), cur, ids)), "строка версии, которой нет в README")
```

`drop_row`, `set_layer`, `add_row` — маленькие помощники в самом `check_layers.py`.

- [ ] **Step 2: Запустить.** Run: `python3 tools/check_layers.py`. Expected: `FAIL` — нет `versions_table_problems` и нет файла таблицы.
- [ ] **Step 3: Написать `versions_table_problems`** и файл `docs/contract-layers/versions-by-layer.md` по разметке выше.
- [ ] **Step 4: Подключить к `check_api.py`:** `check_versions_by_layer` читает `docs/contract-layers/versions-by-layer.md` от корня репозитория (не от `--api`), `api/README.md` — от `API`. Нет файла таблицы — `FAIL`.
- [ ] **Step 5: Проверить.** Run: `python3 tools/check_layers.py && python3 tools/check_api.py`. Expected: всё `PASS`, `RESULT pass`.
- [ ] **Step 6: Коммит.**

```bash
git add docs/contract-layers/versions-by-layer.md docs/contract-layers/README.md docs/contract-layers/2026-11-16-kontrakt-i-podsistemy-predlozhenie.md tools/layers.py tools/check_layers.py tools/check_api.py api/README.md
git commit -m "API: версии контракта 0.3.0–V по слоям — docs/contract-layers/versions-by-layer.md, проверка в check_api"
git pull --rebase && git push
```

## Задача 3. Слой правки против `origin/main`

**Files:**
- Modify: `tools/layers.py` — классификатор и командная строка; `tools/check_layers.py` — случаи; `tools/check_api.py` — `check_layer_diff(rep, spec)`, вызов последним перед `--lint`.
- Modify: `api/TESTS.md` — раздел 4: строка «слои правки против `origin/main`»; описание `tools/layers.py` и `check_layers.py` — новым разделом «11. Слои контракта» по образцу раздела 10.

**Interfaces:**
- Consumes: `layer_of_schema`, `layer_of_path`, `leak_marks`, `reviewers_of`, `profile_ids` (задача 1).
- Produces:
  - `MECHANISM_FILES = ("api/server.js", "api/units.js", "api/kinds.js", "api/rule-engine.js", "api/contract.js", "api/client.js")`; `GENERATED = ("api/openapi.js", "api/fixture.js", "api/fixtures/one-domain.json", "api/fixtures/large.json", "api/fixtures/xl.json")` — их классификатор пропускает.
  - `changed_files(base: str, root: str, head: str | None = None) -> list[str] | None` — `git diff --name-only $(git merge-base <head|HEAD> <base>) [<head>]`; без `head` — плюс `git ls-files --others --exclude-standard api tests`. `None` — нет git или ссылки.
  - `classify_specs(old: dict, new: dict, marks: dict) -> dict` и `classify_fixture(old: dict, new: dict, spec: dict, api_dir: str) -> dict` — чистые функции. `marks` — спецификация, по которой ищут `x-layer`: новая, а если имени в ней нет — рабочая (для правок из истории, когда пометок ещё не было).
  - `classify(base: str = "origin/main", root: str = ROOT, api_dir: str = "api", head: str | None = None) -> dict | None`. Ответ: `{"base": sha, "files": [...], "mechanism": [строки], "layers": {слой: [строки]}, "kinds": [строки], "stand": [строки], "descriptions": [строки], "version": (старая, новая), "notify": {адресат: [слои]}}`.
  - `version_problems(cls: dict, profiles_active: bool) -> list[str]`.
  - Командная строка: `python3 tools/layers.py [--base REF] [--head REF] [--api DIR]` печатает разбор и адресатов, код 1 — если `version_problems` не пусты.
  - Проверка `"Слои правки против origin/main"` в `check_api`.

Как классификатор раскладывает файлы:

| Файл | Куда |
|---|---|
| `api/openapi.json` | схема или путь добавлены, сняты или изменены: слой по `x-layer`, без пометки — `mechanism`; изменились только `description`, `summary`, `example`, `examples` — `descriptions`; `info.version` — `version` |
| `MECHANISM_FILES` | `mechanism` (имя файла) |
| `api/profiles.js` | `layers["подсистема"]`: «api/profiles.js — назови профиль в уведомлении» |
| `api/profiles/<имя>.json`, `.md` | `layers[id профиля]` |
| `demo.json`, `kinds` | свойство есть в `properties` или `status` профиля из `implements` вида — `layers[профиль]`; иначе — `kinds` («вид camera: свойство zzz — вне профилей») |
| `demo.json`, `profiles` | `layers[id]` |
| `demo.json`, `reference.<ключ>` | слой пометки `Reference.<ключ>`; без пометки — `stand` («данные справочника механизма») |
| `demo.json`, прочие разделы | `stand` |
| `GENERATED`, `api/requests/*`, `*.md` | пропуск |

Адресаты (`notify`): `mechanism` → `владелец контракта`; профиль → `reviewers_of(id)`; `vms`, `video`, «подсистема» → `владелец контракта` (своего хозяина у них пока нет). `kinds`, `stand`, `descriptions` — без уведомления.

`version_problems`:

- **V1.** Изменились `api/openapi.json` (кроме `info.version` и описаний) или `MECHANISM_FILES`, а версия та же — `механизм изменён без новой версии контракта: <что>`. Изменились только описания — проблемы нет, классификатор пишет `INFO`.
- **V2** (только при `profiles_active`: в `api/profiles/` есть хотя бы один `*.json`). Версия поднята, правка задела слои подсистем, а `mechanism` пуст — `версию контракта подняла правка подсистемы (<слои>): у неё своя версия — version в файле профиля`. Версия поднята без правки подсистем и механизма (только документы) — проблемы нет.

В `check_api`: `API != "api"` — `INFO … копия папки API, сверка с git пропущена`; `classify` вернул `None` — `INFO … нет git или origin/main, пропуск`; иначе — `INFO` по каждому слою и адресату и `rep.check("Слои правки против origin/main", version_problems(cls, active))`.

- [ ] **Step 1: Случаи в `tools/check_layers.py`.** Случаи с git — во временном репозитории (`git init` в `tempfile.TemporaryDirectory()`, копия `api/openapi.json` и `api/fixtures/demo.json`, первый коммит):

```python
# case_no_git
ok(classify(base="no-such-ref", root=tmp) is None, "case_no_git: нет ссылки — None")
# case_untracked
write(tmp, "api/profiles/vms.test.json", "{}")
ok("api/profiles/vms.test.json" in changed_files("HEAD", tmp), "case_untracked: новый файл виден")
# case_merge_base: ветка up ушла вперёд правкой openapi.json, своя правка — только demo.json
ok("api/openapi.json" not in changed_files("up", tmp), "case_merge_base: чужая правка не своя")
# чистые функции
ok("+ схема Foo" in " ".join(classify_specs(old, add_schema(old, "Foo"), old)["mechanism"]), "новая общая схема — механизм")
ok("vms.pos/1" in classify_specs(old, touch_schema(old, "PosRawLine"), old)["layers"], "схема кассы — vms.pos/1")
c = classify_specs(old, set_description(old, "Unit", "новое описание"), old)
ok(c["mechanism"] == [] and c["descriptions"], "case_description_only: только описания")
ok(version_problems({**c, "version": ("V", "V")}, True) == [], "case_description_only: без версии можно")
m = classify_specs(old, add_schema(old, "Foo"), old)
ok(any("без новой версии" in p for p in version_problems({**m, "version": ("V", "V")}, False)), "V1: механизм без версии")
f = classify_fixture(fx, add_profile_prop(fx, "vms.camera/1", "camera", "noiseReduction"), spec, "api")
ok("vms.camera/1" in f["layers"], "поле профиля камеры — vms.camera/1")
ok(any("zzz" in s for s in classify_fixture(fx, add_kind_prop(fx, "camera", "zzz"), spec, "api")["kinds"]), "поле вне профиля — только вид")
ok("vms" in classify_fixture(fx, touch_reference(fx, "deviceModels"), spec, "api")["layers"], "справочник моделей — vms")
ok(any("версию профиля" in p or "version в файле профиля" in p for p in version_problems({**f, "mechanism": [], "version": ("0.1.0", "0.2.0")}, True)), "V2: данные профиля подняли версию контракта")
ok(version_problems({**f, "mechanism": [], "version": ("0.1.0", "0.2.0")}, False) == [], "V2 до части 02 молчит")
# история репозитория
ok("vms.pos/1" in classify("ed44f5a~1", head="ed44f5a")["layers"], "0.5.0 — vms.pos/1")
ok(any("/journal/facets" in s for s in classify("60ea7f1~1", head="60ea7f1")["mechanism"]), "0.8.0 — механизм")
# командная строка
ok(run_cli("--base", "HEAD", "--head", "HEAD") == (0, "нет правок"), "CLI: HEAD против HEAD — нет правок")
```

Помощники `write`, `add_schema`, `touch_schema`, `set_description`, `add_profile_prop`, `add_kind_prop`, `touch_reference`, `run_cli` — в самом `check_layers.py`. `run_cli` возвращает `(код, вывод)`, а случай сравнивает код и ищет слова в выводе. Случаи истории (`ed44f5a`, `60ea7f1`) в мелком клоне без этих коммитов пишут `SKIP`, а не `FAIL`. Слой пути `/units/{uid}/pos/raw` в 0.5.0 классификатор берёт из рабочего `openapi.json`, потому что тогда пометок ещё не было.

- [ ] **Step 2: Запустить.** Run: `python3 tools/check_layers.py`. Expected: новые случаи — `FAIL` (`AttributeError: module 'layers' has no attribute 'classify'`); случаи задач 1–2 — `PASS`.
- [ ] **Step 3: Написать классификатор** по таблицам выше.
- [ ] **Step 4: Подключить `check_layer_diff` к `check_api.py`.**
- [ ] **Step 5: Проверить.** Run: `python3 tools/check_layers.py && python3 tools/check_api.py && python3 tools/layers.py`. Expected: `check_layers` без `FAIL`; `check_api` — `RESULT pass` и строка `INFO` о слоях правки (в правке задачи 3 — пусто: `tools/` не слой); `layers.py` — «нет правок» или список этой правки, код 0.
- [ ] **Step 6: Коммит.**

```bash
git add tools/layers.py tools/check_layers.py tools/check_api.py api/TESTS.md
git commit -m "Тесты: слои правки против origin/main — tools/layers.py называет слои и адресатов уведомления, версия контракта только у правки механизма"
git pull --rebase && git push
```

## Задача 4. Правила процесса

**Files:**
- Modify: `.claude/skills/api-contract/SKILL.md` — `description`, вводный абзац, новый раздел «Слои: механизм и подсистема» перед «Правка контракта без владельца», пп. 2 и 5 этого раздела, «Порядок правки контракта».
- Modify: `.claude/skills/vms-requests/SKILL.md` — абзац «Запрос о слое подсистемы» перед «Порядок».
- Modify: `CLAUDE.md` — пункт `api-contract` в «Скиллы проекта» («Коротко: …»), исключение в «Проверки прототипа», раздел «Коммиты».
- Modify: `api/requests/README.md` — абзац в разделе «Кому».

**Interfaces:**
- Consumes: `x-layer` и `KNOWN_LEAKS` (задача 1), `versions-by-layer.md` (задача 2), `python3 tools/layers.py` (задача 3).
- Produces: раздел скилла `api-contract` «Слои: механизм и подсистема» — на него ссылаются части 02–07; суффикс коммита `; профиль <id> <M.m>`.

Что записано в разделе «Слои: механизм и подсистема» (формулировки — исполнителя, решения — эти):

1. **Граница** (п. 4 предложения). Механизм — новое расширение `x-*` описаний видов, новый общий путь, новое поле общей схемы (без `x-layer`: `Unit`, `Rule`, `JournalEvent`…), новая проверка для всех видов, поведение `MECHANISM_FILES`. Подсистема — свойства, команды и события вида через уже описанные `x-*`, `allOf`, `schemaPerUnit`; профиль; справочники VMS в `Reference` (поля с `x-layer`); хуки `api/profiles.js`. Каталог действий правил VMS — данные подсистемы, движок правил — механизм.
2. **`x-layer`.** Новая схема или путь подсистемы в `openapi.json` получает `x-layer` (пути профилей пока лежат здесь, п. 7). Новое поле подсистемы в общую схему не кладут: место ему — схема вида или профиль. Если без этого не обойтись, поле делает владелец: `x-layer` у поля и строка в `KNOWN_LEAKS` (`tools/layers.py`).
3. **Кто ведёт.** Механизм — владелец контракта. Профиль — `owner` в `api/profiles/<имя>.json`; пока файла нет — mockup (у `vms.camera/1` — команда VMS целиком, пока её нет — mockup). Вид — система, которая его отдаёт: в наборе `demo` — mockup, виды w2c — w2c из манифестов, без профиля и без проверки mockup.
4. **Кто проверяет.** Механизм — владелец: уведомление `…-done-request.md`, `Кому: владелец контракта`, как сейчас. Профиль — `reviewers` файла профиля; пока файла нет — w2c: уведомление `…-done-request.md`, `Кому: <reviewers>`. Закрывает его ответом последний из reviewers. Поле вида вне профиля, `vms` и `video` — как сказано в таблице адресатов задачи 3 (вне профиля — без уведомления; `vms`, `video` — владельцу).
5. **Версия.** Правка механизма — версия контракта, пп. 2–7 ниже. Правка только слоя подсистемы версию контракта не поднимает: младшая версия профиля (`version` в его файле) и строка в `changes`. **Пока файла профиля нет** — по-старому: версия контракта и «Что добавлено в X.Y.Z», слой — в строке `versions-by-layer.md`. Путь профиля в `openapi.json` изменился — версия контракта (файл механизма менялся), уведомление — reviewers профиля.
6. **Таблица версий.** Каждая новая версия контракта — строка в `docs/contract-layers/versions-by-layer.md`. Без неё `check_api` падает.
7. **Ломающая правка профиля.** Снять или переименовать поле профиля — новый профиль `<имя>/<N+1>` рядом со старым: для контракта это добавление. Снять старый профиль — запрос к reviewers. Делает его owner профиля после их ответа.
8. **Как узнать слой и адресатов:** `python3 tools/layers.py` (против `origin/main`); `check_api` пишет то же строками `INFO`.

Остальные правки:

- `api-contract`, вводный абзац: «Контракт ведёт **владелец — joynickray**» → «Механизм контракта ведёт **владелец — joynickray**; профили — их owner (раздел «Слои»)». Пункт 5 «Данные вида — без уведомления» → «Данные вида вне профиля — без уведомления; поле профиля — уведомление reviewers профиля (раздел «Слои», п. 4)». Пункт 2 «Версия» — оговорка «у правки механизма; правка только подсистемы — раздел «Слои», п. 5». «Порядок правки контракта», п. 1 — после `demo.json` «и файл профиля `api/profiles/<имя>.json`, если он есть»; п. 3 — плюс `python3 tools/layers.py`. В `description` — слова «слой правки: механизм или профиль, x-layer, api/profiles/, reviewers».
- `vms-requests`, абзац «Запрос о слое подсистемы»: пункты запроса к владельцу о полях, командах и событиях вида с профилем владелец в ответе передаёт owner профиля и ставит статус по своим пунктам. Уведомление о правке профиля ведут его reviewers: каждый пишет свой раздел ответа, «отвечен» ставит последний.
- `api/requests/README.md`, «Кому»: запрос о профиле — `Кому:` owner профиля (поле `owner` в `api/profiles/<имя>.json`, пока файла нет — mockup); уведомление о правке профиля — `Кому:` его reviewers (пока файла нет — w2c). Слой и адресатов называет `python3 tools/layers.py`.
- `CLAUDE.md`: «Коротко» у `api-contract` — два слоя: механизм (`api/openapi.json` без `x-layer`, сервер) ведёт владелец joynickray; профиль (`api/profiles/<имя>.json`, пока файла нет — описание в `api/BACKEND.md`) — его owner, правку смотрят reviewers профиля; слой и адресатов называет `python3 tools/layers.py`; остальное «Коротко» сохранить. В «Проверки прототипа» к «для `tools/outline.py` — `check_outline.py`» добавить «для `tools/layers.py` — `check_layers.py`». В «Коммиты»: правка только профиля — `API: <команда> — …; профиль vms.camera/1 1.6` вместо `; контракт X.Y.Z` (пока файла профиля нет — как правка контракта).

- [ ] **Step 1: Проверка до правки.** Run: `grep -c "Слои: механизм и подсистема" .claude/skills/api-contract/SKILL.md; grep -c "check_layers.py" CLAUDE.md; grep -c "owner профиля" api/requests/README.md .claude/skills/vms-requests/SKILL.md`. Expected: все `0`.
- [ ] **Step 2: Внести правки** по списку выше.
- [ ] **Step 3: Проверка после правки.** Run: тот же `grep`. Expected: каждый счётчик не меньше `1`. Затем `grep -n "tools/layers.py\|versions-by-layer.md\|KNOWN_LEAKS\|x-layer" .claude/skills/api-contract/SKILL.md CLAUDE.md` — каждое имя ведёт в файл, который есть в `main` (`ls tools/layers.py docs/contract-layers/versions-by-layer.md`).
- [ ] **Step 4: Прочитать раздел глазами исполнителя части 02:** каждое правило работает и без файлов профилей, и с ними (пункты 3–5 называют, что делать, пока файла нет). Run: `python3 tools/check_api.py`. Expected: `RESULT pass` (правила проверки не трогают).
- [ ] **Step 5: Коммит.**

```bash
git add .claude/skills/api-contract/SKILL.md .claude/skills/vms-requests/SKILL.md CLAUDE.md api/requests/README.md
git commit -m "Правила: слои контракта — механизм ведёт владелец, профиль — его owner, уведомление о профиле — reviewers, версия контракта — только у механизма"
git pull --rebase && git push
```

## Задача 5. Открытые запросы по слоям

**Files:**
- Create: `docs/contract-layers/requests-by-layer.md`.
- Modify: ответы владельца на запросы `2026-11-08-174207Z-mockup-camera-video-streams-tours` и `2026-11-16-115433Z-mockup-tag-track-pro` (раздел «Слои» в конце, «Чего пока нет»); строки статуса этих двух запросов и их строки в `api/requests/README.md`.
- Modify: `api/requests/2026-11-18-114831Z-w2c-contract-layers-response.md` — в разделе владельца подраздел «Сделано: пп. 1 и 3 переработки» и правка «Чего пока нет».
- Modify: `docs/contract-layers/README.md` — ссылка на `requests-by-layer.md`.

**Interfaces:**
- Consumes: значения `x-layer` (задача 1), правила раздела «Слои» (задача 4).
- Produces: `requests-by-layer.md` — таблица `| Запрос | Кому | Статус | Слой | Кто ведёт | Что осталось | Где в плане |`; часть 04 и будущий API видео берут оттуда свои пункты.

Разбор (на 2026-11-18; уведомления 0.10.0–0.13.0, о которых говорит п. 3 предложения, закрыты ответами 2026-11-16):

| Запрос | Слой | Решение |
|---|---|---|
| 185448Z, макет как основа продукта | не контракт | ведёт владелец, вне переделки; статус не трогаем |
| 174207Z, вкладка «Видео» камеры | `vms.camera/1`, `vms.ptz/1`; `video` | пп. 1, 2, 4 (модель тура), 5 ведёт mockup как owner профилей; п. 3 и пуск туров ждут API видео. По всем пунктам владельца решение записано — статус «отвечен» |
| 115433Z, Tag&Track Pro | `vms.ptz/1` (если ответ не назвал профиль `tagTrack`); `video` | пп. 1–2 и строка лицензии `tagTrackPro` — mockup; пп. 3–4 — API видео; п. 5 отклонён; п. 6 сделан в 0.20.0 — статус «отвечен» |
| 094349Z, снять учётки потоков | `vms` | пп. 1–3 ведёт владелец, решение — после 203335Z; статус «в работе», вне переделки |
| 203335Z, вход внешней программы за потоком | механизм (ключ у пользователя); `video` (шлюз потоков) | ведут mockup и w2c, оба ответили; «отвечен» ставит w2c как последний ответивший. Не перехватывать: сказать пользователю |
| 114831Z, позиция w2c по слоям | механизм | раздел владельца дописан; mockup не ответил на вопросы 3 и 4 — статус «в работе» ставит последний ответивший |
| 120707Z, своя страница подсистемы | механизм (`setupUi`) | ведёт w2c; части 05–06 |

- [ ] **Step 1: Перечитать** два ответа (174207Z, 115433Z) и убедиться, что ни один пункт владельца не ждёт его решения. Если какой-то пункт ждёт — его статус остаётся «в работе», а строка таблицы называет этот пункт.
- [ ] **Step 2: Записать `requests-by-layer.md`** по разбору, добавить в каждый из двух ответов раздел «Слои (ГГГГ-ММ-ДД)»: слой каждого пункта, кто ведёт, куда уведомление (раздел «Слои» скилла `api-contract`). Поставить «отвечен» в шапке запроса и в таблице `api/requests/README.md`, по скиллу `vms-requests`, п. 5.
- [ ] **Step 3: Дописать раздел владельца в ответе 114831Z:** правила (`api-contract`, «Слои»), `x-layer` в контракте `V`, `versions-by-layer.md` (вопрос 7), `requests-by-layer.md` (п. 3), проверка границы (вопрос 1). Из «Чего пока нет» снять «Разметки версий 0.3.0 — текущая по слоям». Строку о разделе mockup оставить.
- [ ] **Step 4: Сверить статусы.** Run:

```bash
python3 - <<'EOF'
import re, pathlib
d = pathlib.Path("api/requests"); t = (d / "README.md").read_text()
for f in sorted(d.glob("*-request.md")):
    m = re.search(r"Статус: ([а-яё ]+?)(?: ·|\*\*|$)", f.read_text(), re.M)
    row = next((l for l in t.splitlines() if f"({f.name})" in l), "")
    if m and row and f"| {m.group(1).strip()} |" not in row:
        print("РАСХОЖДЕНИЕ", f.name, m.group(1))
EOF
```

Expected: пусто.

- [ ] **Step 5: Коммит.**

```bash
git add docs/contract-layers/requests-by-layer.md docs/contract-layers/README.md api/requests/
git commit -m "API: ответ на запросы mockup — открытые запросы по слоям: «Видео» камеры и Tag&Track Pro переданы mockup как слою профилей, пункты видео ждут API видео; ответ w2c — пп. 1 и 3 переработки сделаны"
git pull --rebase && git push
```

- [ ] **Step 6: Сказать пользователю:** у 203335Z оба адресата ответили, «отвечен» ставит w2c; в 114831Z нет раздела mockup (вопросы 3, 4).

---

## Открытые вопросы владельцу

1. **NGP среди reviewers.** w2c и предложение называют reviewers «w2c, NGP», но в таблице «Кому» (`api/requests/README.md`) адресата NGP нет: хук не покажет ему уведомление. Кто это в git? До ответа reviewers по умолчанию — только w2c (`DEFAULT_REVIEWERS`).
2. **Как часто уведомлять reviewers.** План: одно уведомление на младшую версию профиля, как сейчас на версию контракта. w2c не перезакрепляется поле за полем и может просить реже, например сводку раз в неделю.
3. **`video` и `vms` в `x-layer`.** Нужны ли эти два значения, или помечать только id профилей? Без них у выгрузки, учёток потоков и путей домена VMS пометки нет, и `check_api` их не отличит от механизма.
4. **Статус «отвечен» при пунктах, которые ждут API видео** (174207Z, 115433Z). У API видео (п. 11) пока нет плана и срока. Другой вариант — оставить «в работе», пока этого плана нет.
5. **Имя файла при второй старшей версии.** По договорённости частей файл профиля — `api/profiles/<имя без /N>.json`, тогда у `vms.camera/1` и `vms.camera/2` один файл. Это решает часть 02, а `profile_file` возьмёт её решение.

## Что не входит

- Файлы профилей, `Profile.version` и `uses`, проверка полей вида против профиля — часть 02. Часть 02 же может снять оговорку «пока файла профиля нет» в правилах задачи 4. Проверка V2 включится сама, когда появится первый `api/profiles/*.json`.
- Тесты по слоям — часть 03; `layer_of_path` и `layer_of_schema` ей в помощь.
- Вынос VMS из механизма — часть 04: пометки `vms`, `KNOWN_LEAKS`, параметр `layout` у `/tree/children`, разделы приложения. `KNOWN_LEAKS` — её счётчик: строка уходит вместе с полем.
- Своя страница подсистемы — части 05–06.
- API видео (п. 11), пути профилей вне `openapi.json` (п. 7), разбиение `api/profiles.js` (п. 8) — вне частей 01–07.
- Уведомление w2c о готовности пп. 1–3 и 9: оно имеет смысл после части 02.
- Ответы за mockup и w2c на их запросы и статусы запросов, которые ведут они.
