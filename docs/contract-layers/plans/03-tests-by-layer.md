# Часть 03. Тесты API по слоям — план работ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** бэкенд проверяется тестами API как «механизм плюс профили, которые он объявил»: у каждого теста есть слой (механизм, профиль, API видео), тест необъявленного профиля пропускается с причиной, необъявленная операция на стенде бэкенда не даёт сбоя `NO_ROUTE`, а отчёт показывает итог по каждому слою.

**Architecture:** метка слоя — строка `layer` у теста. Умолчание задаёт файл (`ApiTest.fileLayer`), тест с другим слоем пишет свой `layer`. Стенд тестов (`tests/harness.js`) превращает слой профиля в условие `profile:<id>[@M.m]`. Это условие он сверяет с профилями из `GET /kinds`: виды с `implements` и `profiles[].version`. Чистые функции слоёв лежат отдельно (`tests/layers.js`), их проверяет `tools/check_test_layers.py`. Реестр тестов без запуска даёт `tools/api_tests_registry.mjs`, по нему `tools/check_api.py` проверяет, что у каждого теста есть верный слой.

**Tech Stack:** браузерный JS без сборки (IIFE, `window.*`), Node для реестра (как `tools/serve_api.mjs`), Python 3 + headless Chrome (`tools/run_api_tests.py`).

**Spec:** [предложение](../2026-11-16-kontrakt-i-podsistemy-predlozhenie.md), пункт 5 таблицы «Что придётся переработать», раздел «Что это значит для бэкенда VMS»; позиция w2c — [запрос](../../../api/requests/2026-11-18-114831Z-w2c-contract-layers-request.md), ответы на вопросы 2 и 9, и [ответ владельца](../../../api/requests/2026-11-18-114831Z-w2c-contract-layers-response.md), п. 2 («бэкенд без видео тестов видео не получает»); раздел «Как это выглядит у w2c» («у w2c 39 сбоев `NO_ROUTE` — пути профилей, которые он не реализует»).

> **Сверка с общим планом** ([00-master.md](00-master.md), раздел «Сверка частей» — главнее текста ниже):
>
> - С1 — соответствие слоя теста и `x-layer` части 01;
> - Review Focus 2 общего плана — прогон `--layer mechanism` на наборе `agents` делают части 04 (задача 15) и 06 (задача 8): отбор `--layer` этой части должен работать с `--fixture`.

**Зависит от:** части 02. Должны быть файлы `api/profiles/<имя без /N>.json` (`id`, `version`, `uses`…), а `GET /kinds` → `profiles[]` должен отдавать `version`.

## Global Constraints

- `api/openapi.json`, `api/*.js` сервера и `index.html` в этой части не меняются. Прототип не нужен: интерфейс не трогаем. Версии контракта нет (открытый вопрос 1).
- Метка слоя — строка, ровно одна из трёх форм: `"mechanism"`, `"video"`, `"profile:<id>"`. `<id>` проходит шаблон `Profile.id` из контракта: `^[A-Za-z0-9_.-]+/[0-9]+$` (`profile:vms.camera/1`).
- `since` — младшая версия профиля вида `"M.m"`, как поле `version` файла профиля (часть 02). Сравнивается по числам: `1.10` старше `1.9`.
- Подписи слоёв в отчёте: `механизм`, `API видео`, `<id>` профиля (`vms.camera/1`).
- Имена тестов не меняются: `?only=<имя>` работает как раньше. Итог (`data-apitest="pass|fail"`, строка `#apitest-summary`, `RESULT pass|fail` в `?report=`) — в прежнем виде. Новые строки в отчёте начинаются с `LAYER `.
- Строки отчёта о тестах: `PASS  [<подпись слоя>] <имя>…`, `FAIL  [<подпись слоя>] <имя> — …`, `SKIP  [<подпись слоя>] <имя> — <причина>`. Сквозные проверки (`PASS  Файлы тестов загрузились…`) — без метки.
- «Встроенный сервер» значит, что параметра `?api=` нет или `?api=loopback`. «Стенд бэкенда» значит, что `?api=https://…`.
- Тексты отчёта и документов — по-русски и простым языком (`docs/TEXTS.md`: исполнитель назван, без пассива).
- Правки `tests/api-*.js` и `api/*.md` — по скиллу `api-contract`. Тесты не становятся строже к поведению сервера: слой добавляет только пропуски, а не новые утверждения.
- Проверки после каждой задачи: `python3 tools/run_api_tests.py` и `python3 tools/run_api_tests.py --fixture one-domain` → `RESULT pass`; с задачи 1 — ещё `python3 tools/check_test_layers.py` → `RESULT pass`. В конце части (задача 7) — полный набор общих договорённостей: `check_api`, `run_api_tests`, `check_ui`, `check_perf --quick`, а также `check_loopback` и `check_stand`: они читают отчёт тестов.
- Коммит после каждой задачи, затем `git pull --rebase && git push`. Сообщения — `Тесты: …`, `API: …`, `Правила: …`.

## Review Focus

- **Вид объявил профиль, а в `GET /kinds` → `profiles` нет его записи или нет `version`.** Так ведёт себя бэкенд на старом контракте, например w2c на 0.2.0. Тесты профиля без `since` должны идти, тест с `since` — пропуск «система не назвала версию профиля». Тест — задача 1, случаи `declaredProfiles` и `profileLack`.
- **Система объявила только старшую версию (`vms.camera/2`).** Тесты `/1` нужно пропустить с причиной «объявлен vms.camera/2», а не считать сбоем и не запускать. Тест — задача 1.
- **Профиль объявлен, но с его видом нельзя работать.** Вид нельзя завести (`create`), и объектов вида нет в наборе (как вид «только ради каталога правил» в `one-domain`). Нужен пропуск с отдельной причиной, а не сбой посреди теста. Тест — задача 1.
- **Тест вызвал необъявленную операцию после того, как успел что-то записать.** На стенде бэкенда это пропуск, следующий тест начинается со сброса. Служебные операции стенда (`test-support`) и адреса вне контракта (`/no-such-thing` → `404 NO_ROUTE`) защита не трогает. Тест — задача 4.
- **В `?layer=` опечатка или слой без тестов.** Итог не должен быть «все 0 прошли». Нужен `FAIL  Отбор слоёв — …` и провал прогона. Тест — задача 5.

---

## Карта файлов

