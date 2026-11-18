# Часть 02. Профили отдельными файлами: версия и зависимости — план работ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** каждый из 17 профилей `vms.*` описан своим файлом `api/profiles/<имя>.json` с младшей версией, хозяином, проверяющими и зависимостями; `GET /kinds` отдаёт `version` и `uses`; `tools/check_api.py` проверяет профили (пп. 1–3 раздела «Что проверяет `tools/check_api.py`»); таблицы профилей в `api/BACKEND.md` и `api/README.md` заменены собранными таблицами `api/profiles/<имя>.md`; `index.html` при незнакомой старшей версии профиля открывает форму по схеме.

**Architecture:** источник истины — файлы `api/profiles/*.json`. `tools/build_api.py` собирает из них раздел `profiles` в `api/fixtures/demo.json` (сам файл набора остаётся, раздел становится собранным), затем наборы `one-domain`, `large`, `xl` (`tools/profile_fixture.py`), таблицы `api/profiles/*.md`, `api/openapi.js` и `api/fixture.js`. Сервер (`api/server.js`, `api/kinds.js`) отдаёт профили набора как есть и не меняется. Разбор файлов, запись для `GET /kinds`, таблица и проверки — чистые функции нового модуля `tools/profile_files.py` с самопроверкой `tools/check_profile_files.py`.

**Tech Stack:** Python 3 (инструменты), JSON, Node.js (сервер, тесты API), headless Chrome (`tools/check_ui.py`).

**Spec:** [`docs/contract-layers/2026-11-16-kontrakt-i-podsistemy-predlozhenie.md`](../2026-11-16-kontrakt-i-podsistemy-predlozhenie.md) — пп. 2, 4, 5 «Что предлагаем», раздел «Где лежит профиль» целиком, пп. 2, 4, 9 таблицы «Что придётся переработать». Позиция w2c по вопросам 5 и 8 — [запрос](../../../api/requests/2026-11-18-114831Z-w2c-contract-layers-request.md), [ответ](../../../api/requests/2026-11-18-114831Z-w2c-contract-layers-response.md).

> **Сверка с общим планом** ([00-master.md](00-master.md), раздел «Сверка частей» — главнее текста ниже):
>
> - С2 — **задача 7 снята**, её делает задача 1 части 07; часть кончается задачей 6;
> - С7 — `reviewers: ["w2c"]` у всех профилей до ответа владельца на О1 (не `["w2c","NGP"]`);
> - О2 — если владелец принял снятие поля младшей версией, формат файла получает `changes[].removed` (часть 07, задача 7), и `history_problems` его учитывает.

**Почему `demo.json` сохраняет раздел `profiles`.** Макет открывается с диска и на GitHub Pages без сервера: данные приходят из заранее собранного `api/fixture.js`. Раздел `profiles` в `demo.json` читают сервер, тесты (`FX.profiles`), `check_api.py`, `profile_fixture.py`, стенд `tools/serve_api.mjs` и w2c (копия `kinds.json`). Если раздел убрать, каждому из них пришлось бы читать папку. Поэтому раздел остаётся, но его пишет `build_api.py`, а руками его не правят.

## Global Constraints

- Версия контракта — «следующая младшая после `origin/main`» (далее `X.Y.Z`). Одна версия на задачи 3–5: их коммиты уходят одним push в конце задачи 5. В `api/README.md` — раздел «Что добавлено в X.Y.Z» над «Что добавлено в 0.23.0» (или над последним таким разделом в `origin/main`), `info.version` в `api/openapi.json`.
- Файл профиля — `api/profiles/<id без /N>.json` (`vms.camera.json`). Ключи — ровно: `id`, `version`, `label`, `owner`, `reviewers`, `uses`, `properties`, `status` (необязательный), `apis` (необязательный), `changes`. Поле `properties`/`status` — `{имя: {schema, meaning, since}}`.
- Формат версии — `"M.m"` (`^[0-9]+\.[0-9]+$`), `M` равно номеру после `/` в `id`. Сравнение — по числам: `1.10` новее `1.9`.
- Начальные значения у всех 17 профилей: `version: "1.0"`, `since: "1.0"` у каждого поля, `changes: [{"version": "1.0", "what": "Профиль перенесён в файл из api/fixtures/demo.json и api/BACKEND.md, контракт X.Y.Z. Поля до переноса — с 1.0; когда какое поле появилось в контракте — api/README.md, «Что добавлено в …»"}]`, `owner: "mockup"`, `reviewers: ["w2c", "NGP"]`.
- Схема `Profile` в `api/openapi.json` получает необязательные поля `version` (string, тот же шаблон) и `uses` (массив `ProfileUse {id, version}`, оба обязательны, `additionalProperties: false`). Остальное в `Profile` не меняется: `properties`, `status`, `apis` в ответе остаются массивами имён.
- Запись профиля в `GET /kinds` (и в `demo.json`) — `profile_wire(doc)`: `id`, `label` = `{"key": "profile.<id>", "text": <label файла>, "lang": "ru"}`, `version`, `uses` (только если не пуст), `properties` (имена в порядке файла), `status` (только если не пуст), `apis` (только если есть). Порядок профилей — по имени файла.
- `api/fixtures/demo.json` пишется как `json.dumps(fx, ensure_ascii=False, indent=1) + "\n"` — так он записан сейчас, дифф должен трогать только раздел `profiles`.
- Не меняются: `api/profiles.js` (поведение стенда), `api/server.js`, `api/kinds.js`, пути профилей в `openapi.json` (п. 7 переработки).
- Граница «механизм или подсистема» и её проверка (п. 4 раздела «Что проверяет `tools/check_api.py`») — в части 01; правила процесса (кто ведёт, кому уведомление) — тоже в части 01. Здесь — только упоминание и ссылка.
- `index.html` меняется только через прототип `index_NN_profil-starshaya-versiya.html` (NN — по правилу `CLAUDE.md`) и перенос по скиллу `proto-promote`.
- Проверки после правки `api/`: `python3 tools/check_api.py`, `python3 tools/run_api_tests.py`, `python3 tools/check_ui.py`, `python3 tools/check_perf.py --quick`. Прототип — `python3 tools/check_ui.py --page <файл>`.
- Коммиты — по `CLAUDE.md`, с подписью `Co-Authored-By` из системного напоминания; затем `git pull --rebase && git push`.

## Review Focus