| Файл | Что делает в этой части |
|---|---|
| `tests/layers.js` | **новый.** Чистые функции слоёв, `window.ConsolemTestLayers`. Работает и в браузере, и в Node |
| `tests/harness.js` | `fileLayer`, `layer` и `since` у теста, условие `profile:`, причины пропуска, защита от необъявленной операции, строки `LAYER`, отбор `?layer=`, `registry()` |
| `tests/api.html` | подключает `layers.js` до `harness.js`; блок `<pre id="apitest-layers">` под итогом; абзац о слоях |
| `tests/api-*.js` (19) | `ApiTest.fileLayer(…)` в начале файла и `layer` у тестов с другим слоем (раздел «Как разложить тесты») |
| `tools/api_tests_registry.mjs` | **новый.** Загружает API и тесты в порядке `tests/api.html` и печатает JSON реестра без запуска тестов |
| `tools/check_api.py` | проверка «Слой у каждого теста API» (`check_test_layers`), параметр `--tests DIR` |
| `tools/check_test_layers.py` | **новый.** Проверка проверки: функции `layers.js`, реестр, порча копии `tests/`, прогоны на `one-domain` |
| `tools/run_api_tests.py` | `--layer`, печать блока `apitest-layers` |
| `api/TESTS.md`, `api/BACKEND.md`, `api/profiles/README.md` | слои, причины пропуска, `&layer=`, «Когда готово» по слоям |
| `.claude/skills/api-contract/SKILL.md` | новый тест — со слоем; тест поля новой младшей версии — со `since` |
| `api/requests/<ts>-owner-tests-by-layer-request.md` | **новый.** Уведомление w2c |

## Interfaces (для других частей)

```text
Layer = "mechanism" | "video" | "profile:<id>"            // id — как Profile.id, с /N

ApiTest.test(name, fn, { needs?: string[], layer?: Layer, since?: "M.m" })
ApiTest.fileLayer(layer: Layer): void                       // до первого test() файла; один раз на файл
ApiTest.registry(): Array<{ name, file, layer: Layer|null, since: string|null, needs: string[] }>
  // needs — уже с добавленным условием profile:<id>[@since]

условие в needs:  "profile:<id>"         — профиль объявлен, и с его видом можно работать
                  "profile:<id>@<M.m>"   — то же, и объявленная версия не младше M.m

window.ConsolemTestLayers (tests/layers.js):
  parseLayer(s: string) -> { type: "mechanism"|"video"|"profile", profile?: string } | null
  layerTitle(s: Layer) -> string                              // «механизм», «API видео», «vms.camera/1»
  versionAtLeast(have: string, need: string) -> boolean
  declaredProfiles(kindsBody: KindsList|null, usableKind: (code) => boolean)
      -> Map<id, { version: string|null, usable: boolean }>
  profileLack(token: string, declared: Map) -> string|null    // причина пропуска или null
  undeclaredOperation(spec, caps: Capabilities, method, path) -> operationId|null

Адрес страницы:  tests/api.html?layer=mechanism,profile:vms.camera/1   (через запятую)
Командная строка: python3 tools/run_api_tests.py --layer mechanism,profile:vms.camera/1
Отчёт:            LAYER <подпись>[ <версия>] — прошли N, не прошли M, пропущено K
                  LAYER <id> — не объявлен, пропущено K
Реестр:           node tools/api_tests_registry.mjs [--api DIR] [--tests DIR]  → JSON в stdout
check_api.py:     строка «Слой у каждого теста API»; функция check_test_layers(rep, tests=TESTS, api=API)
```

Что это значит для других частей:

- **Часть 04 (механизм без VMS).** Строка `INFO` «Тесты механизма на видах набора» в `check_api.py` — это её перечень работы. Когда часть 04 переносит часть VMS в профиль (поиск в сети, сценарии, ретрансляторы, справочники), тесты этой части получают `layer: "profile:<новый профиль>"`.
- **Части 05 и 06 (своя страница подсистемы).** Тесты `setupUi`, `origin`, `x-bridge` в `tests/api-*.js` — слой `mechanism`.
- **Часть 07 (экран по профилю).** Новые тесты API на поля профиля — слой `profile:<id>` и `since`, если поле появилось в младшей версии.
- **Каждая следующая правка профиля** (часть 02, процесс части 01). Новое поле со `since: "1.6"` получает тест со `since: "1.6"`. Бэкенд, который отдаёт `1.5`, такой тест пропускает.

## Как разложить тесты

**Правило.** Слой — это то, чью договорённость проверяет тест. Вопрос: если тест упал, кто неправ?

1. **Механизм** (`mechanism`) — то, что записано в `api/openapi.json` и в «Договорённостях» `api/README.md` для любого вида: версии и `If-Match`, ошибки, групповые операции, откат и повтор, `/kinds`, `/units`, расширения `x-*`, секреты, страницы и дерево, поток, журнал, правила, права, опции, лицензии, ассистент, файлы, служебные операции стенда.
2. **Профиль** (`profile:<id>`) — смысл полей профиля и поведение его хуков (`api/profiles.js`): каскады, вычисляемые поля, проверки полей профиля.
3. **API видео** (`video`) — пути и схемы первых трёх строк таблицы «Что из подсистем лежит прямо в `openapi.json`»: живое видео, разговор, PTZ, пресеты; шкала, куски, закладки, удержания, забор с устройства, `recording-target`, `recording-days`, обходы и сканы архива; выгрузка (`/exports…`, `GET /me/export`). Сюда же входят пути видеопрофилей `vms.live/1`, `vms.ptz/1`, `vms.talk/1`, `vms.timeline/1`. Тест по-прежнему пишет в `needs` то, что ему нужно (`implements:vms.talk/1`, операции).

Как решать спорные случаи:

- **Данные не решают слой.** Тест групповой операции на камерах — механизм. Вид, на котором он идёт, остаётся в `needs` (`kind:camera`). Система без камер этот тест пропустит, как сейчас.
- **Тест проверяет механизм и профиль сразу — слой профиля.** Систему без профиля такой тест всё равно не проверит. Тест не делят.
- **Часть VMS ещё в механизме** (поиск в сети, сценарии между камерами, ретрансляторы, каталог действий правил, виды без профиля — `sensor`, `relay`, `spk`, `mic`). До части 04 у таких тестов слой `mechanism`. `check_api.py` перечисляет их строкой `INFO`.
- **Учётки потоков** (`/stream-accounts…`) — `video` (открытый вопрос 2).

**Раскладка по файлам.** «Слой файла» — аргумент `ApiTest.fileLayer`. «Исключения» — тесты, чьё имя начинается с указанных слов. Им пишут свой `layer`. Остальные тесты файла получают слой файла.

| Файл | Слой файла | Исключения: начало имени → слой |
|---|---|---|
| `api-read.js` | `mechanism` | — |
| `api-journal.js` | `mechanism` | — |
| `api-bulk.js` | `mechanism` | — |
| `api-pages.js` | `mechanism` | — |
| `api-rules.js` | `mechanism` | — |
| `api-automation.js` | `mechanism` | — |
| `api-units.js` | `mechanism` | — |
| `api-access.js` | `mechanism` | «Учётки потоков», «PTZ — как в базе» → `video` |
| `api-assist.js` | `mechanism` | «План выгрузки» → `video` |
| `api-hardware.js` | `mechanism` | «Маска приватности камеры», «Команды камеры defaults и readConfig» → `profile:vms.camera/1`; «Мета-детектор» → `profile:vms.detector/1` |
| `api-domains.js` | `profile:vms.server/1` | «Домен:» → `profile:vms.domain/1`; «Папка:» → `profile:vms.folder/1`; «Лицензии» → `mechanism` |
| `api-storage.js` | `profile:vms.archive/1` | «Том» (`Том:`, `Том во время`, `Том только`) → `profile:vms.volume/1` |
| `api-archive.js` | `profile:vms.camera/1` | «Виды:», «Карта сервера:» → `profile:vms.archive/1`; «Том:» → `profile:vms.volume/1`; «Карта камеры w2c:» → `profile:vms.edge/1`; «Скан и обход», «Обход архива», «Скан архива», «Запись камеры w2c: приёмник» → `video`; «Настройки: сроки» → `mechanism` |
| `api-edge.js` | `profile:vms.edge/1` | «Ручной забор периода» → `video` |
| `api-webserver.js` | `profile:vms.webserver/1` | — |
| `api-cluster.js` | `profile:vms.camera/1` | «Приём в домен», «Приём шагом move» → `profile:vms.server/1`; «Папки без связи», «Папки — не запись» → `profile:vms.folder/1`; «Правка при молчащем сервере» → `mechanism` |
| `api-view.js` | `video` | «Реле: команда output», «Журнал камеры» → `mechanism` |
| `api-export.js` | `video` | — |
| `api-devices.js` | `profile:vms.camera/1` | «Добавить:», «Добавить из найденного», «Удалить камеру: строки незнакомых видов», «Детектор из карточки камеры», «Профиль при добавлении», «Поиск в сети», «Схемы видов:» → `mechanism`; «Потоки:», «Разрешение:» → `profile:vms.stream/1`; «Живое видео», «Переразместить», «Пресеты», «Аренда PTZ» → `video`; «Встроенный детектор», «Несовместимые», «Зона:», «Детектор без полей», «objectSize», «extraZones», «direction», «recordMask», «analyticsKind», «Свойства детектора и поддетектора» → `profile:vms.detector/1`; «Поддетектор», «Удаление детектора удаляет поддетекторы», «План одной операцией», «/tree/children: у трекера», «Правило по subdet.triggered» → `profile:vms.subdetector/1`; «Источник:», «Правило: событие text» → `profile:vms.pos/1`; «Единица СКУД», «Реле: в СКУД», «Команда единицы», «Правило: действие unit» → `profile:vms.acs/1` |

Если тест подходит под правило лучше, чем под таблицу, решает правило. Такие расхождения исполнитель называет в отчёте задачи 3.

---

### Task 1: Чистые функции слоёв и их проверка

**Files:**
- Create: `tests/layers.js`
- Create: `tools/check_test_layers.py` (раздел «Функции»)
- Modify: `tests/api.html` (подключить `layers.js` после `../api/contract.js`, до `harness.js`)

**Interfaces:**
- Consumes: `ConsolemContract.operationOf(spec, method, path) -> {template, op, names}|null` (`api/contract.js`); `KindsList` (`items[].kind`, `items[].implements`, `profiles[].id`, `profiles[].version`).
- Produces: `window.ConsolemTestLayers = { parseLayer, layerTitle, versionAtLeast, declaredProfiles, profileLack, undeclaredOperation }` (сигнатуры — в разделе Interfaces).

- [ ] **Step 1: Написать проверку функций в `tools/check_test_layers.py`**

Скрипт устроен по образцу `tools/check_outline.py`: `ok(cond, what)` печатает `PASS`/`FAIL`, в конце — `RESULT pass|fail`, код выхода 1 при сбое. Функция `check_functions()` запускает `node`. Node-программа выставляет `globalThis.window = globalThis`, подключает `api/contract.js` и `tests/layers.js`, читает из stdin JSON-список случаев `[функция, аргументы]` и печатает JSON-список результатов (`Map` — как объект). Случаи и ожидаемые значения:

```python
K = {"items": [{"kind": "camera", "implements": ["vms.camera/1", "vms.live/1"]},
               {"kind": "acfa", "implements": ["vms.acs/1"]},
               {"kind": "cam2", "implements": ["vms.cam2/2"]}],
     "profiles": [{"id": "vms.camera/1", "version": "1.5"}, {"id": "vms.acs/1", "version": "1.0"}]}
# usableKind: camera и cam2 — да, acfa — нет (передаётся списком годных видов)
CASES = [
  (("parseLayer", "mechanism"), {"type": "mechanism"}),
  (("parseLayer", "video"), {"type": "video"}),
  (("parseLayer", "profile:vms.camera/1"), {"type": "profile", "profile": "vms.camera/1"}),
  (("parseLayer", "profile:vms.camera"), None),
  (("parseLayer", "Mechanism"), None),
  (("parseLayer", ""), None),
  (("layerTitle", "mechanism"), "механизм"),
  (("layerTitle", "video"), "API видео"),
  (("layerTitle", "profile:vms.pos/1"), "vms.pos/1"),
  (("versionAtLeast", "1.10", "1.9"), True),
  (("versionAtLeast", "1.2", "1.3"), False),
  (("versionAtLeast", "1.3", "1.3"), True),
  (("declaredProfiles", K, ["camera", "cam2"]),
   {"vms.camera/1": {"version": "1.5", "usable": True}, "vms.live/1": {"version": None, "usable": True},
    "vms.acs/1": {"version": "1.0", "usable": False}, "vms.cam2/2": {"version": None, "usable": True}}),
  (("declaredProfiles", None, []), {}),
  (("profileLack", "profile:vms.camera/1", K, ["camera"]), None),
  (("profileLack", "profile:vms.camera/1@1.5", K, ["camera"]), None),
  (("profileLack", "profile:vms.camera/1@1.6", K, ["camera"]), "система объявила vms.camera/1 1.5, тесту нужна 1.6"),
  (("profileLack", "profile:vms.live/1@1.1", K, ["camera"]), "система не назвала версию профиля vms.live/1, тесту нужна 1.1"),
  (("profileLack", "profile:vms.live/1", K, ["camera"]), None),
  (("profileLack", "profile:vms.pos/1", K, ["camera"]), "профиль vms.pos/1 не объявлен"),
  (("profileLack", "profile:vms.cam2/1", K, ["cam2"]), "объявлен vms.cam2/2, тест — для vms.cam2/1"),
  (("profileLack", "profile:vms.acs/1", K, ["camera"]),
   "профиль vms.acs/1 объявлен, но с его видом нельзя работать: объекта нет в наборе, завести его нельзя"),
  (("undeclaredOperation", "GET", "/licenses", ["getMe"]), "listLicenses"),
  (("undeclaredOperation", "GET", "/licenses", ["listLicenses"]), None),
  (("undeclaredOperation", "POST", "/test/reset", []), None),       # служебная операция стенда
  (("undeclaredOperation", "GET", "/no-such-thing", []), None),     # адреса нет в контракте
  (("undeclaredOperation", "GET", "/units/0000/live?x=1", []), None),  # метода нет у пути — не операция
]
```