1. **Сборка повторяется без изменений.** Второй `python3 tools/build_api.py` подряд ничего не пишет, `--check` сразу после сборки проходит, `git diff` трогает в `demo.json` только раздел `profiles` — тест в задаче 3, шаг 8.
2. **Набор с частью полей.** `one-domain` и `large` отдают `vms.detector/1` без полей 0.12.0–0.17.0 (`DROP_PROPS` в `profile_fixture.py`): это законно («вид несёт те, что у него есть»), а лишнее имя или другая `version` — ошибка — тест `fixture_profile_problems` в задаче 2.
3. **Вид сужает тип.** У `archive.local` поле `provider` — `null`, в профиле — `string | null`: проходит; вид, который расширяет тип (`string | null` против `string`), — ошибка — тест `kind_problems` в задаче 2.
4. **Нет git или нет `origin/main`.** `check_api.py --api <копия>` и запуск вне git не падают на п. 2, а пишут `INFO`-пропуск, как «Ломающие изменения против контракта старого макета» — тест в задаче 3, шаг 10.
5. **Вид с кодом `camera` и только `vms.camera/2`.** Открывается формой по схеме, в срезе «Камеры» не теряется и не открывает ручной экран; вид с `vms.camera/1` и `vms.camera/2` сразу остаётся камерой — сценарий в задаче 7.

---

### Task 1: Модуль файлов профиля — разбор, версии, запись для `GET /kinds`, таблица

**Files:**
- Create: `tools/profile_files.py`
- Create: `tools/check_profile_files.py` (самопроверка в стиле `tools/check_outline.py`: `ok(cond, what)` печатает `PASS`/`FAIL`, код выхода 1 при сбое)

**Interfaces:**
- Consumes: —
- Produces (`tools/profile_files.py`):
  - `PROFILES_DIR = "profiles"` — папка внутри папки API;
  - `FILE_KEYS = ("id", "version", "label", "owner", "reviewers", "uses", "properties", "status", "apis", "changes")`, `REQUIRED_KEYS` — все, кроме `status` и `apis`;
  - `parse_version(v: str) -> tuple[int, int]` — `ValueError` на всё, кроме `M.m`;
  - `major_of(pid: str) -> int`, `profile_name(pid: str) -> str` (`"vms.camera/1"` → `1`, `"vms.camera"`);
  - `load_profiles(api_dir: str) -> list[dict]` — все `*.json` папки `<api_dir>/profiles`, по имени файла; в каждом документе служебный ключ `"_file"` (имя файла) — его `profile_wire` и проверки не выводят;
  - `profile_problems(doc: dict) -> list[str]` — формат одного файла;
  - `profile_wire(doc: dict) -> dict` — запись для `GET /kinds` (Global Constraints);
  - `type_sig(schema: dict) -> tuple` — `(frozenset типов, type_sig(items) или None, x-ref {implements, kinds} или None)`;
  - `type_text(schema: dict) -> str` — тип словами для таблицы;
  - `render_md(doc: dict, kinds: list[str]) -> str` — таблица для людей.

- [ ] **Step 1: Записать тесты в `tools/check_profile_files.py`**

Образец `GOOD` — профиль камеры из раздела «Где лежит профиль» предложения, версия `1.5`: свойства `archiveId` (`{"type": ["string", "null"], "x-ref": {"implements": ["vms.archive/1"]}}`, since `1.0`) и `privacyMasks` (`{"type": "array", "maxItems": 16, "items": {"type": "object"}}`, since `1.3`), состояние `recordState` (since `1.0`), `apis: ["recording-target", "recording-days"]`, `uses: [{"id": "vms.archive/1", "version": "1.0"}]`, `changes` — `1.5`, `1.3`, `1.0`, `_file: "vms.camera.json"`. Каждая порча — копия `GOOD` с одной правкой:

```python
ok(parse_version("1.5") == (1, 5) and parse_version("1.10") > parse_version("1.9"), "версия — числа")
ok(raises(ValueError, parse_version, "1") and raises(ValueError, parse_version, "1.x"), "версия не M.m — ошибка")
ok(major_of("vms.camera/1") == 1 and profile_name("vms.camera/1") == "vms.camera", "имя и старшая версия из id")
ok(profile_problems(GOOD) == [], "образец без ошибок")
ok(says(profile_problems(bad(_file="vms.cam.json")), "имя файла"), "файл не по имени профиля")
ok(says(profile_problems(bad(version="2.0")), "старшая"), "старшая в version не та, что в id")
ok(says(profile_problems(bad_prop("archiveId", since="1.6")), "since"), "since новее version")
ok(says(profile_problems(bad_prop("privacyMasks", since="1.2")), "changes"), "since без строки changes")
ok(says(profile_problems(bad(changes=[{"version": "1.4", "what": "…"}])), "changes"), "первая строка changes — не version")
ok(says(profile_problems(bad_prop("archiveId", meaning="")), "meaning"), "пустой смысл")
ok(says(profile_problems(bad(owners="mockup")), "owners"), "незнакомый ключ")
ok(says(profile_problems(bad(uses=[{"id": "vms.camera/1", "version": "1.0"}])), "сам"), "профиль использует сам себя")
ok(says(profile_problems(bad(uses=[{"id": "vms.archive/1", "version": "2.0"}])), "vms.archive/1"), "версия зависимости не своей старшей")
w = profile_wire(GOOD)
ok(w == {"id": "vms.camera/1", "label": {"key": "profile.vms.camera/1", "text": "Камера", "lang": "ru"}, "version": "1.5",
         "uses": [{"id": "vms.archive/1", "version": "1.0"}], "properties": ["archiveId", "privacyMasks"],
         "status": ["recordState"], "apis": ["recording-target", "recording-days"]}, "запись GET /kinds")
ok("uses" not in profile_wire(bad(uses=[])) and "status" not in profile_wire(bad(status={})), "пустые uses и status не выводятся")
ok(type_text({"type": ["string", "null"], "x-ref": {"implements": ["vms.archive/1"]}}) == "string | null — uid (`vms.archive/1`)", "тип ссылки")
ok(type_text({"type": "array", "items": {"type": "string"}}) == "массив string", "массив")
ok(type_text({"type": "string", "enum": ["a", "b"]}) == "string: `a`, `b`", "перечень")
ok(type_text({"type": "boolean", "readOnly": True}) == "boolean (только чтение)", "только чтение")
ok(type_text({"type": "string", "writeOnly": True}) == "string (секрет)", "секрет")
md = render_md(GOOD, ["camera"])
ok(md.startswith("<!-- Собрано tools/build_api.py из api/profiles/vms.camera.json — руками не править -->\n# `vms.camera/1` — Камера\n"), "шапка таблицы")
ok("| `privacyMasks` |" in md and "| 1.3 |" in md and "## Состояние (`status.observed`)" in md and "## Изменения" in md, "разделы таблицы")
```

`raises`, `says(problems, word)` (хоть одна строка содержит слово), `bad(**kw)`, `bad_prop(name, **kw)` — помощники самопроверки.

- [ ] **Step 2: Запустить — тесты падают**

Run: `python3 tools/check_profile_files.py`
Expected: падает на `import profile_files` (`ModuleNotFoundError`).

- [ ] **Step 3: Написать `tools/profile_files.py`**