Для `profileLack` и `declaredProfiles` Node-программа строит `declared` и `usableKind` из `K` и списка годных видов. Для `undeclaredOperation` она берёт `spec` из `api/openapi.json` и `caps = {operations: <список>, features: []}`.

- [ ] **Step 2: Убедиться, что проверка падает**

Run: `python3 tools/check_test_layers.py`
Expected: `FAIL` у случаев (в `tests/layers.js` нет функций), `RESULT fail`.

- [ ] **Step 3: Написать `tests/layers.js`**

IIFE, как `api/contract.js`; в конце `window.ConsolemTestLayers = {…}`. Пояснения к функциям:
- `parseLayer` — по шаблону `^profile:([A-Za-z0-9_.-]+/[0-9]+)$`; `mechanism` и `video` — только строчными.
- `declaredProfiles` — профиль объявлен, если его называет `implements` хоть одного вида. `usable` равно `true`, если хоть один такой вид проходит `usableKind`. `version` берётся из `profiles[]` с тем же `id`, иначе `null`.
- `profileLack` проверяет по порядку: нет профиля → есть то же имя с другой старшей версией → «объявлен <другой id>, тест — для <id>», иначе «не объявлен»; не `usable`; есть `@since` и `version` равна `null`; `version` младше `since`. Тексты — ровно как в случаях шага 1.
- `undeclaredOperation` — `ConsolemContract.operationOf`. Нет операции или у неё тег `test-support` → `null`. `operationId` есть в `caps.operations` → `null`. Иначе → `operationId`.

- [ ] **Step 4: Подключить `layers.js` в `tests/api.html`**

`<script src="layers.js"></script>` после `../api/client.js`, до `harness.js`.

- [ ] **Step 5: Проверить**

Run: `python3 tools/check_test_layers.py` → все `PASS`, `RESULT pass`.
Run: `python3 tools/run_api_tests.py` → `RESULT pass` (страница ничего нового не делает).

- [ ] **Step 6: Commit**

```bash
git add tests/layers.js tests/api.html tools/check_test_layers.py
git commit -m "Тесты: слои тестов API — функции tests/layers.js и их проверка tools/check_test_layers.py"
git pull --rebase && git push
```

### Task 2: Слой у теста и реестр тестов

**Files:**
- Modify: `tests/harness.js` (`test`, новые `fileLayer` и `registry`, `lacks`, причины `SKIP` в `run`, ожидание `waived`)
- Create: `tools/api_tests_registry.mjs`
- Modify: `tools/check_test_layers.py` (раздел «Реестр»)

**Interfaces:**
- Consumes: `ConsolemTestLayers.parseLayer`, `declaredProfiles`, `profileLack`, `layerTitle` (задача 1).
- Produces: `ApiTest.fileLayer(layer)`, `ApiTest.test(name, fn, {needs, layer, since})`, `ApiTest.registry()`; условие `profile:<id>[@M.m]` в `needs`; `node tools/api_tests_registry.mjs [--api DIR] [--tests DIR]`. Выход реестра — JSON `{files: {"api-x.js": Layer|null}, tests: [{name, file, layer, since, needs}]}`.

- [ ] **Step 1: Написать проверку реестра в `tools/check_test_layers.py`**

`check_registry()`: создаёт копию `tests/` в папке `tempfile.mkdtemp(prefix=".tests-layers-", dir=ROOT)` (рядом с `api/`: `api.html` грузит `../api`) и удаляет её в `finally`. В копии нужны новый файл `api-zz-layers.js` и строка `<script src="api-zz-layers.js">` в `api.html` копии перед `ApiTest.run()`. Содержимое файла:

```js
(() => {
  ApiTest.fileLayer("profile:vms.camera/1");
  ApiTest.test("слой: от файла", async () => {}, { needs: ["patchUnit"] });
  ApiTest.test("слой: свой", async () => {}, { layer: "mechanism" });
  ApiTest.test("слой: since", async () => {}, { since: "1.3" });
  ApiTest.loaded("api-zz-layers.js");
})();
```

Затем запускается `node tools/api_tests_registry.mjs --tests <копия>` и проверяется:
- `files["api-zz-layers.js"] == "profile:vms.camera/1"`;
- «слой: от файла» → `layer == "profile:vms.camera/1"`, `needs == ["patchUnit", "profile:vms.camera/1"]`;
- «слой: свой» → `layer == "mechanism"`, в `needs` нет `profile:`;
- «слой: since» → `since == "1.3"`, в `needs` есть `"profile:vms.camera/1@1.3"`;
- в реестре столько же тестов из настоящих файлов, сколько `test(` в отчёте `run_api_tests.py` (`len(tests) - 3` из копии равно числу из реестра настоящей папки `tests`).

- [ ] **Step 2: Убедиться, что проверка падает**

Run: `python3 tools/check_test_layers.py` → `FAIL` в разделе «Реестр» (нет `fileLayer`, нет `tools/api_tests_registry.mjs`).

- [ ] **Step 3: Слой в `tests/harness.js`**

- `fileLayer(layer)` запоминает слой для файла `document.currentScript` (то же имя, что поле `file` у теста). Второй вызов из того же файла бросает `Error("fileLayer: слой файла уже задан")`.
- `test(name, fn, opts)` записывает в тест `layer: opts.layer || слой файла || null` и `since: opts.since || null`. Если слой — профиль, harness добавляет в конец `needs` строку `profile:<id>` или `profile:<id>@<since>`, если её там ещё нет.
- После чтения `GET /kinds` в `run()` harness строит `DECLARED = ConsolemTestLayers.declaredProfiles(KINDS, usableKind)`. В `lacks()` — новая ветка: `n.startsWith("profile:")` → `!!ConsolemTestLayers.profileLack(n, DECLARED)`.
- Строка `SKIP`: если не хватило условия `profile:`, причина — только текст `profileLack`. Иначе — прежнее «система не умеет: …». Метка `[<layerTitle>]` в строках `PASS`/`FAIL`/`SKIP` появится в задаче 5: в этой задаче формат строк не меняется.
- `waived`: к прежнему `/^(kind|implements|under|cap):/` добавить `profile`.
- `registry()` возвращает `tests.map(({name, file, layer, since, needs}) => …)`. Через `window.ApiTest` наружу выходят `fileLayer` и `registry`, `layers` — `ConsolemTestLayers`.
- Пока в файлах тестов нет слоёв, `run()` пишет `INFO  Тестов без слоя: N` (провалом это станет в задаче 3).

- [ ] **Step 4: Написать `tools/api_tests_registry.mjs`**

Устроен как начало `tools/serve_api.mjs`: `createRequire`, `globalThis.window = globalThis`, `--api`, `--tests`. Заглушки: `location = {search: "", href: "file://<ROOT>/<tests>/api.html", protocol: "file:"}`, `document = {currentScript: null, scripts: [], getElementById: () => null}`. Скрипты берутся по порядку из `<script src=…>` файла `<tests>/api.html`: `../api/…` — из папки `--api`, остальные — из `--tests`. Перед каждым файлом `api-*.js` в `document.currentScript` ставится `{getAttribute: () => "<имя файла>"}`. Строка `ApiTest.run()` не выполняется. В stdout — `JSON.stringify({files, tests: ApiTest.registry()})`. Если файл тестов бросил ошибку при загрузке — код выхода 1 и имя файла в stderr.

- [ ] **Step 5: Проверить**

Run: `python3 tools/check_test_layers.py` → `RESULT pass`.
Run: `python3 tools/run_api_tests.py` → `RESULT pass`, строка `INFO  Тестов без слоя: N`. `N` — число тестов в реестре (`len(tests)`), без четырёх сквозных проверок.
Run: `python3 tools/run_api_tests.py --fixture one-domain` → `RESULT pass`, пропусков столько же, сколько до правки.

- [ ] **Step 6: Commit**

```bash
git add tests/harness.js tools/api_tests_registry.mjs tools/check_test_layers.py
git commit -m "Тесты: слой у теста API — fileLayer, layer, since, условие profile:, реестр тестов"
git pull --rebase && git push
```

### Task 3: Разложить существующие тесты по слоям

**Files:**
- Modify: `tests/api-*.js` (все 19): `ApiTest.fileLayer(…)` первой строкой внутри IIFE и `layer` у исключений (раздел «Как разложить тесты»)
- Modify: `tests/harness.js` (тест без слоя — провал)
- Modify: `tools/check_test_layers.py` (раздел «Разметка»)

**Interfaces:**
- Consumes: `ApiTest.fileLayer`, `layer` в `opts`, `ApiTest.registry()`, реестр (задача 2).
- Produces: у каждого теста `tests/api-*.js` есть слой. На этот реестр опираются задачи 5 и 6.

- [ ] **Step 1: Написать проверку разметки в `tools/check_test_layers.py`**

`check_marking()` читает реестр настоящей папки `tests` и проверяет:
- у каждого теста `layer` не `null`, и `parseLayer(layer)` не `null`;
- у каждого файла из `files` слой задан;
- образцы раскладки — по одному на группу таблицы: тест `api-view.js`, чьё имя начинается с «Реле: команда output», → `mechanism`; тест `api-devices.js` «Поддетектор: под трекером…» → `profile:vms.subdetector/1`; `api-domains.js` «Папка: создать…» → `profile:vms.folder/1`; `api-export.js` — все `video`; `api-units.js` — все `mechanism`.

- [ ] **Step 2: Убедиться, что проверка падает**

Run: `python3 tools/check_test_layers.py` → `FAIL` в разделе «Разметка».

- [ ] **Step 3: Разметить 19 файлов**

По таблице раздела «Как разложить тесты». Тест-исключение получает `layer` в том же объекте `opts`, где `needs`. `api-units.js` передаёт `opts` дальше в обёртке `test` — менять её не нужно. Тесты, которые порождает цикл, получают слой так же. Тест, которому таблица не подходит, раскладывается по правилу. Его имя и слой исполнитель записывает в отчёт задачи.

- [ ] **Step 4: Тест без слоя — провал**

В `run()` вместо `INFO  Тестов без слоя` — сквозная проверка `PASS  У каждого теста есть слой — N тестов` или `FAIL  У каждого теста есть слой — без слоя: <имена через «; »>`. Это пятая сквозная проверка: в итоге `total = tests.length - skipped + 5`.

- [ ] **Step 5: Проверить**

Run: `python3 tools/check_test_layers.py` → `RESULT pass`.
Run: `python3 tools/run_api_tests.py` → `RESULT pass`, `PASS  У каждого теста есть слой`.
Run: `python3 tools/run_api_tests.py --fixture one-domain` → `RESULT pass`. Пропусков может стать больше прежних 166: тесты `vms.talk/1`, `vms.edge/1`, `vms.subdetector/1` теперь пропускаются по профилю. Новых `FAIL` быть не должно.
Run: `node tools/api_tests_registry.mjs | python3 -c "import json,sys,collections; print(collections.Counter(t['layer'] for t in json.load(sys.stdin)['tests']))"` → число тестов по слоям; исполнитель записывает его в отчёт задачи (понадобится в задаче 7).

- [ ] **Step 6: Commit**

```bash
git add tests/api-*.js tests/harness.js tools/check_test_layers.py
git commit -m "Тесты: тесты API разложены по слоям — механизм, профили, API видео"
git pull --rebase && git push
```

### Task 4: Необъявленная операция — пропуск на стенде бэкенда

Это ответ на «39 сбоев `NO_ROUTE`»: тест вызвал операцию, которой система нет в `capabilities.operations`, и не назвал её в `needs`.

**Files:**
- Modify: `tests/harness.js` (`raw`, `env.stream`, цикл тестов в `run`)
- Modify: `tools/check_test_layers.py` (раздел «Необъявленная операция»)

**Interfaces:**
- Consumes: `ConsolemTestLayers.undeclaredOperation` (задача 1); `CAPS`; `apiBase`.
- Produces: класс `Undeclared extends Error` с полем `op` (внутри harness). Пропущенный так тест попадает в `waived`, как тест необъявленного профиля.