Правила, которых тесты не задают полностью:
- `profile_problems`: ключи — только `FILE_KEYS`, все `REQUIRED_KEYS` на месте; `id` — `^[A-Za-z0-9_.-]+/[0-9]+$`; `_file == profile_name(id) + ".json"`; `label`, `owner` — непустые строки; `reviewers` — непустой список непустых строк; у каждого поля `properties` и `status` ключи ровно `schema` (объект с `type`), `meaning` (непустая строка), `since` (версия своей старшей, не новее `version`); `changes` — непустой список `{version, what}` строго по убыванию, первая строка — `version`, каждое значение `since` есть среди версий `changes`; `uses` — `{id, version}` без повторов и без своего `id`, `major_of(id) == parse_version(version)[0]`; `apis` — список строк без повторов.
- `type_text`: типы через ` | `; `enum` — `тип: `a`, `b``; массив — `массив ` + тип элемента; `maxItems` — `, до N`; `x-ref` — ` — uid (`профиль`)` для `implements` или ` — uid (вид)` для `kinds`; хвосты ` (только чтение)`, ` (секрет)`.
- `render_md`: строка «Версия 1.5 · ведёт: mockup · смотрят правку: w2c, NGP», строка «Использует: `vms.archive/1` с 1.0» (нет — «—»), строка «Виды эталонного набора: `camera`. Предметные пути: `/units/{uid}/recording-target`, …» (без путей — без второго предложения); затем таблицы `## Свойства` и `## Состояние (`status.observed`)` с колонками «Свойство | Тип | Смысл | С версии» (пустой раздел — строка «Своих свойств нет.»), `## Изменения` — «Версия | Что».

- [ ] **Step 4: Запустить — тесты проходят**

Run: `python3 tools/check_profile_files.py`
Expected: все строки `PASS`, код выхода 0.

- [ ] **Step 5: Коммит**

```bash
git add tools/profile_files.py tools/check_profile_files.py
git commit -m "Тесты: профили в файлах — разбор, версии, запись GET /kinds и таблица (tools/profile_files.py)"
git pull --rebase && git push
```

### Task 2: Проверки профилей 1–3 — чистые функции

**Files:**
- Modify: `tools/profile_files.py`
- Modify: `tools/check_profile_files.py`

**Interfaces:**
- Consumes: `parse_version`, `major_of`, `type_sig`, `profile_wire` (задача 1).
- Produces:
  - `type_fits(kind_schema: dict, profile_schema: dict) -> bool` — типы вида ⊆ типов профиля, у массива — то же для `items`, `x-ref` равны;
  - `kind_problems(docs: list[dict], kinds: list[dict], whole: bool) -> list[str]` — п. 1: у каждого вида с профилем из `docs` в `implements` каждое поле профиля, которое есть в схеме вида, проходит `type_fits`; при `whole` (эталонный набор) — ещё каждое поле профиля есть хотя бы у одного такого вида;
  - `fixture_profile_problems(fixture_profiles: list[dict], docs: list[dict], whole: bool) -> list[str]` — профили набора против файлов: при `whole` запись равна `profile_wire(doc)` и множества `id` равны; иначе `id` есть среди файлов, `version` та же, `properties`, `status`, `apis` — подмножества;
  - `history_problems(cur: dict, base: dict | None) -> list[str]` — п. 2 против файла в `origin/main`;
  - `uses_problems(docs: list[dict]) -> list[str]` — п. 3.

- [ ] **Step 1: Записать тесты**

```python
cam = {"kind": "camera", "implements": ["vms.camera/1"], "schema": {"type": "object", "properties": {"archiveId": {"type": ["string", "null"], "x-ref": {"implements": ["vms.archive/1"]}}}}}
ok(kind_problems([GOOD], [cam], whole=False) == [], "вид несёт поле того же типа")
ok(says(kind_problems([GOOD], [with_prop(cam, "archiveId", {"type": "integer"})], whole=False), "archiveId"), "другой тип — ошибка")
ok(kind_problems([GOOD], [with_prop(cam, "archiveId", {"type": "null", "x-ref": {"implements": ["vms.archive/1"]}})], whole=False) == [], "вид сужает тип")
ok(says(kind_problems([prop_type(GOOD, "archiveId", "string")], [cam], whole=False), "archiveId"), "вид расширяет тип — ошибка")
ok(says(kind_problems([GOOD], [with_prop(cam, "archiveId", {"type": ["string", "null"], "x-ref": {"implements": ["vms.camera/1"]}})], whole=False), "x-ref"), "ссылка на другой профиль — ошибка")
ok(kind_problems([GOOD], [cam], whole=False) == [] and says(kind_problems([GOOD], [cam], whole=True), "privacyMasks"), "поле профиля ни у одного вида — ошибка только у эталона")
ok(fixture_profile_problems([profile_wire(GOOD)], [GOOD], whole=True) == [], "эталон — запись как из файла")
ok(says(fixture_profile_problems([dict(profile_wire(GOOD), version="1.4")], [GOOD], whole=True), "vms.camera/1"), "эталон отстал от файла")
part = dict(profile_wire(GOOD), properties=["archiveId"])
ok(fixture_profile_problems([part], [GOOD], whole=False) == [], "набор с частью полей")
ok(says(fixture_profile_problems([dict(part, properties=["archiveId", "fps"])], [GOOD], whole=False), "fps"), "лишнее имя — ошибка")
ok(says(fixture_profile_problems([dict(part, version="1.4")], [GOOD], whole=False), "version"), "другая версия — ошибка")
base = GOOD
ok(history_problems(GOOD, None) == [], "нового профиля в origin/main нет")
ok(history_problems(GOOD, base) == [], "без правок")
ok(says(history_problems(add_prop(GOOD, "noiseReduction", since="1.5"), base), "noiseReduction"), "новое поле без новой младшей версии")
ok(history_problems(bump(add_prop(GOOD, "noiseReduction", since="1.6"), "1.6"), base) == [], "новое поле с версией 1.6")
ok(says(history_problems(bump(add_prop(GOOD, "noiseReduction", since="1.5"), "1.6"), base), "since"), "since нового поля — не новее версии в origin/main")
ok(says(history_problems(drop_prop(GOOD, "privacyMasks"), base), "privacyMasks"), "поле снято в той же старшей")
ok(history_problems(as_major2(drop_prop(GOOD, "privacyMasks")), base) == [], "поле снято в vms.camera/2")
ok(says(history_problems(prop_type(GOOD, "archiveId", "string"), base), "archiveId"), "тип поменялся в той же старшей")
ok(says(history_problems(bump(GOOD, "1.4"), base), "1.4"), "версия ниже, чем в origin/main")
ok(says(history_problems(prop_since(GOOD, "archiveId", "1.3"), base), "archiveId"), "since старого поля поменялся")
ok(says(history_problems(dict(GOOD, apis=["recording-target"]), base), "recording-days"), "путь снят в той же старшей")
ok(says(history_problems(dict(GOOD, id="vms.camera/0"), dict(GOOD)), "старш"), "старшая версия уменьшилась")
arch = profile("vms.archive/1", "1.2")
pos = profile("vms.pos/1", "1.0", uses=[{"id": "vms.camera/1", "version": "1.5"}])
ok(uses_problems([GOOD, arch, pos]) == [], "зависимости есть, версии не ниже")
ok(says(uses_problems([GOOD, arch, dict(pos, uses=[{"id": "vms.camera/1", "version": "1.6"}])]), "1.6"), "зависимость младше указанной")
ok(says(uses_problems([as_major2(GOOD), arch, pos]), "vms.camera/2"), "у зависимости новая старшая — касса задета")
ok(says(uses_problems([GOOD, pos]), "vms.archive/1"), "зависимости нет среди профилей")
ok(says(uses_problems([dict(GOOD, uses=[]), arch]), "x-ref"), "x-ref на профиль без строки в uses")
det = profile("vms.detector/1", "1.0", uses=[{"id": "vms.camera/1", "version": "1.0"}])
cam2 = dict(GOOD, uses=GOOD["uses"] + [{"id": "vms.detector/1", "version": "1.0"}])
ok(uses_problems([cam2, arch, det]) == [], "взаимные зависимости разрешены")
```