- [ ] **Step 1: Написать проверку в `tools/check_test_layers.py`**

`check_undeclared()`: копия `tests/`, как в задаче 2. В ней — файл `api-zz-guard.js` со слоем `mechanism` и одним тестом `«защита: необъявленная операция»` без `needs`. Тест выполняет `makeEnv()`, затем `env.ok("GET", "/licenses")`. В `one-domain` нет `listLicenses`. Запуск: `python3 tools/run_api_tests.py --tests <копия> --fixture one-domain --only "защита: необъявленная операция"`. Ожидание:
- строка `FAIL  [механизм] защита: необъявленная операция — тест вызвал операцию listLicenses, которую система не объявила; назвать её в needs`. До задачи 5 метки `[механизм]` в строке нет. Проверка ищет подстроку от «защита:», а метку проверяет задача 5;
- `RESULT fail`.

Второй тест того же файла, `«защита: адрес вне контракта»`, вызывает `env.call("GET", "/no-such-thing")` и ждёт `404 NO_ROUTE`. Его прогон с `--only` → `PASS`.

- [ ] **Step 2: Убедиться, что проверка падает**

Run: `python3 tools/check_test_layers.py` → `FAIL` в разделе «Необъявленная операция»: сейчас тест падает со словами `GET /licenses → 404 NO_ROUTE`.

- [ ] **Step 3: Защита в `tests/harness.js`**

- `raw()` и `env.stream()` до отправки зовут `ConsolemTestLayers.undeclaredOperation(spec, CAPS, method, path)`. Если ответ не `null`, они бросают `Undeclared(op)`. Пока `CAPS` не прочитан (пробный `/test/reset`), защита не работает.
- В цикле тестов `Undeclared` ловят отдельно от `Failure`:
  - встроенный сервер (`!apiBase || apiBase === "loopback"`) — `FAIL … — тест вызвал операцию <op>, которую система не объявила; назвать её в needs`. Это ошибка теста на нашей стороне;
  - стенд бэкенда — `SKIP … — система не объявила операцию <op>; тест не назвал её в needs`, `skipped += 1`, `t.needs` уходят в `waived`.
- Сквозная проверка «Неподдержанные операции отвечают 404 NO_ROUTE» по-прежнему зовёт `api.raw` мимо защиты.

- [ ] **Step 4: Проверить**

Run: `python3 tools/check_test_layers.py` → `RESULT pass`.
Run: `python3 tools/run_api_tests.py` и `python3 tools/run_api_tests.py --fixture one-domain` → `RESULT pass`. Если `one-domain` дал новый `FAIL` «тест вызвал операцию …», значит, тест не назвал операцию в `needs`. Это сбой, который у w2c выглядел как `NO_ROUTE`: дописать операцию в `needs` этого теста (или условие `ApiTest.can`) и назвать тест в отчёте задачи.

- [ ] **Step 5: Commit**

```bash
git add tests/harness.js tests/api-*.js tools/check_test_layers.py
git commit -m "Тесты: необъявленная операция — SKIP на стенде бэкенда, FAIL на встроенном сервере"
git pull --rebase && git push
```

### Task 5: Отчёт по слоям и отбор `?layer=`

**Files:**
- Modify: `tests/harness.js` (метка в строках, `LAYER`, `?layer=`, `finish`)
- Modify: `tests/api.html` (`<pre id="apitest-layers">` сразу после `#apitest-summary`; абзац о слоях и `?layer=`)
- Modify: `tools/run_api_tests.py` (`--layer`, печать блока)
- Modify: `tools/check_test_layers.py` (раздел «Отчёт»)

**Interfaces:**
- Consumes: реестр слоёв (задача 3), `DECLARED` (задача 2), `layerTitle`.
- Produces: строки `LAYER …` (формат — Interfaces), блок `#apitest-layers`, `console.log("APITEST LAYER …")`. Тело `?report=` — строки тестов, потом строки `LAYER`, итог, `RESULT …`. Параметры `?layer=` и `--layer`.

- [ ] **Step 1: Написать проверку отчёта в `tools/check_test_layers.py`**

`check_report()` — прогоны настоящей папки `tests`:
1. `run_api_tests.py --fixture one-domain --layer profile:vms.edge/1` → `RESULT pass`; каждая строка теста начинается с `SKIP  [vms.edge/1] ` и кончается на `— профиль vms.edge/1 не объявлен`; есть строка `LAYER vms.edge/1 — не объявлен, пропущено <N>`, где `N` — число тестов `vms.edge/1` из реестра; есть `INFO  Покрытие операций проверяется только при полном прогоне`.
2. `run_api_tests.py --layer profile:vms.nosuch/1` → `RESULT fail`, строка `FAIL  Отбор слоёв — нет тестов слоя profile:vms.nosuch/1`.
3. `run_api_tests.py --layer Mechanism` → `RESULT fail`, строка `FAIL  Отбор слоёв — неизвестный слой «Mechanism»`.
4. `run_api_tests.py --layer mechanism --only "Чтение: каждая коллекция отдаёт столько записей, сколько в эталонном наборе"` → `PASS  [механизм] Чтение: …`, `LAYER механизм — прошли 1, не прошли 0, пропущено 0`, `RESULT pass`.
5. Защита задачи 4: строка начинается с `FAIL  [механизм] защита:`.

- [ ] **Step 2: Убедиться, что проверка падает**

Run: `python3 tools/check_test_layers.py` → `FAIL` в разделе «Отчёт».

- [ ] **Step 3: Реализовать в `tests/harness.js`**

- Строки тестов: `PASS  [${layerTitle(t.layer)}] ${t.name}…`, так же `FAIL` и `SKIP`.
- `?layer=`: `params.get("layer")` → список через запятую. Если `parseLayer` какого-то элемента `null` → `FAIL  Отбор слоёв — неизвестный слой «x»` и `finish` с итогом «Тесты API не запущены: неизвестный слой». Слой есть, но тестов у него нет → `FAIL  Отбор слоёв — нет тестов слоя x` и тот же выход. Тесты вне отбора не идут и строк не дают. `only` и `layer` вместе — оба отбора сразу.
- При отборе слоёв сверка схем и проверка `NO_ROUTE` идут, как обычно. Проверка покрытия не идёт: вместо неё `INFO  Покрытие операций проверяется только при полном прогоне`. При `only` — как сейчас: выход после сверки схем.
- Строки `LAYER` — после сквозных проверок, до итога. Порядок: механизм, профили по `id`, API видео. Слой в строке есть, если в прогоне был хоть один его тест. Профиль, у которого `DECLARED` нет записи или все тесты пропущены по `profile:`, получает строку `LAYER <id> — не объявлен, пропущено K`. Объявленный профиль — `LAYER <id> <version> — прошли N, не прошли M, пропущено K`. Если `version` равна `null`, она не пишется. Механизм и API видео — `LAYER механизм — прошли …`.
- `finish(lines, layerLines, summary, failed)`: `layerLines` уходят в `#apitest-layers`, в консоль (`APITEST LAYER …`) и в тело `?report=` перед итогом.