Помощники `with_prop`, `prop_type`, `add_prop`, `drop_prop`, `prop_since`, `bump(doc, version)` (меняет `version` и дописывает строку в начало `changes`), `as_major2(doc)` (`id` `/2`, `version` `2.0`, `since` всех полей `2.0`, `changes` `[2.0]`), `profile(id, version, uses=[])` — в самопроверке.

- [ ] **Step 2: Запустить — тесты падают**

Run: `python3 tools/check_profile_files.py`
Expected: `AttributeError` на `profile_files.kind_problems`.

- [ ] **Step 3: Написать функции в `tools/profile_files.py`**

Правила `history_problems` при одной старшей: версия не ниже; у старого поля (свойство, состояние) тот же `type_sig` и `since`; снятое поле или путь `apis` — ошибка; новое поле или путь — ошибка, если `version` не новее версии в `base`, и у нового поля `since` новее версии в `base`. Старшая выросла — правки разрешены; старшая уменьшилась — ошибка. Правила `uses_problems`: каждая зависимость — файл с тем же `id`; есть только другая старшая — сообщение называет её (`есть только vms.camera/2`); версия файла не ниже указанной; каждый `x-ref.implements` в схемах полей профиля (вглубь `items` и `properties`), кроме своего `id`, есть в `uses`. Сообщения — с `id` профиля и именем поля.

- [ ] **Step 4: Запустить — тесты проходят**

Run: `python3 tools/check_profile_files.py`
Expected: все строки `PASS`.

- [ ] **Step 5: Коммит**

```bash
git add tools/profile_files.py tools/check_profile_files.py
git commit -m "Тесты: проверки профилей — тип у вида, версия против origin/main, зависимости uses (tools/profile_files.py)"
git pull --rebase && git push
```

### Task 3: Профили в файлах, `version` и `uses` в контракте; сборка и проверки

**Files:**
- Modify: `api/openapi.json` (схемы `Profile`, новая `ProfileUse`, описание `KindsList.profiles`, `info.version`)
- Create: `api/profiles/vms.domain.json`, `vms.server.json`, `vms.folder.json`, `vms.camera.json`, `vms.archive.json`, `vms.volume.json`, `vms.stream.json`, `vms.detector.json`, `vms.subdetector.json`, `vms.acs.json`, `vms.live.json`, `vms.ptz.json`, `vms.talk.json`, `vms.timeline.json`, `vms.pos.json`, `vms.edge.json`, `vms.webserver.json`
- Modify: `tools/build_api.py`, `tools/check_api.py`
- Modify (собираются): `api/fixtures/demo.json` (раздел `profiles`), `api/fixtures/one-domain.json`, `large.json`, `api/fixture.js`, `api/openapi.js`
- Modify: `tests/api-units.js`, `api/README.md`, `api/TESTS.md`

**Interfaces:**
- Consumes: всё из задач 1–2.
- Produces:
  - `tools/build_api.py`: `render_demo() -> str` — текст `demo.json` с разделом `profiles` из `load_profiles(API)` (`[profile_wire(d) for d in docs]`); `main()` в порядке: `demo.json` ← профили → `profile_fixture.py` (подпроцессом, с `--api`; в режиме `--check` не запускается) → `openapi.js`, `fixture.js`. `--check` сообщает `api/fixtures/demo.json: раздел profiles отстал от api/profiles/`;
  - `tools/check_api.py`: `check_profile_files(rep, spec, fixtures: dict[str, dict])` — пять строк отчёта (ниже); параметр `--profiles-base REF` (по умолчанию `origin/main`) — с чем сравнивать п. 2;
  - контракт: `Profile.version`, `Profile.uses`, `ProfileUse {id, version}`.

- [ ] **Step 1: Тест API — `version` и `uses` в `GET /kinds`**

В `tests/api-units.js`, рядом с «/kinds отдаёт все виды набора и ETag…», тест `"Профили X.Y.Z: version и uses в GET /kinds — M.m своей старшей, зависимость не младше указанной"` (`needs: ["listKinds"]`). Поля необязательные, поэтому тест проверяет форму, а не наличие:

```js
const profiles = (await env.ok("GET", "/kinds")).profiles || [];
const VER = /^[0-9]+\.[0-9]+$/, ID = /^[A-Za-z0-9_.-]+\/[0-9]+$/;
const byId = new Map(profiles.map((p) => [p.id, p]));
profiles.forEach((p) => {
  if (p.version !== undefined) assert.ok(VER.test(p.version) && Number(p.version.split(".")[0]) === Number(p.id.split("/")[1]), `${p.id}: version ${p.version} — M.m своей старшей`);
  (p.uses || []).forEach((u) => {
    assert.ok(ID.test(u.id) && VER.test(u.version) && u.id !== p.id, `${p.id}: uses ${JSON.stringify(u)}`);
    const dep = byId.get(u.id);
    if (dep && dep.version) assert.ok(cmp(dep.version, u.version) >= 0, `${p.id} использует ${u.id} ${u.version}, сервер отдаёт ${dep.version}`);
  });
});
return `профилей ${profiles.length}, с версией ${profiles.filter((p) => p.version).length}`;
```

`cmp(a, b)` — сравнение `M.m` числами (помощник в файле).

- [ ] **Step 2: Строки отчёта в `check_api.py` — `check_profile_files`**

Вызов в `main()` после `check_units` для трёх наборов, на `{"demo": fx, "one-domain": profile, "large": large}`. Строки отчёта:
1. `Профили api/profiles/: файлы по формату` — `profile_problems` каждого файла; папки нет — ошибка `нет папки api/profiles`.
2. `Профили: раздел profiles наборов — из файлов` — `fixture_profile_problems` (`demo` — `whole=True`, остальные — `False`).
3. `Профили: виды несут поля профиля того же типа; status объектов — по схеме профиля` — `kind_problems` для трёх наборов; плюс у `demo`: значение `status.observed[имя]` каждого объекта вида профиля проходит `status[имя].schema` (функцией `validate` этого же файла).
4. `Профили: версия против <REF>` — `history_problems` с файлом из `git show <REF>:<API>/profiles/<файл>`; нет git, нет `REF` или `API` не `api` — пропуск строкой `INFO`, как в `check_breaking_doc`.
5. `Профили: зависимости uses есть и не младше` — `uses_problems`.