- [ ] **Step 4: `tools/run_api_tests.py`**

В кортеж флагов — `"layer"`. После лога и перед итогом печатается содержимое `<pre id="apitest-layers">`. В строке документа: `[--layer mechanism,profile:vms.camera/1]` и одна строка, что это значит.

- [ ] **Step 5: `tests/api.html`**

`<pre id="apitest-layers"></pre>` после `#apitest-summary`. Абзац перед итогом — простым языком: «Каждый тест проверяет один слой: механизм, профиль или API видео. Тесты профиля, который система не объявила, консоль пропускает. Под итогом — итог по каждому слою. Проверить только часть слоёв — `?layer=mechanism,profile:vms.camera/1`.»

- [ ] **Step 6: Проверить**

Run: `python3 tools/check_test_layers.py` → `RESULT pass`.
Run: `python3 tools/run_api_tests.py` → `RESULT pass`, строки `LAYER` у механизма, у 17 профилей (у тех, у кого есть тесты) и у API видео, ни одного «не объявлен».
Run: `python3 tools/run_api_tests.py --fixture one-domain` → `RESULT pass`, «не объявлен» у `vms.edge/1` и `vms.subdetector/1`. Тест разговора (`vms.talk/1`) — слой `video`, он пропускается по `implements:vms.talk/1` внутри `LAYER API видео`.

- [ ] **Step 7: Commit**

```bash
git add tests/harness.js tests/api.html tools/run_api_tests.py tools/check_test_layers.py
git commit -m "Тесты: отчёт тестов API по слоям — строки LAYER, отбор ?layer=, run_api_tests.py --layer"
git pull --rebase && git push
```

### Task 6: `check_api.py` — слой у каждого теста API

**Files:**
- Modify: `tools/check_api.py` (новая `check_test_layers`, вызов в `main`, `TESTS = cli_paths.opt("tests", "tests")`, пункт 9 в строке документа)
- Modify: `tools/check_test_layers.py` (раздел «Порча»)

**Interfaces:**
- Consumes: `node tools/api_tests_registry.mjs --api API --tests TESTS` (задача 2); файлы `api/profiles/*.json` (часть 02: `id`, `version`).
- Produces: `check_test_layers(rep, tests=TESTS, api=API) -> None`, строка отчёта `Слой у каждого теста API`. Функцию можно импортировать: `check_test_layers.py` зовёт её напрямую.

- [ ] **Step 1: Написать проверку порчи в `tools/check_test_layers.py`**

`check_spoiled()` по образцу `check_outline.py`: копия `tests/` (как в задаче 2), в ней одна порча за раз, затем `check_api.check_test_layers(rep, tests=<копия>)` с `Report`, который собирает строки. Проверка требует `FAIL` с нужными словами:

| Порча | Слова в отказе |
|---|---|
| из `api-bulk.js` убран вызов `fileLayer` | `без слоя` и имя теста `api-bulk.js` |
| у теста `api-view.js` «Реле: команда output…» `layer: "Mechanism"` | `неизвестный слой` |
| `fileLayer("profile:vms.nosuch/1")` в `api-export.js` | `нет файла профиля api/profiles/vms.nosuch.json` |
| `since: "1.0"` у теста со слоем `mechanism` | `since — только у теста профиля` |
| `since: "1.x"` у теста профиля | `since — вида M.m` |
| `since: "99.0"` у теста `profile:vms.camera/1` | `старше версии профиля` |
| `since: "2.0"` у теста `profile:vms.camera/1` | `старшая версия since не совпадает с /1` |

Нетронутая копия → `PASS  Слой у каждого теста API`.

- [ ] **Step 2: Убедиться, что проверка падает**

Run: `python3 tools/check_test_layers.py` → `FAIL` в разделе «Порча» (`check_test_layers` нет в `check_api.py`).

- [ ] **Step 3: Реализовать `check_test_layers` в `tools/check_api.py`**

Функция запускает реестр. Код выхода реестра не 0 → `rep.fail` с его stderr. Проблемы (`rep.check("Слой у каждого теста API", problems, note)`):
- тест без слоя; слой не проходит `^(mechanism|video|profile:[A-Za-z0-9_.-]+/[0-9]+)$`;
- `profile:<id>`: нет файла `api/profiles/<id без /N>.json` или в нём `id` не равен `<id>`;
- `since` у слоя не профиля; `since` не `^\d+\.\d+$`; старшая цифра `since` не равна `N` из `/N`; `since` старше `version` файла профиля (сравнение по числам).

`note` — число тестов по слоям: `механизм 230, API видео 60, профилей 14`. Числа исполнитель берёт из прогона.

Строки `INFO` (провалом не считаются):
- `Тесты механизма на видах набора: N — <файл: число, …>` — тесты `mechanism`, у которых в `needs` есть `kind:`, `type:`, `prop:`, `cap:`, `under:` или `implements:` с видом или профилем не из тестовых (`test.*`). Это перечень работы для части 04;
- `Профили без тестов: <id, …>` — файлы `api/profiles/*.json`, на которые не ссылается ни один тест.

В `main()` вызов идёт после `check_server`. В строку документа (`"""…"""`) добавить пункт 9.

- [ ] **Step 4: Проверить**

Run: `python3 tools/check_test_layers.py` → `RESULT pass`.
Run: `python3 tools/check_api.py` → `PASS  Слой у каждого теста API — …`, `RESULT pass`.

- [ ] **Step 5: Commit**

```bash
git add tools/check_api.py tools/check_test_layers.py
git commit -m "Тесты: check_api.py — слой у каждого теста API; проверка проверки в check_test_layers.py"
git pull --rebase && git push
```

### Task 7: Документы, правила, уведомление w2c и полные проверки

**Files:**
- Modify: `api/TESTS.md`: раздел 1 — слои, правило раскладки (кратко, со ссылкой на этот план), условия `profile:` и `since` в абзаце о `needs`, причины `SKIP`, `?layer=`, строки `LAYER`, столбец «Слой» в таблице файлов, новые итоги «Итого N» для `demo` и `one-domain` с разбивкой по слоям, пятая сквозная проверка; раздел 4 — строка «Слой у каждого теста API»; «Коротко» — строка `tools/check_test_layers.py` (кому: тем, кто правит `tests/harness.js`, `tests/layers.js`, реестр)
- Modify: `api/BACKEND.md` — «Тестовый стенд» (`&layer=`) и «Когда готово»: готовность по слоям. Механизм — `LAYER механизм` без «не прошли». Каждый объявленный профиль — его строка `LAYER` без «не прошли». API видео — только если система его объявила. Пропуски «не объявлен» провалом не считаются. Пропуск «система не объявила операцию …; тест не назвал её в needs» — вопрос к mockup, не к бэкенду
- Modify: `api/README.md`, «Возможности системы»: одно предложение, что тесты идут по слоям и тест необъявленного профиля пропускается (ссылка на `TESTS.md`)
- Modify: `api/profiles/README.md` (часть 02): тесты профиля — слой `profile:<id>`; новое поле со `since` получает тест со `since`
- Modify: `.claude/skills/api-contract/SKILL.md`: в «Порядке правки контракта», п. 1, после «тесты `tests/api-*.js`» — «у нового теста — слой (`ApiTest.fileLayer` файла или свой `layer`, `api/TESTS.md`, раздел 1); тест поля новой младшей версии профиля — со `since`»
- Create: `api/requests/<date -u +%F-%H%M%SZ>-owner-tests-by-layer-request.md`; Modify: `api/requests/README.md` (строка таблицы)

**Interfaces:**
- Consumes: всё из задач 1–6; число тестов по слоям (отчёт задачи 3).
- Produces: документы, по которым бэкенд читает отчёт.

- [ ] **Step 1: Документы**

Правки по списку Files. Тексты — по `docs/TEXTS.md`. Числа — из прогонов задачи 5 (`demo` и `one-domain`).

- [ ] **Step 2: Полные проверки**

Run: `python3 tools/check_api.py` → `RESULT pass`.
Run: `python3 tools/check_test_layers.py` → `RESULT pass`.
Run: `python3 tools/run_api_tests.py`, `--fixture one-domain`, `--fixture one-domain --clock real` → `RESULT pass`. У часов по-настоящему остаётся известный провал «Поток: … ветка вне наблюдения — tree.changed» (`api/TESTS.md`, раздел 1), других провалов нет.
Run: `python3 tools/check_loopback.py` → `RESULT pass`.
Run: `python3 tools/check_stand.py` → `RESULT pass`; в хвосте отчёта тестов API видны строки `LAYER`.
Run: `python3 tools/check_ui.py` → `RESULT pass`. Интерфейс не менялся, проверка — по общей договорённости.
Run: `python3 tools/check_perf.py --quick` → без нового `FAIL`; при `FAIL` — порядок `api/TESTS.md`.

- [ ] **Step 3: Commit документов и правил**

```bash
git add api/TESTS.md api/BACKEND.md api/README.md api/profiles/README.md
git commit -m "API: тесты по слоям — механизм, профили, API видео; TESTS.md, BACKEND.md «Когда готово»"
git add .claude/skills/api-contract/SKILL.md
git commit -m "Правила: api-contract — у нового теста API есть слой, тест поля новой версии профиля — со since"
git pull --rebase && git push
```

- [ ] **Step 4: Уведомление w2c**

Файл по скиллу `vms-requests`: `Кому: w2c`, `Статус: новый`, коммит — тот, что ушёл в `origin/main` на шаге 3. Пункты с номерами:
1. Тесты API идут по слоям: механизм, профили, API видео. Как читать строки `LAYER` и метки `[…]`.
2. Ответ на вопрос 2 позиции w2c: бэкенд без видео не получает тестов видео как сбоев. Тесты видео пропускаются по операциям, которые система не объявила. Отдельный признак «API видео объявлен» появится после ответа на В2.
3. Ответ про 39 сбоев `NO_ROUTE`: на стенде бэкенда необъявленная операция теперь даёт `SKIP` с именем операции. Просьба: прогнать `tests/api.html?api=<стенд>` и прислать имена тестов из строк «тест не назвал её в needs». mockup допишет им `needs`.
4. Как проверить себя по шагам: `&layer=mechanism`, затем `&layer=mechanism,profile:vms.camera/1`.

Строка в таблице `api/requests/README.md`.

```bash
git add api/requests/
git commit -m "API: уведомление w2c — тесты по слоям, необъявленная операция — SKIP"
git pull --rebase && git push
```

---

## Открытые вопросы владельцу

1. **Версия контракта.** `api/openapi.json` в этой части не меняется, поэтому план не поднимает версию и не пишет «Что добавлено в X.Y.Z». Новый параметр `&layer=` и «Когда готово» по слоям меняют то, как бэкенд проверяет готовность (`api/BACKEND.md`). Если для этого нужна своя версия, задача 7 получает её («следующая младшая после origin/main») и раздел в `api/README.md`.
2. **Учётки потоков** (`/stream-accounts…`, `feature:streamGrants`). Профиля у них нет, а в таблице предложения они стоят среди настроек подсистем, не среди видео. План даёт им слой `video`: это доступ к потокам камер. Другой вариант — свой профиль в части 04.
3. **Признак «API видео объявлен».** До ответа w2c на В2 тесты видео пропускаются только по операциям, которые система не объявила. Если ответ даст `capabilities.videoApi {url, version}`, слой `video` получит своё условие и свою версию, как профиль. Это правка `tests/layers.js` и `harness.js` в части про API видео (п. 11), не здесь.

## Что не входит

- Отдельный API видео (п. 11 переработки): своя версия, свой контракт, перенос путей. Здесь только метка `video` у тестов.
- Набор для системы без видов VMS (например, `core` из одних тестовых видов) и перенос тестов механизма с камер на тестовые виды. Перечень таких тестов — строка `INFO` в `check_api.py`, работа — часть 04.
- Новая раскладка тестов, когда часть 04 переносит поиск в сети, сценарии, ретрансляторы и справочники в профили. Домен — общее понятие «область системы» (ответ на вопрос 10); если часть 04 сделает его механизмом, тесты «Домен:» получат `mechanism`.
- Пути профилей вне `openapi.json` (п. 7) и разбиение `api/profiles.js` (п. 8). Покрытие операций по слоям: покрытие считается по-прежнему, по всем объявленным операциям.
- Сценарии интерфейса `tests/ui-*.js` и самопроверка `?selftest` по слоям: против стенда с частью контракта они по-прежнему не идут (`api/TESTS.md`, «Чего проверки не покрывают»).
- Новые утверждения в тестах и тесты на поля профилей по версиям. `since` появляется у теста вместе с новым полем профиля, по правилам части 01.