- [ ] **Step 3: Запустить — проверки падают**

Run: `python3 tools/check_api.py`
Expected: `FAIL Профили api/profiles/: файлы по формату` — `нет папки api/profiles`; `RESULT fail`.

- [ ] **Step 4: Разложить 17 профилей по файлам**

Разовый скрипт в папке scratchpad сессии (в git не идёт) читает `api/fixtures/demo.json` (`profiles`, `kinds`) и `api/BACKEND.md` («Стандартные профили», разделы `#### \`vms.…/1\``) и пишет 17 файлов `json.dumps(doc, ensure_ascii=False, indent=1) + "\n"`:
- `id`, `apis` — из `demo.json`; `label` — `label.text`; начальные `version`, `since`, `changes`, `owner`, `reviewers` — Global Constraints; порядок полей — как в `properties`/`status` `demo.json`;
- `schema` поля — свойство схемы первого по `demo.json` вида с этим профилем в `implements`, только ключи `type`, `enum`, `const`, `format`, `pattern`, `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems`, `items`, `properties`, `required`, `additionalProperties`, `x-ref`, `readOnly`, `writeOnly`, `x-immutable`, `x-transient` (вглубь `items` и `properties`). Если у видов одного профиля типы разные — объединение типов (сейчас одно такое поле: `vms.archive/1` `provider` — `null` у пяти видов, `string | null` у `archive.cloud` → `["string", "null"]`);
- `schema` состояния — по колонке «Тип» `BACKEND.md` вручную (28 полей: `vms.server/1` 5, `vms.camera/1` 13, `vms.volume/1` 4, `vms.acs/1` 1, `vms.edge/1` 3, `vms.webserver/1` 2); строка 3 отчёта `check_api.py` проверит их по объектам набора;
- `meaning` — ячейка «Смысл» `BACKEND.md`; нет строки — `«x-label»: description` из схемы вида (так написаны ячейки `BACKEND.md`). Строк нет у 42 полей: `vms.detector/1` — 11, `vms.pos/1` — 25, `vms.subdetector/1` — 4, у них смысл есть в схеме; `vms.edge/1` `status.mediaOk` и `status.profileG` — смысл написать по `api/profiles.js` и `api/server.js`;
- `uses` — цели `x-ref.implements` из схем полей, кроме своего `id`, версия `"1.0"`: `vms.camera/1` → `vms.archive/1`, `vms.detector/1`; `vms.pos/1` → `vms.camera/1`; `vms.edge/1` → `vms.archive/1`, `vms.camera/1`. Остальные зависимости — задача 4.

Скрипт печатает, сколько смыслов взято из `BACKEND.md`, сколько из схемы и какие поля остались без смысла (ожидаемо: 2).

- [ ] **Step 5: Контракт — `Profile.version`, `Profile.uses`**

В `api/openapi.json`:
- `Profile.properties.version` — `{"type": "string", "pattern": "^[0-9]+\\.[0-9]+$", "description": "Младшая версия профиля, которую сделал сервер: 1.5. Старшая — в id. Нет поля — клиент считает M.0. Файл профиля — api/profiles/<имя>.json"}`;
- `Profile.properties.uses` — `{"type": "array", "items": {"$ref": "#/components/schemas/ProfileUse"}, "description": "От каких профилей и с какой младшей версии зависит ручной экран этого профиля. Нет поля — зависимостей нет"}`;
- `ProfileUse` — `{"type": "object", "additionalProperties": false, "required": ["id", "version"], "properties": {"id": {тот же pattern, что Profile.id}, "version": {тот же pattern, что Profile.version}}}`;
- в описаниях `Profile`, `Profile.properties`, `Profile.status` ссылку «BACKEND.md „Стандартные профили“» заменить на «файл профиля api/profiles/<имя>.json, таблица — api/profiles/<имя>.md»;
- `info.version` — `X.Y.Z`.

- [ ] **Step 6: `build_api.py` пишет раздел `profiles`**

Функция `render_demo()` и порядок `main()` — по Interfaces. Документ модуля дополнить: `api/profiles/*.json` — источник раздела `profiles`, `demo.json` правят руками во всём, кроме него.

- [ ] **Step 7: Собрать**

Run: `python3 tools/build_api.py`
Expected: строки `api/fixtures/demo.json ← api/profiles/*.json`, затем `one-domain.json`, `large.json`, `xl.json` от `profile_fixture.py`, затем `api/openapi.js`, `api/fixture.js`.

- [ ] **Step 8: Сверить перенос с прежним набором**

```bash
python3 - <<'EOF'
import json, subprocess
old = {p["id"]: p for p in json.loads(subprocess.check_output(["git", "show", "HEAD:api/fixtures/demo.json"]))["profiles"]}
new = {p["id"]: {k: v for k, v in p.items() if k not in ("version", "uses")} for p in json.load(open("api/fixtures/demo.json"))["profiles"]}
print("равны:", len(old)) if old == new else print("разные:", sorted(k for k in old if old[k] != new.get(k)))
EOF
python3 tools/build_api.py && git status --short api/fixtures
git diff --stat api/fixtures/demo.json
```
Expected: `равны: 17`; повторная сборка не меняет файлов; дифф `demo.json` — только строки раздела `profiles` (порядок профилей теперь по имени файла, у каждого `version`, у трёх — `uses`: `vms.camera/1`, `vms.pos/1`, `vms.edge/1`).

- [ ] **Step 9: Проверки проходят**

Run: `python3 tools/check_api.py`
Expected: пять строк `PASS Профили …` (строка 4 — `PASS` или `INFO`), `RESULT pass`.

- [ ] **Step 10: Пропуск п. 2 без истории**

Run: `cp -r api "$SCRATCH/api-copy" && python3 tools/check_api.py --api "$SCRATCH/api-copy" | grep "Профили: версия"` (`$SCRATCH` — папка scratchpad сессии)
Expected: строка `INFO`, без `FAIL` и без трассы Python.

- [ ] **Step 11: Тесты API, сценарии, скорость**

Run: `python3 tools/run_api_tests.py && python3 tools/check_ui.py && python3 tools/check_perf.py --quick`
Expected: все тесты API проходят, новый тест печатает `профилей 17, с версией 17`; `check_ui` и `check_perf` — без новых сбоев (известные сбои — по `api/TESTS.md`).

- [ ] **Step 12: Документы версии**

`api/README.md`: раздел «Что добавлено в X.Y.Z» — по предложению о слоях (ссылка), что добавлено (`Profile.version`, `Profile.uses`, `ProfileUse`; профили в `api/profiles/`; раздел `profiles` `demo.json` собирается), тест; в «Файлы» — строки `api/profiles/*.json` и `tools/profile_files.py`. `api/TESTS.md`: число тестов `api-units.js` +1; в разделе 4 — пять строк о профилях и самопроверка `tools/check_profile_files.py` («Когда запускать: после правки `tools/profile_files.py`»). Документ `tools/check_api.py` — пункт о профилях.

- [ ] **Step 13: Коммит (без push — вместе с задачами 4 и 5)**

```bash
git add api/openapi.json api/openapi.js api/profiles api/fixtures api/fixture.js tools/build_api.py tools/check_api.py tests/api-units.js api/README.md api/TESTS.md
git commit -m "API: профили в файлах api/profiles/, version и uses в GET /kinds, проверки профилей; контракт X.Y.Z"
```

### Task 4: Зависимости `uses` по ручным экранам

**Files:**
- Modify: `api/profiles/*.json` (поле `uses`)
- Modify (собираются): `api/fixtures/*.json`, `api/fixture.js`

**Interfaces:**
- Consumes: файлы задачи 3; `uses_problems` (задача 2).
- Produces: окончательные `uses` 17 профилей — на них опираются части 03 (тесты профиля с зависимостями) и 07 (экран по профилю).

Правило: профиль A использует профиль B, если поле A ссылается на B (`x-ref.implements`, уже внесено в задаче 3) или ручной экран профиля A читает свойство, состояние или путь `apis` объекта профиля B. Имя объекта по ссылке не считается: его даёт механизм. Версия — `"1.0"`.

- [ ] **Step 1: Сверить таблицу с кодом**

Для каждой строки найти чтение в `index.html` (`python3 tools/outline.py index.html слово…`, функции из колонки «Где»). Строку без подтверждения убрать, найденную сверх таблицы — добавить с тем же правилом.

| Профиль | Использует (предварительно) | Где |
|---|---|---|
| `vms.camera/1` | `vms.archive/1`, `vms.detector/1` (из задачи 3); `vms.stream/1`, `vms.live/1`, `vms.ptz/1`, `vms.timeline/1`, `vms.edge/1` | `camVideoHtml` (потоки, видео, поворот), вкладка «Архив» (`nvrRecCardHtml`, шкала), `edgeLoadRepaint` |
| `vms.detector/1` | `vms.camera/1` (`detectorOptions`, `detOption`), `vms.stream/1` (`stream`), `vms.live/1` (кадр под зоной), `vms.subdetector/1` (окно детектора рисует поддетекторы, `dwSubFromUnit`) | окно детектора `dw…` |
| `vms.pos/1` | `vms.camera/1` (из задачи 3), `vms.live/1` | `posFrameHtml` → `liveFrameHtml` |
| `vms.edge/1` | `vms.archive/1`, `vms.camera/1` (из задачи 3) | `edgeRepScreenHtml` |
| `vms.volume/1` | `vms.archive/1` (поля тома по виду хранилища), `vms.server/1` (`status.disks`, `serverDisks`) | `formBase` (ветви `arch`, `disk`) |
| `vms.archive/1` | `vms.volume/1`, `vms.server/1`, `vms.camera/1` (вкладка «Устройства»: запись сюда), `vms.edge/1` (вкладка «Встроенные хранилища») | `formBase`, `edgeArchHtml`, `lanCardHtml` |
| `vms.server/1` | `vms.webserver/1` (вкладка «Веб, RTSP, ONVIF»), `vms.archive/1` (вкладка «Хранилище») | `webSrvHtml`, `formBase:disk` |
| `vms.domain/1` | `vms.server/1`, `vms.folder/1` — проверить | `domainServersCard`, `folderCardHtml` |
| `vms.stream/1`, `vms.talk/1` | `vms.camera/1` — проверить | `cvStreamColHtml`, `periphCardHtml` |
| `vms.folder/1`, `vms.acs/1`, `vms.live/1`, `vms.ptz/1`, `vms.timeline/1`, `vms.webserver/1`, `vms.subdetector/1` | — (своего экрана нет или чужих полей он не читает) | — |

- [ ] **Step 2: Внести `uses` и собрать**

Run: `python3 tools/build_api.py && python3 tools/check_api.py`
Expected: `PASS Профили: зависимости uses есть и не младше`, `RESULT pass`.

- [ ] **Step 3: Проверить итог одной таблицей**

Run: `python3 -c "import sys; sys.path.insert(0,'tools'); import profile_files as p; [print(d['id'], [u['id'] for u in d['uses']]) for d in p.load_profiles('api')]"`
Expected: 17 строк, совпадают с таблицей шага 1 после сверки.

- [ ] **Step 4: Тесты API и сценарии**

Run: `python3 tools/run_api_tests.py && python3 tools/check_ui.py`
Expected: без новых сбоев.

- [ ] **Step 5: Коммит (без push)**

```bash
git add api/profiles api/fixtures api/fixture.js
git commit -m "API: зависимости профилей uses — по ссылкам x-ref и по ручным экранам; контракт X.Y.Z"
```

### Task 5: Таблицы для людей вместо таблиц в `BACKEND.md` и `README.md`

**Files:**
- Modify: `tools/build_api.py` (таблицы `api/profiles/*.md`)
- Create (собираются): `api/profiles/vms.*.md` (17)
- Create: `api/profiles/README.md` (руками)
- Modify: `api/BACKEND.md` (раздел «Стандартные профили», абзац «Профили»), `api/README.md` (раздел «Профили» в «Модели данных»), `api/FRONTEND.md` (строка «ручной экран»), `.claude/skills/api-contract/SKILL.md` (места про профили в `demo.json` и `BACKEND.md`, список собранных файлов)

**Interfaces:**
- Consumes: `render_md` (задача 1), `load_profiles`.
- Produces: `api/profiles/<имя>.md` — ссылки на них дают части 03 и 07; `build_api.py --check` сообщает `api/profiles/<имя>.md отстал от <имя>.json` и `api/profiles/<имя>.md — нет файла <имя>.json`.

- [ ] **Step 1: Проверка сборки таблиц падает**

Добавить в `TARGETS` `build_api.py` по цели на файл профиля (`render_md(doc, kinds)`, `kinds` — коды видов `demo.json` с этим профилем в `implements`) и проверку лишних `*.md` (кроме `README.md`).
Run: `python3 tools/build_api.py --check`
Expected: 17 строк `api/profiles/vms.….md отстал от …`, код 1.

- [ ] **Step 2: Собрать**

Run: `python3 tools/build_api.py && python3 tools/build_api.py --check`
Expected: 17 строк `api/profiles/vms.….md ← …`; повторная проверка — код 0.

- [ ] **Step 3: `api/profiles/README.md`**

Разделы: «Что такое профиль» (договорённость об именах полей особого экрана, п. 6 предложения); «Файл профиля» (таблица полей файла из раздела «Где лежит профиль»); «Версии» (новое поле — младшая и `since`, снятое или с другим типом — новая старшая, строка в `changes`, клиент и незнакомая версия — три случая из предложения); «Зависимости» (правило задачи 4); «Как собрать и проверить» (`python3 tools/build_api.py`, `python3 tools/check_api.py`, что проверяют пять строк); «Кто ведёт» — `owner`, `reviewers` и ссылка на правила процесса части 01 (`CLAUDE.md`, скилл `api-contract`). Тексты — по `docs/TEXTS.md` (простой язык).

- [ ] **Step 4: Заменить таблицы ссылками**

- `api/BACKEND.md`, «Стандартные профили»: таблицы 17 профилей убрать; остаётся абзац о договорённости и ссылка «Профили — [`api/profiles/`](profiles/README.md): файл `<имя>.json` — источник истины, таблица `<имя>.md` — для людей». Абзац «### Профили» (о хуках) и таблица хуков `api/profiles.js` остаются.
- `api/README.md`, «Профили»: краткую таблицу убрать, ссылка на `api/profiles/README.md`; абзац «Клиент и незнакомая версия» — три случая.
- `api/FRONTEND.md`: строка «ручной экран» — профиль вида; незнакомая старшая версия (`vms.camera/2` без `vms.camera/1`) — форма по схеме; младшую `version` клиент не сравнивает, поле показывает, если оно есть в схеме вида.
- Ссылки на якорь `#стандартные-профили`: `git grep -n "стандартные-профили\|Стандартные профили" -- ':!api/requests' ':!docs/contract-layers'` → каждую перевести на `profiles/README.md`.
- `.claude/skills/api-contract/SKILL.md`: «описание профиля в `api/BACKEND.md`» → «файл профиля `api/profiles/<имя>.json`»; в «Порядке правки контракта» раздел `profiles` — из `api/profiles/`, сборка — `python3 tools/build_api.py` (раздел `profiles`, наборы, таблицы, `openapi.js`, `fixture.js`); в конфликтах при rebase к собранным файлам добавить `api/profiles/*.md` и раздел `profiles` `demo.json`. Если часть 01 уже переписала эти места — свести, не отменяя её правил.

- [ ] **Step 5: Все проверки**

Run: `python3 tools/check_api.py && python3 tools/run_api_tests.py && python3 tools/check_ui.py && python3 tools/check_perf.py --quick`
Expected: `RESULT pass`; тесты и сценарии без новых сбоев; `check_backend_doc` (числа в `BACKEND.md`) проходит.

- [ ] **Step 6: Коммиты и push задач 3–5**

```bash
git add tools/build_api.py api/profiles api/BACKEND.md api/README.md api/FRONTEND.md
git commit -m "API: таблицы профилей собирает build_api.py в api/profiles/*.md, вместо таблиц BACKEND.md и README.md — ссылка; контракт X.Y.Z"
git add .claude/skills/api-contract/SKILL.md
git commit -m "Правила: профили — в api/profiles/, раздел profiles demo.json и таблицы собирает build_api.py"
git pull --rebase && git push
```

Если `git pull --rebase` занял `X.Y.Z` — следующая младшая, правка по скиллу `api-contract` («Две правки одновременно», п. 1), сборка и проверки ещё раз.

### Task 6: Запрос к w2c и mockup — профили в файлах

**Files:**
- Create: `api/requests/<ГГГГ-ММ-ДД-ЧЧММССZ>-owner-profile-files-request.md`
- Modify: `api/requests/README.md` (строка таблицы)

**Interfaces:**
- Consumes: коммит задач 3–5 из `origin/main` (`git log -1 --format=%h origin/main -- api/profiles`).
- Produces: запрос, на который ссылаются части 03 и 07.

- [ ] **Step 1: Написать запрос по скиллу `vms-requests` и `api-contract` («Запрос вместо правки», п. 1)**

Шапка: дата, «от владельца контракта (joynickray)», коммит, `Кому: w2c, mockup`, `Статус: новый`. Пункты:
1. Профили — в `api/profiles/<имя>.json`, таблицы — `<имя>.md`; `demo.json` раздел `profiles` собирается (копия w2c `kinds.json` из `demo.json` работает как раньше).
2. `GET /kinds`: `version` — младшая версия, которую сделал бэкенд; `uses` — как в файле профиля этой версии. Поля необязательны; без `version` клиент считает `M.0`.
3. Все 17 профилей — `1.0`; `owner` — mockup, `reviewers` — w2c, NGP. Вопрос w2c: какие профили w2c объявит — по ответу владелец сузит `reviewers`.
4. Для mockup: профили ведёт mockup; правка профиля — по правилам части 01 (ссылка), уведомление идёт `reviewers`, а не владельцу контракта.
5. Клиент и незнакомая версия — три случая (ссылка на `api/profiles/README.md`).

- [ ] **Step 2: Коммит**

```bash
git add api/requests
git commit -m "API: запрос владельца к w2c и mockup — профили в файлах, version и uses в GET /kinds; контракт X.Y.Z"
git pull --rebase && git push
```

### Task 7: Незнакомая старшая версия профиля — форма по схеме (прототип и перенос)

> **Снята** общим планом (С2): эту задачу делает задача 1 части 07. Текст ниже оставлен для справки, исполнять его не нужно.

Сверка 2026-11-18 (`index.html`, `screenType` строки 4388–4398, `KIND_PROFILES`, `kindExtraProps`):
- **Старшая младшая версия** (`1.7` при известной `1.5`) — уже так: ручной экран выбран по `id` (`SCREEN_OF_PROFILE`), «Все параметры» показывают все поля схемы вида.
- **Младшая версия** (`1.4`) — так, где ручной экран спрашивает схему вида: окно детектора (`dwHas` → `kindHasProp`), касса (`posMulti`). Полный обход ручных экранов — часть 07 (п. 10 переработки).
- **Незнакомая старшая** (`vms.camera/2`) — так только у вида с другим кодом. Вид с кодом `camera` (и другими кодами-экранами: `domain`, `server`, `folder`, `stream`, `det`, `eventsrc`, `storage`, `spk`) без своего профиля `screenType` отдаёт ручному экрану по коду. Это и чинит задача.

**Files:**
- Create: `index_NN_profil-starshaya-versiya.html` (копия `index.html`), строка в `protos.html`
- Create: `tests/ui-profil-versii.js`; Modify: `tests/selftest.js` (`SCENARIOS`), `api/TESTS.md` (строка сценария)
- При переносе — Modify: `index.html`, `CHANGES.md`, `protos.html`

**Interfaces:**
- Consumes: `SCREEN_OF_PROFILE`, `HAND_SCREENS`, `screenType`, `isSchemaKind`, `isSchemaNode`, `kindsOfScreen` (`index.html`).
- Produces: `function screenProfile(kind) -> string | null` — профиль из `SCREEN_OF_PROFILE`, который вид объявил, иначе `null`; `const PROFILE_SCREEN_CODES` — `Set` значений `SCREEN_OF_PROFILE`; `screenType(kind)` у описанного вида, код которого есть в `PROFILE_SCREEN_CODES`, а `screenProfile(kind) === null`, возвращает `"kind:" + kind` (такого значения нет в `HAND_SCREENS`, поэтому все места выбора экрана — `HAND_SCREENS.has(screenType(k))` — видят форму по схеме). Часть 07 берёт эти имена.

- [ ] **Step 1: Прототип**

`git pull --rebase`; NN — по `CLAUDE.md` («Порядок создания», п. 2); `cp index.html index_NN_profil-starshaya-versiya.html`; коммит `Прототип NN: копия index.html`; строка в `protos.html`: номер, ссылка, автор (`git config user.name`), «что проверяем» — «Вид с незнакомой старшей версией профиля (vms.camera/2) открывается формой по схеме», статус «обсуждается»; `git pull --rebase && git push`.

- [ ] **Step 2: Сценарий `tests/ui-profil-versii.js`**

Описания видов меняет `PUT /test/kinds/{kind}` (образец — `tests/ui-unknown.js:139–141`), в конце сценарий возвращает исходные описания (образец — `tests/ui-access.js:111`). Камера — `30000013-0000-4000-8000-000000000000`, детектор движения этой камеры — первый `det` с `detectorKind: "motion"` в `FX`.

```js
// 1. Младшая версия: у det нет recordMask — окно детектора не показывает «Записывать маску движения»
ok(await until(() => !dwArcHas(det, "recordMask")), "у вида нет поля младшей версии — ручной экран его не показывает");
// 2. Старшая младшая: у camera новое поле noiseReduction — ручной экран остаётся, «Все параметры» показывают поле
ok(!isSchemaNode(find(CAM).n) && formAllHas("noiseReduction"), "новое поле — в «Все параметры»");
// 3. Незнакомая старшая: camera объявляет только vms.camera/2
if (typeof screenProfile !== "function") { ok(true, "index.html: проверка ждёт переноса прототипа NN"); return restore(); }
ok(await until(() => isSchemaKind("camera") && screenType("camera") === "kind:camera"), "vms.camera/2 — форма по схеме");
ok(isSchemaNode(find(CAM).n) && main().querySelector("[data-sf-form]"), "карточка камеры — форма по схеме");
ok(kindsOfScreen("camera").length && find(CAM), "камера с vms.camera/2 остаётся в дереве");
// 4. vms.camera/1 и vms.camera/2 сразу — ручной экран
ok(await until(() => screenType("camera") === "camera" && !isSchemaNode(find(CAM).n)), "известная старшая есть — ручной экран");
```

`formAllHas(name)` — открыть `#node=<CAM>&form=all` и найти поле по имени; `[data-sf-form]` — признак формы по схеме (исполнитель берёт настоящий признак из `schemaFormHtml`). Добавить `"ui-profil-versii.js"` в `SCENARIOS` `tests/selftest.js`.

- [ ] **Step 3: Сценарий падает на прототипе и проходит на `index.html`**

В прототипе вынести поиск профиля из `screenType` в `screenProfile(kind)` (поведение то же). Run: `python3 tools/check_ui.py --page index_NN_profil-starshaya-versiya.html tests/ui-profil-versii.js` и `python3 tools/check_ui.py tests/ui-profil-versii.js`
Expected: на прототипе — `FAIL vms.camera/2 — форма по схеме`; на `index.html` — случаи 1–2 `PASS` и строка «ждёт переноса».

- [ ] **Step 4: Правка в прототипе**

`PROFILE_SCREEN_CODES` и новая ветка `screenType` — по Interfaces, комментарий у `SCREEN_OF_PROFILE`: «Вид с кодом экрана профиля, но без самого профиля (vms.camera/2) — форма по схеме: незнакомую старшую версию клиент пропускает». Ветки `archive.*`/`volume` без описания вида не трогать.

- [ ] **Step 5: Сценарий проходит; полная проверка прототипа**

Run: `python3 tools/check_ui.py --page index_NN_profil-starshaya-versiya.html` и открыть `index_NN_profil-starshaya-versiya.html?selftest`
Expected: все сценарии проходят, в `ui-profil-versii.js` — 6 `PASS`.

- [ ] **Step 6: Коммит прототипа и сценария**

```bash
git add index_NN_profil-starshaya-versiya.html tests/ui-profil-versii.js tests/selftest.js api/TESTS.md
git commit -m "Прототип NN: незнакомая старшая версия профиля открывает форму по схеме; тест ui-profil-versii.js"
git pull --rebase && git push
```

- [ ] **Step 7: Перенос по скиллу `proto-promote`**

Перенести `screenProfile`, `PROFILE_SCREEN_CODES` и ветку `screenType` в `index.html`; в сценарии убрать строку «ждёт переноса». Проверки: `python3 tools/check_api.py`, `python3 tools/check_ui.py`, `python3 tools/check_perf.py --quick` — без новых сбоев. Коммит `Макет: из прототипа NN — незнакомая старшая версия профиля открывает форму по схеме` с записью в `CHANGES.md`; статус «принят» в `protos.html`; отчёт о пробелах — шаг 5 скилла (ожидаемо: пунктов не задето, коммит не нужен); `git rm` прототипа, коммит `Прототип NN: удалён — перенесён в index.html`; `git pull --rebase && git push`.

---

## Открытые вопросы владельцу

1. **Две старшие версии сразу.** Когда выйдет `vms.camera/2`, где лежит `vms.camera/1`, пока бэкенды на нём? По умолчанию в плане: файл `vms.camera.json` держит последнюю старшую, прежняя — в истории git; второй файл (`vms.camera.1.json`) — только если вы решите держать обе.
2. **`since` при переносе — `1.0` у всех полей.** Разметка полей по версиям контракта (детектор 0.12.0 → `1.1`…) дала бы `one-domain` честную младшую версию, но это ручная работа на 197 полей. По умолчанию — `1.0`, история — в `api/README.md`.
3. **`reviewers` — `["w2c", "NGP"]` у всех 17.** Сузить по ответу w2c на п. 3 запроса задачи 6?
4. **Пересечение с частью 07.** Задача 7 меняет `screenType` (незнакомая старшая). Часть 07 переделывает выбор экрана по профилю целиком и должна сохранить `screenProfile` и сценарий `ui-profil-versii.js`. Согласны, что эта правка — здесь, а не в 07?

## Что не входит

- Граница «механизм или подсистема» и её проверка в `check_api.py` (п. 4 раздела «Что проверяет `tools/check_api.py`»), правила процесса и разметка версий 0.3.0 — текущая по слоям — часть 01.
- Тесты по слоям: механизм плюс объявленные профили, `needs` по профилю — часть 03.
- Профиль равен полям особого экрана (п. 10), выбор экрана по профилю и обход всех ручных экранов на младшую версию — часть 07.
- Пути профилей вне `openapi.json` (`vms.pos.openapi.json`, п. 7) и разбиение `api/profiles.js` (п. 8).
- Профили систем не из мира VMS и вынос частей VMS из механизма — часть 04.
