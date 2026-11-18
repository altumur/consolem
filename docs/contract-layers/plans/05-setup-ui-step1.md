# Часть 05. Своя страница подсистемы, шаг 1: план работ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** вид с `setupUi.mode: iframe` показывает в карточке свою страницу подсистемы в рамке. Правку страница отдаёт сообщениями `setup/1`, а consolem записывает её своим «Применить». Шаг 1 — контракт, протокол, библиотека страницы, тестовая страница стенда и прототип; в конце — перенос в `index.html`.

**Architecture:** контракт получает смысл `mode: iframe`, поля `setupUi.protocol`, `setupUi.origin`, `SetupUiLink.origin` и `SetupUiLink.readOnly`; адрес страницы `iframe` выдаётся по праву `view`. Протокол описан в `api/SETUP-UI.md`, сообщения — в `api/setup-ui.schema.json`; `tools/check_api.py` сверяет схему с описанием и прогоняет библиотеку `api/setup-bridge.js` в Node. Тестовая страница стенда работает только на этой библиотеке. В прототипе хост сообщений держит одну рамку вне разметки карточки (перерисовка её не перезагружает). Черновик страницы — тот же черновик карточки, что у формы по схеме: у объекта по схеме — `n.props`, у ручного экрана — `n.xprops`.

**Tech Stack:** HTML и JS без сборки; встроенный сервер `api/server.js`; тесты API — `tests/api.html` в headless Chrome; сценарии интерфейса — `tests/ui-*.js` (`tools/check_ui.py`); сверки — `tools/check_api.py` (Python, вызывает Node).

**Spec:** [`docs/contract-layers/2026-11-18-setup-ui-iframe-design.md`](../2026-11-18-setup-ui-iframe-design.md), разделы 4–6, 9–12. Рядом: [предложение о слоях](../2026-11-16-kontrakt-i-podsistemy-predlozhenie.md) (п. 12 переработки), [запрос к w2c](../../../api/requests/2026-11-18-120707Z-owner-setup-ui-iframe-request.md). Шаг 2 (`call`, `x-bridge`, `subscribe`, `navigate`, `confirm`) — часть 06 ([06-setup-ui-step2.md](06-setup-ui-step2.md)).

> **Сверка с общим планом** ([00-master.md](00-master.md), раздел «Сверка частей» — главнее текста ниже):
>
> - С3 — ступень 1 — тело `screenPageStep(kind)` части 07; `suiKindOf`/`suiOn` строятся на нём;
> - С4 — страница не меняет тип узла: у вида с ручным экраном и страницей вкладки `SUI_MECH_TABS` остаются;
> - С6 — «Применить» — путь карточки (`POST /operations`), описание решения поправить в `api/SETUP-UI.md` (задача 2);
> - Review Focus 4 — в задаче 6 шаг теста: вид стенда с `implements: ["vms.camera/1"]` и `setupUi.mode: iframe` (через `PUT /test/kinds/{kind}`) показывает страницу, вкладку «Доступ» и «Все параметры»; режим сравнения считает поля по `ready.fields`;
> - Review Focus 1 — в задаче 11 запустить и `tests/ui-bez-vms.js` (часть 04) на прототипе.

## Global Constraints

- Версия контракта — **V**: следующая младшая после `origin/main` в момент задачи 1. Задачи 1–4 — одна законченная часть, одна версия V; раздел «Что добавлено в V» в `api/README.md` растёт с каждой задачей. Ломающих изменений нет.
- Исполнитель — владелец контракта (joynickray): правки `api/` он делает сам, уведомление самому себе не пишет. То, что задевает w2c, — запрос к w2c (задача 10).
- Порядок файлов контракта — скилл `api-contract`: `openapi.json` → `server.js` → `tests/api-*.js` → `demo.json` → `python3 tools/profile_fixture.py` → `python3 tools/build_api.py` → `README.md`, `BACKEND.md`. Сгенерированные файлы руками не правят.
- Протокол: каждое сообщение — `{proto: "setup/1", type, …}`; незнакомый `type` и незнакомое поле получатель пропускает. Сообщения шага 1: consolem → страница `init`, `draft`, `applied`, `errors`, `revert`, `theme`, `flush`; страница → consolem `ready`, `change`, `invalid`, `height`, `flushed`.
- Указатели полей во всём протоколе — JSON Pointer в `Unit`, как `Problem.errors[].field`: `/properties/<имя>`.
- Правка страницы — JSON Merge Patch к `unit.properties`, всегда весь черновик (`null` — снять значение, `{}` — изменений нет).
- Рамка: `sandbox="allow-scripts allow-forms allow-same-origin"`, без `allow-top-navigation` и `allow-popups`. consolem принимает сообщения только от `iframe.contentWindow` и только с ожидаемого происхождения и отвечает только на него. Правило стенда: адрес на происхождении consolem (или оба адреса `file:`) — рамка без `allow-same-origin`, отправка с `"*"`, приём с `"null"`. В протокол `setup/1` это правило не входит.
- Таймауты: `ready` — 10 секунд (`SUI_READY_MS = 10000`), `flushed` — 2 секунды (`SUI_FLUSH_MS = 2000`).
- Режим применения в макете — `"button"` (`SUI_APPLY`). Протокол готов к `"leave"` (`flush`/`flushed`, `init.host.apply`), сам режим «при уходе» здесь не делается.
- `init.host` шага 1 — ровно `{proto: "setup/1", apply: "button"}`. Поля `bridge` нет: так страница знает, что шага 2 нет (часть 06 добавляет `init.host.bridge`).
- `api/fixtures/demo.json`: `security_controller/CONTROLLER` и `security_controller/SENSOR` с `mode: tab` не меняются. `index.html` и его тесты (`tests/ui-unknown.js`, `tests/api-units.js` в существующих тестах) до переноса не меняются и проходят.
- Интерфейс — сначала прототип `index_NN_svoya-stranica.html` (NN — по правилу `CLAUDE.md`) и `assets/i18n-en-NN.js`; правила интерфейса `CLAUDE.md` (тексты по `docs/TEXTS.md`, обработчики только `onEv`/`data-on-click`, раскрытие не двигает соседей, вспышка при переходе) — в каждой правке. Новый русский текст — новый ключ `i18n`, английский — в `assets/i18n-en-NN.js` (`Object.assign(window.I18N_EN,{…})`, подключён после `assets/i18n-en.js`).
- Карта кода: новый код прототипа — под заголовками `// ── Своя страница подсистемы: рамка и протокол setup/1 ──` и `// ── Режим сравнения: свой экран и общие настройки ──`; список вкладок страницы — литералом `["gen","Настройка"]` внутри `tabsFor`, проверки вкладок — `tab==="…"`.
- Проверки: правка `api/` — `python3 tools/check_api.py`, `python3 tools/run_api_tests.py`, `python3 tools/check_ui.py`, `python3 tools/check_perf.py --quick`. Правка `tests/` — `python3 tools/check_ui.py` (на `index.html` новый сценарий пропускается). Цикл TDD прототипа — один сценарий: `python3 tools/check_ui.py --page index_NN_svoya-stranica.html tests/ui-setup-page.js`; полная проверка прототипа — задача 11.
- Коммиты по-русски в стиле `CLAUDE.md`, затем `git pull --rebase && git push` (push прототипа — в фоне).

## Review Focus

1. **Перерисовка карточки при загруженной странице.** `gear()` и `paint()` зовут часто (поток событий, таймеры, чужой объект). Рамка не перезагружается, ввод на странице не теряется, `init` не уходит второй раз. Тест — задача 6, шаг 1 («перерисовка не трогает рамку»).
2. **Чужое окно шлёт сообщение.** Другая рамка (самопроверка, ассистент) или сама страница consolem шлёт `{proto:"setup/1", type:"change"}`. consolem его не принимает. Тест — задача 7, шаг 1 («сообщение не от рамки»).
3. **Быстрая смена объекта, пока адрес страницы ещё не пришёл.** Ответ `POST /setup-ui` для прежнего объекта не создаёт рамку у нового. Тест — задача 6, шаг 1 («поздний адрес»).
4. **Незнакомая версия протокола** (`setupUi.protocol: "setup/9"`). consolem не встраивает страницу, а показывает ступень 2 или 3. Тест — задача 6, шаг 1.
5. **Правка страницы с полями вне схемы, с полями `readOnly` и у человека с правом `view`.** Такие ключи в черновик не попадают, строк плана нет; при `readOnly` consolem `change` не принимает. Тесты — задача 7, шаг 1.

---

## Решения, которые план принимает сам (раздел 12 описания и спорное)

| № | Вопрос | Решение |
|---|---|---|
| Р1 | Какие вкладки ручного экрана — «вида», какие — «механизма» | Таблица ниже. Механизма — только `acc` «Доступ». Под рамкой consolem оставляет общие для любого вида карточки: «Команды» (`unitActionsHtml`), «Состояние» (`schemaStateHtml`), «Правила автоматизации» (`ruleUsesFor`) и строку вида (`schemaHeadHtml`) |
| Р2 | Как consolem узнаёт `readOnly` | Новое необязательное `SetupUiLink.readOnly` (у `mode: iframe` сервер ставит всегда: `true` — право `view` без `edit`). У `mode: iframe` consolem **всегда** берёт адрес из `POST /units/{uid}/setup-ui`, даже если у вида есть `url`: сервер дописывает к нему объект, язык и ключ (так уже работает `setupUiLink`). Открытый вопрос В1 |
| Р3 | Тестовая страница стенда | `api/plugins/security_controller/setup/index.html` + `page.js` + `page.css`, на `api/setup-bridge.js`. Вид `security_controller/KEYPAD` «Клавиатура», один объект |
| Р4 | Как стенд отдаёт адрес | У `mode: iframe` без `url` встроенный сервер отдаёт **относительный** адрес `api/plugins/<origin.plugin>/setup/index.html?type=&id=&lang=&t=` вместо `stub://…`. Клиент разрешает относительный адрес от адреса своей страницы (`new URL(url, document.baseURI)`). У `mode: tab` — по-прежнему `stub://plugin/<плагин>/setup` |
| Р5 | Путь «Применить» | Обычный путь карточки consolem: «Показать план» → проверка `POST /units/validate` → план → «Применить» → `POST /operations` с `expectedVersions`. Это и есть «`PATCH` с `If-Match`» описания: журнал, отсчёт с «Отменить», конфликт версий — общие. В `SETUP-UI.md` — «consolem пишет правку своим обычным путём» |
| Р6 | Проверка черновика на ходу (п. 5 раздела 6) | На шаге 1 нет. Сервер проверяет правку один раз, по «Показать план» (`schemaValidate`): запрос на каждую правку страницы — лишняя нагрузка |
| Р7 | Высота рамки | По сообщению `height.px`; до него — 320 px; значение зажато в [80, 20000]. Высота меняется плавно (`transition: height .2s`, `prefers-reduced-motion` отключает) |
| Р8 | Как рамка переживает перерисовку | Одна рамка на страницу consolem, в постоянном `#suiDock` (`position: fixed`) вне `#main`. В карточке — место `[data-sui-slot]` нужной высоты; `suiPlace()` ставит док поверх места и обрезает его по видимой области прокрутки (`clip-path`). Перенос `iframe` в DOM перезагружает его, поэтому рамку не переносят. Карточка без места (другой объект, «Все параметры») — док скрыт (`hidden`), рамка жива, пока открыт тот же объект |
| Р9 | Изменение объекта не из страницы | consolem шлёт `revert {unit}`, когда объект на сервере изменился или черновик опустел по действию consolem («Сбросить», «Отменить» после записи, чужая правка при пустом черновике, неудачное «Применить»). При непустом черновике чужая правка странице не уходит: её ловит конфликт версий при «Применить». `applied {unit}` — только после своего удачного «Применить» |
| Р10 | Поля правки вне схемы, поля `readOnly` и `x-transient` | consolem их отбрасывает и пишет `console.warn` один раз на ключ. `invalid` от страницы закрывает «Показать план» |
| Р11 | Тема | `theme = {mode: "dark" \| "light", tokens: {"--one-…": "<значение>"}}`; токены — `SUI_THEME_TOKENS`: `--one-canvas`, `--one-surface`, `--one-surface-muted`, `--one-fg`, `--one-fg-muted`, `--one-border`, `--one-border-strong`, `--one-accent`, `--one-accent-on`, `--one-danger`, `--one-focus-ring`, `--one-control-bg`, `--one-control-hover`, `--one-radius-control` (значения — `getComputedStyle(document.documentElement)`) |
| Р12 | Схема сообщений и её проверка | `api/setup-ui.schema.json` (JSON Schema 2020-12, `$defs` по `type`, `examples`); `api/setup-ui.schema.js` собирает `tools/build_api.py` для сценария интерфейса; `tools/check_api.py` сверяет ключевые слова, примеры, таблицы `SETUP-UI.md` и `Problem` с `openapi.json` |
| Р13 | Как проверять библиотеку без сборки | `tools/check_setup_bridge.js` (Node, по образцу `tools/check_pages.js`): поддельные `window`, `parent`, `location`; `check_api.py` запускает его и сверяет все сообщения библиотеки со схемой через `api/contract.js` |
| Р14 | Переключатель сравнения и строка покрытия | Только прототип. Переключатель «Свой / Общие» — в шапке перед «Ещё»; строка покрытия — над местом рамки (или над ручным экраном). В основной не переносится без решения владельца (вопрос В2) |
| Р15 | «Все параметры» у страницы | Пункт меню «Ещё», как у ручного экрана. У объекта по схеме это форма по схеме (`schemaFormHtml`) на том же `n.props`: вернуться к странице можно и с правкой, она уйдёт странице сообщением `draft` |

**Вкладки `tabsForHand` (Р1).** Страница заменяет вкладки вида; consolem оставляет вкладки механизма (`SUI_MECH_TABS = new Set(["acc"])`).

| Вид (`n.type`) | Вкладки вида — заменяет страница | Механизма — остаются | Спорное и решение |
|---|---|---|---|
| срез хранилищ (`archScope`) | `stor`, `edges`, `gen` | — | — |
| `domain` | `flds`, `gen`, `cams`, `srvs`, `lic`, `topo` | — | `topo` «Топология» — граф VMS, поэтому вид |
| `server` | `gen`, `cams`, `svc`, `disk`, `net`, `web`, `topo` | — | — |
| `archive` | `cams`, `edge`, `arch` | — | — |
| `storage` | `rep`, `gen` | — | — |
| `camera` | `view`, `gen`, `vid`, `rec`, `det`, `io` | `acc` «Доступ» | `view` «Просмотр» — видео оператора (п. 7 предложения), поэтому вид |
| `ipsrv` | `gen`, `chan`, `rec` | — | — |
| `channel` | `gen`, `kids` | — | `kids` «Дочерние» — общий список детей, но с отбором по типам VMS (датчики и реле), поэтому вид |
| `eventsrc` | `gen`, `overlay` | — | — |
| `acfa` | `gen`, `kids` | — | `kids` «Подобъекты» — то же, что у канала |
| `export`, `email`, `sms`, прочие | `gen` (и `params`) | — | — |
| объект по схеме (`isSchemaNode`) | все `schemaTabs` | — | у формы по схеме вкладки «Доступ» нет |

Вкладки страницы в `tabsFor`: `[["gen","Настройка"]]` плюс вкладки `tabsForHand(n)` из `SUI_MECH_TABS` (у объекта по схеме — ничего). Ключ `gen` сохраняет ссылки `#node=…&tab=gen` и память вкладок.

## Протокол шага 1 — поля (решение раздела 12)

Общие поля каждого сообщения: `proto: "setup/1"`, `type`. Остальные:

| `type` | Направление | Поля |
|---|---|---|
| `init` | → страница | `uid`, `kind`, `lang` (`"ru"`, `"en"`…), `theme` (Р11), `readOnly: boolean`, `unit {uid, kind, name, version, properties, status?}`, `draft` (Merge Patch, `{}` — нет), `host {proto, apply}` |
| `draft` | → страница | `patch` — черновик целиком |
| `applied` | → страница | `unit` |
| `errors` | → страница | `problem` — `Problem` как есть (`code`, `message`, `field?`, `params?`, `errors[]?` с `field` — указатель) |
| `revert` | → страница | `unit` |
| `theme` | → страница | `theme` |
| `flush` | → страница | `seq` — целое ≥ 1 |
| `ready` | → consolem | `fields?` — указатели полей, которые показывает страница |
| `change` | → consolem | `patch` |
| `invalid` | → consolem | `fields` — указатели (пустой список снимает запрет), `message?` |
| `height` | → consolem | `px` — целое ≥ 0 |
| `flushed` | → consolem | `seq` |

## Карта файлов

| Файл | Что | Задача |
|---|---|---|
| `api/openapi.json` | `setupUi.mode` (смысл `iframe`), `setupUi.protocol`, `setupUi.origin`, `SetupUiLink.origin`, `SetupUiLink.readOnly`, права `openUnitSetupUi`, описание `Unit.capabilities`, `info.version` = V | 1 |
| `api/server.js` | `setupUiLink` и `capabilities`: уровень по `mode`, `readOnly`, адрес тестовой страницы | 1 |
| `api/fixtures/demo.json` | вид `security_controller/KEYPAD` и объект «Клавиатура у входа» | 1 |
| `tests/api-units.js` | тест «Своя страница подсистемы V…», `PLUGIN_NEEDS` для `KEYPAD` | 1 |
| `api/README.md`, `api/BACKEND.md` | «Что добавлено в V», таблица `UnitKind`, «Файлы»; памятка бэкенду | 1–4 |
| `api/SETUP-UI.md` | описание протокола `setup/1`, шаг 1 | 2 |
| `api/setup-ui.schema.json` | JSON Schema сообщений | 2 |
| `api/setup-ui.schema.js` | собирает `tools/build_api.py` (`window.CONSOLEM_SETUP_UI_SCHEMA`) | 2 |
| `tools/build_api.py`, `tools/check_api.py` | сборка схемы; сверка схемы, описания и библиотеки | 2, 3 |
| `api/setup-bridge.js` | библиотека автора страницы | 3 |
| `tools/check_setup_bridge.js` | проверка протокола библиотеки в Node | 3 |
| `api/plugins/security_controller/setup/index.html`, `page.js`, `page.css` | тестовая страница стенда | 4 |
| `api/TESTS.md` | новые проверки и сценарий, число тестов `api-units.js` | 1–3, 6 |
| `index_NN_svoya-stranica.html`, `assets/i18n-en-NN.js`, `protos.html` | прототип | 5–9 |
| `tests/ui-setup-page.js`, `tests/selftest.js` | сценарий интерфейса | 6–9 |
| `api/requests/<ts>-owner-setup-ui-step1-request.md`, `api/requests/README.md` | запрос к w2c о шаге 1 в контракте | 10 |
| `index.html`, `assets/i18n-en.js`, `CHANGES.md`, `api/FRONTEND.md`, `api/ACCEPTANCE.md` | перенос | 11 |

---

### Task 1: Контракт шага 1 и вид стенда

**Files:**
- Modify: `api/openapi.json` — `UnitKind.properties.setupUi`, `SetupUiLink`, `paths./units/{uid}/setup-ui.post.description`, `Unit.properties.capabilities.description`, `info.version`
- Modify: `api/server.js:2966-2983` (`setupUiOf`, `setupUiLink`), `api/server.js:3033-3034` (`capabilities`)
- Modify: `api/fixtures/demo.json` — `kinds` (новый вид, `CONTROLLER.children`), `units` (новый объект)
- Modify: `tests/api-units.js` — `PLUGIN_NEEDS`, новый тест после «Страница плагина 0.16.0…»
- Modify: `api/README.md` (шапка, «Что добавлено в V», строка `setupUi` в таблице `UnitKind`), `api/BACKEND.md:347`, `api/TESTS.md` (число тестов `api-units.js`)
- Generated: `api/fixtures/one-domain.json`, `large.json`, `xl.json`, `api/openapi.js`, `api/fixture.js`

**Interfaces:**
- Produces (контракт): `UnitKind.setupUi = {url?, kinds?, mode: "tab"|"iframe", protocol?: string /^setup\/[0-9]+$/, origin?: string}`; `SetupUiLink = {url, expiresAt, origin?: string, readOnly?: boolean}`.
- Produces (стенд): `SUI_KIND = "security_controller/KEYPAD"`; `SUI_UNIT = "30000306-0000-4000-8000-000000000000"` (свободный uid на 2026-11-18 — перед правкой проверить уникальность); `SUI_TEST_PAGE = "api/plugins/security_controller/setup/index.html"`. Схема вида: `code_length` (integer 4–8, по умолчанию 4, «Длина кода»), `display_text` (string, `maxLength` 32, «Текст на экране»), `backlight` (enum `off`/`low`/`high`, `x-enum-labels` «Выключена»/«Слабая»/«Яркая», «Подсветка»), `beep` (boolean, `x-ui-widget: switch`, «Звук нажатия»), `lock_after_tries` (integer 1–10, «Блокировать после попыток»); `x-label` — `{key: "security_controller.param.<имя>", text, lang: "ru"}`, `x-ui-order` 1–5. `setupUi: {mode: "iframe", protocol: "setup/1", kinds: ["security_controller/KEYPAD"]}`; `origin`, `access` — как у `CONTROLLER`; `parents: ["security_controller/CONTROLLER"]`, `createParents: []`, `implements: []`, `capabilities: ["rename", "delete", "folders"]` (без `create`: мастера под контроллером и в корне остаются прежними). Объект: `parentId` — «Контроллер охраны — вход» (`30000294-…`), имя «Клавиатура у входа», `properties {code_length: 6, display_text: "Ввести код", backlight: "low", beep: true, lock_after_tries: 5}`, `status {link: "online"}`.

- [ ] **Step 1: Тест.** В `tests/api-units.js` в `PLUGIN_NEEDS` добавить `[/KEYPAD/, "kind:security_controller/KEYPAD"]`, константу `KEYPAD = "security_controller/KEYPAD"` и помощник `asView(level)` по образцу `asRole` из `tests/api-access.js:447` (роль поверх «Аудитора» с `kindAccess: {security_controller: level}`; `level` `null` — класса в роли нет). Тест:

```js
test("Своя страница подсистемы V: mode iframe — адрес по праву view, readOnly, относительный адрес страницы стенда; mode tab — по-прежнему edit", async () => {
  const env = await makeEnv();
  const kp = ofKind(KEYPAD)[0], ctl = ofKind(CONTROLLER)[0];
  assert.eq(kindOf(KEYPAD).setupUi, { mode: "iframe", protocol: "setup/1", kinds: [KEYPAD] }, "setupUi вида: iframe, setup/1");
  const a = await env.ok("POST", `/units/${kp.uid}/setup-ui`, {});
  assert.ok(a.url.startsWith("api/plugins/security_controller/setup/index.html?"), "стенд: относительный адрес тестовой страницы: " + a.url);
  const q = new URL(a.url, "http://x/").searchParams;
  assert.eq([q.get("type"), q.get("id"), !!q.get("t")], [KEYPAD, kp.uid, true], "вид, объект, разовый ключ");
  assert.eq([a.readOnly, "origin" in a], [false, false], "право edit — readOnly false; стенд не перенаправляет — origin нет");
  assert.ok(((await env.ok("GET", unitPath(kp.uid))).capabilities || []).includes("setupUi"), "отметка setupUi у клавиатуры");
  const view = await asView("view");
  assert.ok(((await view.ok("GET", unitPath(kp.uid))).capabilities || []).includes("setupUi"), "по праву view отметка есть");
  assert.eq((await view.ok("POST", `/units/${kp.uid}/setup-ui`, {})).readOnly, true, "по праву view — readOnly true");
  const tab = await view.call("POST", `/units/${ctl.uid}/setup-ui`, {});
  assert.status(tab, 403, "PERMISSION_DENIED", "mode tab по праву view — по-прежнему 403");
  assert.eq(tab.body.params.right.level, "edit", "mode tab: нужен edit");
  const none = await asView(null);
  const no = await none.call("POST", `/units/${kp.uid}/setup-ui`, {});
  assert.status(no, 403, "PERMISSION_DENIED", "без права на класс — 403");
  assert.eq(no.body.params.right.level, "view", "mode iframe: нужен view");
}, { needs: ["openUnitSetupUi", "getUnit"] });
```

- [ ] **Step 2: Запустить и увидеть отказ.** `python3 tools/run_api_tests.py --only "Своя страница подсистемы"` → `FAIL` (у `KEYPAD` нет объекта: вида ещё нет — `SKIP` по `kind:`; после шага 4 — `FAIL` на `setupUi вида`).

- [ ] **Step 3: Контракт.** В `api/openapi.json`:
  - `setupUi.description`: «Своя страница подсистемы. `mode: iframe` — страница внутри карточки по протоколу `setup/1` (`api/SETUP-UI.md`), правку записывает клиент; `mode: tab` — ссылка в новой вкладке, страница пишет сама. Какой экран видит человек: есть страница `iframe` — она, иначе ручной экран по профилю, иначе форма по схеме. Страница живёт на другом происхождении… (прежняя строка)»;
  - `mode.description`: «`tab` — ссылка в новой вкладке; `iframe` — страница в карточке по протоколу `protocol`»;
  - `protocol`: `{type: string, pattern: "^setup/[0-9]+$", description: "Версия протокола страницы mode iframe. Нет поля — setup/1. Незнакомую версию клиент не встраивает и показывает свой экран или форму по схеме"}`;
  - `origin` у `setupUi` и у `SetupUiLink`: `{type: string, description: "Происхождение страницы после перенаправлений двери и прокси, если оно другое, чем у адреса. Клиент принимает сообщения только с него. Нет поля — происхождение адреса"}`;
  - `SetupUiLink.readOnly`: `{type: boolean, description: "Только у mode iframe, сервер ставит всегда: true — у человека право view без edit. Клиент передаёт странице readOnly и не показывает «Применить»"}`;
  - `SetupUiLink.url.description` — дописать: «Относительный адрес клиент разрешает от адреса своей страницы (так встроенный сервер отдаёт тестовую страницу)»;
  - `openUnitSetupUi.description`: право — `view` у `mode: iframe`, `edit` у `mode: tab`; у `iframe` клиент берёт адрес этим путём и при постоянном `url`;
  - `Unit.capabilities.description`: «setupUi — пользователь может открыть страницу (у mode iframe — право view, у mode tab — edit)»;
  - `info.version` = V.

- [ ] **Step 4: Сервер и набор.** В `api/server.js`: `setupUiLevel(su) → "view" | "edit"` (`su.mode === "iframe" ? "view" : "edit"`), его берут `setupUiLink` (текст отказа — «Странице подсистемы нужен уровень view» / прежний для `tab`) и отметка `capabilities`. У `mode: iframe` без `url` база адреса — `api/plugins/${encodeURIComponent(plugin)}/setup/index.html`; в ответе `readOnly: !!rightProblem(u, {level: "edit"}, "")`. `mode: tab` — без изменений. В `api/fixtures/demo.json` — вид и объект из Interfaces, `KEYPAD` в `CONTROLLER.children`. Затем `python3 tools/profile_fixture.py` и `python3 tools/build_api.py`.

- [ ] **Step 5: Запустить тесты API.** `python3 tools/run_api_tests.py` → `RESULT pass`, новый тест `PASS`, прежние без изменений (в том числе «Страница плагина 0.16.0…»).

- [ ] **Step 6: Остальные проверки.** `python3 tools/check_api.py` → `RESULT pass`; `python3 tools/check_ui.py` → `RESULT pass` (`index.html` не менялся: у `iframe` нет ссылки, объект открывается формой по схеме). Если падает проверка, которая считает детей контроллера, — объект `KEYPAD` переносится в корень домена (`parentId: null`, `parents: [null]`, `createParents` остаётся `[]`), `KEYPAD` уходит из `CONTROLLER.children`; правка тестов не допускается. `python3 tools/check_perf.py --quick` → итоги в пределах известного разброса (`api/TESTS.md`, раздел 9).

- [ ] **Step 7: Документы.** `api/README.md`: шапка — V; строка `setupUi` таблицы `UnitKind` — без «iframe — позже», с `protocol`, `origin`; раздел «Что добавлено в V» (по описанию решения, раздел 10: смысл `iframe`, `protocol`, `origin`, `SetupUiLink.readOnly`, право `view`, относительный адрес стенда, вид `KEYPAD`; тест). `api/BACKEND.md:347` — права по `mode`, `readOnly`, `origin`, адрес страницы стенда. `api/TESTS.md` — число тестов `api-units.js` +1 и «своя страница `iframe` по праву `view`» в описании.

- [ ] **Step 8: Коммит.**

```bash
git add api/openapi.json api/server.js api/fixtures tests/api-units.js api/openapi.js api/fixture.js api/README.md api/BACKEND.md api/TESTS.md
git commit -m "API: своя страница подсистемы, шаг 1 — setupUi.mode iframe по праву view, protocol, origin, SetupUiLink.readOnly, вид security_controller/KEYPAD на стенде; контракт V"
git pull --rebase && git push
```

---

### Task 2: Протокол `setup/1`: описание, JSON Schema и сверка

**Files:**
- Create: `api/SETUP-UI.md`, `api/setup-ui.schema.json`
- Modify: `tools/build_api.py` (`TARGETS`: `api/setup-ui.schema.json` → `api/setup-ui.schema.js`), `tools/check_api.py` (новая `check_setup_ui(rep, spec)` в `main`)
- Generated: `api/setup-ui.schema.js`
- Modify: `api/openapi.json` — в `setupUi.description` ссылка «протокол — api/SETUP-UI.md»; `api/README.md` («Файлы», «Что добавлено в V»); `api/TESTS.md` (раздел 4, строка проверки)

**Interfaces:**
- Consumes: `validate(spec, schema, value, where, out)` и проверку ключевых слов из `check_contract` в `tools/check_api.py`.
- Produces: `api/setup-ui.schema.json` — корень `{"$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "setup-ui.schema.json", "title", "description", "oneOf": [$ref на каждое сообщение], "$defs": {…}, "examples": […]}`. `$defs` сообщений названы по `type`: `init`, `draft`, `applied`, `errors`, `revert`, `theme`, `flush`, `ready`, `change`, `invalid`, `height`, `flushed`; у каждого — `x-direction: "toPage" | "toHost"` и `x-step: 1`; `proto` и `type` — `enum` из одного значения (обе сверки его знают); `additionalProperties: false`. Общие `$defs`: `unit`, `themeSpec`, `host` (`{proto, apply: enum ["button","leave"]}`, `additionalProperties: false` — часть 06 добавит `bridge`), `pointer` (`pattern: "^/properties/"`), `mergePatch` (`object`, `additionalProperties: true`), `problem` и `problemError` — копии `Problem` и `ProblemError` из `openapi.json` с `code` — строкой. `window.CONSOLEM_SETUP_UI_SCHEMA` в `api/setup-ui.schema.js`.
- Produces: `api/SETUP-UI.md` — разделы: «Зачем и какой экран главнее» (правило трёх ступеней, вариант А), «Адрес и рамка» (`sandbox`, происхождение, `frame-ancestors`, правило стенда — помечено «не протокол»), «Сообщения» (две таблицы: `| \`type\` | Когда | Поля |` — по одной строке на сообщение), «Как идёт «Применить»» (Р5, `flush`/`flushed`, `invalid`, `errors`, Р9), «Режим `apply`», «Страница не загрузилась», «Только просмотр», «Чего страница не делает», «Библиотека `setup-bridge.js`», «Шаг 2» (одна строка: `init.host.bridge` появится в части 06; без него страница шаг 2 не вызывает).

- [ ] **Step 1: Сверка — сначала.** В `tools/check_api.py` — `check_setup_ui(rep, spec)`; проверка `"Протокол страницы setup/1: схема сообщений, примеры, описание"` ловит:
  - файла `api/setup-ui.schema.json` или `api/SETUP-UI.md` нет;
  - ключевое слово вне подмножества (то же множество, что у `check_contract`, плюс `$schema`, `$id`, `$defs`, `title`, `examples`, `x-direction`, `x-step`);
  - `$ref` ведёт мимо `$defs`;
  - `$defs` сообщения без `x-direction` или без `proto`/`type` в `required`;
  - пример без сообщения своего `type` или не проходит схему (`validate` со `spec = {"components": {"schemas": defs}}`); сообщение без примера;
  - строка таблиц «Сообщения» `SETUP-UI.md` без `$defs` и наоборот; направление таблицы не совпадает с `x-direction`;
  - имена полей `problem` и `problemError` не совпадают с `Problem` и `ProblemError` в `openapi.json`;
  - в `setupUi.description` нет ссылки на `api/SETUP-UI.md`.

- [ ] **Step 2: Запустить.** `python3 tools/check_api.py` → `FAIL  Протокол страницы setup/1… — файла api/setup-ui.schema.json нет`.

- [ ] **Step 3: Схема, описание, сборка.** Написать `api/setup-ui.schema.json` по Interfaces и таблице «Протокол шага 1 — поля»; `examples` — по одному на сообщение, значения — с вида `KEYPAD` (`init` с `host: {proto: "setup/1", apply: "button"}`; `errors` с `problem.errors[0].field = "/properties/code_length"`). `api/SETUP-UI.md` — по Interfaces, решения Р2, Р5–Р10 — словами протокола. В `tools/build_api.py` — третья цель: `window.CONSOLEM_SETUP_UI_SCHEMA=<схема одной строкой>;`, `--check` её сверяет. `python3 tools/build_api.py`.

- [ ] **Step 4: Запустить.** `python3 tools/check_api.py` → `PASS  Протокол страницы setup/1: схема сообщений, примеры, описание` и `RESULT pass`.

- [ ] **Step 5: Документы.** `api/README.md` — «Файлы» (`SETUP-UI.md`, `setup-ui.schema.json`, `setup-ui.schema.js`), «Что добавлено в V» — абзац о протоколе. `api/TESTS.md`, раздел 4 — строка проверки.

- [ ] **Step 6: Коммит.**

```bash
git add api/SETUP-UI.md api/setup-ui.schema.json api/setup-ui.schema.js api/openapi.json api/openapi.js tools/build_api.py tools/check_api.py api/README.md api/TESTS.md
git commit -m "API: протокол своей страницы setup/1, шаг 1 — api/SETUP-UI.md, JSON Schema сообщений, сверка в check_api.py; контракт V"
git pull --rebase && git push
```

---

### Task 3: Библиотека страницы `api/setup-bridge.js`

**Files:**
- Create: `api/setup-bridge.js`, `tools/check_setup_bridge.js`
- Modify: `tools/check_api.py` (`check_setup_ui` вызывает `node tools/check_setup_bridge.js`), `api/README.md` («Файлы», «Что добавлено в V»), `api/SETUP-UI.md` (раздел «Библиотека»), `api/TESTS.md` (раздел 4)

**Interfaces:**
- Consumes: `api/setup-ui.schema.json` (задача 2); `window.ConsolemContract.check(spec, schema, value, where, out)` из `api/contract.js`.
- Produces: `window.SetupBridge`:
  - `connect(opts) → Promise<Session>` — шлёт `ready` сразу, обещание сбывается на `init`. `opts`: `fields?: string[]`, `onDraft?(patch)`, `onApplied?(unit)`, `onErrors?(problem)`, `onRevert?(unit)`, `onTheme?(theme)`, `onFlush?()` (страница отдаёт неотправленный ввод синхронно), `autoHeight = true`.
  - `Session`: `init`, `host`, `unit`, `readOnly`, `draft` (последняя отправленная или полученная правка); `change(patch) → boolean` (`false` при `readOnly`); `invalid(fields, message?)`; `height(px)`.
  - `merge(base, patch) → object` (RFC 7386); `diff(base, next) → patch` (снятое — `null`, вложенные объекты — рекурсивно, массивы — целиком).
  - Происхождение consolem — `location.ancestorOrigins[0]`, иначе происхождение `document.referrer`. Непрозрачное (`"null"`, `file://`, пусто) — отправка с `"*"`, приём с `"null"`; иначе отправка и приём — только это происхождение. Принимает только `source === window.parent` и `proto === "setup/1"`; незнакомый `type` пропускает.
  - На `flush {seq}`: `onFlush()`, затем `change` (если черновик менялся после последней отправки), затем `flushed {seq}`. На `applied` и `revert` черновик — `{}`; на `draft` — `patch`.
  - `autoHeight`: `ResizeObserver` на `document.documentElement` → `height {px: scrollHeight}`, одно значение два раза подряд не шлёт.

- [ ] **Step 1: Проверка — сначала.** `tools/check_setup_bridge.js` грузит `api/contract.js` и `api/setup-bridge.js` (`global.window = …`, как `check_server` в `check_api.py`), подделывает `parent.postMessage` (пишет `[msg, target]`), `addEventListener("message")`, `location`, `document.referrer`, `ResizeObserver`. Каждое отправленное сообщение сверяет со схемой. Печатает JSON-список отказов (пустой — всё хорошо). Сценарии и утверждения:

```js
// 1 connect({fields:["/properties/code_length"]}) → [{proto:"setup/1",type:"ready",fields:[…]}, "https://console.example"]
// 2 init из чужого source или с чужого origin → обещание connect не сбылось
// 3 init верный → session.host === init.host, session.readOnly === false, session.unit === init.unit
// 4 session.change({beep:false}) → change {patch:{beep:false}}; flush {seq:7} → onFlush вызван, затем flushed {seq:7};
//   change после последней отправки → сначала change, потом flushed
// 5 init с readOnly:true → session.change(...) === false, сообщения нет
// 6 {proto:"setup/1",type:"nope"} и {proto:"setup/2",type:"init"} → без исключения, без вызовов
// 7 ancestorOrigins ["null"] (и случай file://) → отправка с "*", init с origin "null" принят; init с origin "https://evil" не принят
// 8 ancestorOrigins нет, referrer "https://console.example/x" → отправка на "https://console.example"
// 9 session.height(480) → height {px:480}; ResizeObserver дважды с тем же scrollHeight → одно сообщение
// 10 errors → onErrors(problem); applied → onApplied(unit) и session.draft = {}; draft {patch} → onDraft и session.draft = patch
// 11 session.invalid(["/properties/display_text"], "…") → invalid; session.invalid([]) → invalid {fields:[]}
// 12 merge({a:1,b:{c:1}},{b:{c:null},d:2}) → {a:1,b:{},d:2}; diff({a:1,b:2,c:[1]},{a:1,b:3,c:[1],d:4}) → {b:3,d:4};
//    diff({a:1},{}) → {a:null}; diff(x, x) → {}
```

`check_setup_ui` в `tools/check_api.py` запускает его и добавляет отказы в проверку `"Библиотека страницы setup-bridge.js: протокол setup/1"`.

- [ ] **Step 2: Запустить.** `python3 tools/check_api.py` → `FAIL  Библиотека страницы setup-bridge.js… — api/setup-bridge.js нет`.

- [ ] **Step 3: Библиотека.** `api/setup-bridge.js` по Interfaces — обёртка `(() => { … })()`, без зависимостей, комментарий в начале: для кого, ссылка на `api/SETUP-UI.md`, что страница пишет настройки только через `change`.

- [ ] **Step 4: Запустить.** `python3 tools/check_api.py` → `PASS  Библиотека страницы setup-bridge.js: протокол setup/1`, `RESULT pass`. `python3 tools/outline.py api/setup-bridge.js` показывает функции библиотеки (лексер понял файл).

- [ ] **Step 5: Документы и коммит.** `api/README.md` («Файлы», «Что добавлено в V»), `api/SETUP-UI.md` («Библиотека»: `connect`, `Session`, `merge`, `diff`, как подключить), `api/TESTS.md`.

```bash
git add api/setup-bridge.js tools/check_setup_bridge.js tools/check_api.py api/README.md api/SETUP-UI.md api/TESTS.md
git commit -m "API: библиотека страницы api/setup-bridge.js по протоколу setup/1 и её проверка в check_api.py; контракт V"
git pull --rebase && git push
```

---

### Task 4: Тестовая страница стенда

**Files:**
- Create: `api/plugins/security_controller/setup/index.html`, `page.js`, `page.css`
- Modify: `api/README.md` («Файлы»: строка `plugins/` — тестовая страница), `api/SETUP-UI.md` (ссылка на образец)

**Interfaces:**
- Consumes: `SetupBridge.connect`, `Session` (задача 3); вид `SUI_KIND` (задача 1).
- Produces: страница с двумя своими вкладками: «Код» (`code_length`) и «Экран» (`display_text`, `backlight`, `beep`). Поле `lock_after_tries` страница нарочно не показывает: на нём проверяют строку покрытия и ошибки «не на странице». `ready.fields` = `["/properties/code_length", "/properties/display_text", "/properties/backlight", "/properties/beep"]`. Страница: `invalid` при `code_length` вне 4–8 и при `display_text` длиннее 32; поля по `errors` — красной рамкой с текстом; `readOnly` — поля неактивны, строка «Только просмотр»; `draft`, `applied`, `revert` — значения на полях; `theme` — переменные CSS из `theme.tokens`. Тексты — по `init.lang` (`ru`, иначе `en`), по `docs/TEXTS.md`. Своих кнопок сохранения нет. Без `on…` в разметке и без встроенного `<script>`: код — `page.js`, библиотека — `../../../setup-bridge.js`.

- [ ] **Step 1: Проверка — сначала.** В `tools/check_setup_bridge.js` — сценарий 13: страница не содержит `<script>` без `src`, атрибутов `on…`, `fetch(`, `XMLHttpRequest`, `WebSocket` и обращений к `/api/` (правило раздела 10: страница стенда работает без `fetch`, данные — из `init`); `ready.fields` из `page.js` — поля схемы `KEYPAD` в `demo.json`, кроме `lock_after_tries`.

- [ ] **Step 2: Запустить.** `python3 tools/check_api.py` → `FAIL … api/plugins/security_controller/setup/index.html нет`.

- [ ] **Step 3: Страница.** По Interfaces.

- [ ] **Step 4: Запустить.** `python3 tools/check_api.py` → `RESULT pass`. Открыть `SUI_TEST_PAGE` в браузере отдельно: страница пишет, что ждёт консоль, и без `init` не падает (ошибок в консоли нет).

- [ ] **Step 5: Коммит.**

```bash
git add api/plugins/security_controller/setup tools/check_setup_bridge.js api/README.md api/SETUP-UI.md
git commit -m "API: тестовая страница стенда для security_controller/KEYPAD на setup-bridge.js; контракт V"
git pull --rebase && git push
```

---

### Task 5: Прототип: копия и строка в `protos.html`

**Files:**
- Create: `index_NN_svoya-stranica.html` (копия `index.html`), `assets/i18n-en-NN.js`
- Modify: `protos.html`

- [ ] **Step 1:** `git pull --rebase`; NN — следующий номер после максимального среди `index_NN*.html` и номеров в `protos.html`, включая удалённые (`CLAUDE.md`, «Порядок создания», п. 2).
- [ ] **Step 2:** `cp index.html index_NN_svoya-stranica.html`; `git add` и коммит `Прототип NN: копия index.html` — до правок.
- [ ] **Step 3:** `assets/i18n-en-NN.js` с шапкой `// Английский прототипа NN (docs/TEXTS.md, «Как менять текст безопасно»): подключён после assets/i18n-en.js` и `Object.assign(window.I18N_EN,{});`; в прототипе `<script src="assets/i18n-en-NN.js"></script>` сразу после `assets/i18n-en.js`. Строка в `protos.html`: NN, ссылка, автор (`git config user.name`), «Своя страница подсистемы в iframe, шаг 1 (docs/contract-layers/2026-11-18-setup-ui-iframe-design.md): правило трёх ступеней, рамка, протокол setup/1, «Применить» в консоли, «Все параметры» с общим черновиком, режим сравнения. Копия index.html», статус «обсуждается». Отчёт о пробелах (`docs/axxon-one-gaps.md`, «Прототипы», шаг 1): пункта о странице подсистемы в отчёте нет — строку в `PROTO` не писать; если `grep -n "setupUi\|страниц" docs/axxon-one-gaps.html` найдёт такой пункт, добавить строку в том же push.
- [ ] **Step 4: Коммит.** `git commit -m "Прототип NN: своя страница подсистемы, шаг 1 — строка в protos.html, английский прототипа"`; `git pull --rebase && git push` (в фоне).

---

### Task 6: Хост: правило экрана, рамка, `ready`, страница не загрузилась

**Files:**
- Modify: `index_NN_svoya-stranica.html` — новый раздел `// ── Своя страница подсистемы: рамка и протокол setup/1 ──` после раздела «Базовая форма у ручного экрана…»; `tabsFor` (12630), `form` (22315), `gear` (12706: шапка и место), `paintMain` (10027: `suiSync()` после `liveSync()`), `setTheme` (8997), `setUiLang` (4243); CSS `.sui-slot`, `#suiDock`
- Modify: `assets/i18n-en-NN.js`
- Create: `tests/ui-setup-page.js`; Modify: `tests/selftest.js` (`SCENARIOS` += `"ui-setup-page.js"`), `api/TESTS.md` (раздел 2, строка сценария)

**Interfaces:**
- Consumes: `SUI_KIND`, `SUI_UNIT`, `SUI_TEST_PAGE` (задачи 1, 4); `KINDS`, `find`, `sel`, `tab`, `hwVer`, `uiLang`, `problemText`, `API.post`, `isSchemaNode`, `tabsForHand`, `schemaHeadHtml`, `unitActionsHtml`, `schemaStateHtml`, `ruleUsesFor`, `schemaFormHtml`.
- Produces (имена части 06 — их таблица «Что берём из части 05»):
  - `SUI_PROTO = "setup/1"`, `SUI_READY_MS = 10000`, `SUI_FLUSH_MS = 2000`, `SUI_APPLY = "button"`, `SUI_MECH_TABS = new Set(["acc"])`, `SUI_THEME_TOKENS` (Р11).
  - `suiKindOf(n) → setupUi | null` — `mode: "iframe"`, `(protocol || "setup/1") === SUI_PROTO`, вид в `kinds` (нет `kinds` — свой вид).
  - `suiOn(n) → boolean` — `suiKindOf(n)` и `setupUi` в `n._caps`, у узла полная запись (`!n._row`).
  - `suiFrame: {uid, kind, el, win, url, origin, star, lang, state: "loading"|"ready"|"failed", ready, why, readOnly, fields: string[]|null, invalid: {fields, message}|null, pageDraft, unitVersion, seq, flushWait: Map<seq, resolve>, applying: null|"run"|"ok", applyQ, gen} | null` — одна рамка на страницу; `readOnly` — из `SetupUiLink.readOnly`.
  - `suiOpen(n): Promise<void>` — `POST /units/{uid}/setup-ui`; ответ для другого `sel` или устаревшего `gen` — пропуск; адрес `javascript:|data:|vbscript:` — `suiFail`; `star` — по правилу стенда; `origin` — `link.origin || setupUi.origin || new URL(url, document.baseURI).origin`, непрозрачное без `star` — `suiFail`; рамка в `#suiDock`, `sandbox` по `star`, `title` — i18n «Страница подсистемы»; таймер `SUI_READY_MS` → `suiFail(i18n("Страница не ответила за 10 секунд"))`.
  - `suiClose(): void`; `suiFail(why: string): void` (рамка убрана, `state = "failed"`, `gear()`); `suiRetry(): void` (кнопка `[data-sui-retry]`).
  - `suiSync(): void` — после каждой `paintMain`: нет `suiOn(sel)` → `suiClose()`; другой `uid` или другой `uiLang` → `suiClose()` и `suiOpen()`; затем `suiPlace()` и сверка черновика и версии (задача 7).
  - `suiPlace(): void` — док поверх `[data-sui-slot]`, `clip-path` по видимой области `.sc`; слушатели `scroll` (захват на `#main`), `resize`, `ResizeObserver` места.
  - `suiOnMessage(e: MessageEvent): void` — `e.source === suiFrame.win`, `e.origin === (star ? "null" : origin)`, `data.proto === SUI_PROTO`; вызов `SUI_ON[data.type]`; незнакомое — пропуск.
  - `SUI_ON: {ready, change, invalid, height, flushed}` — таблица обработчиков (часть 06 добавит свои).
  - `suiPost(type: string, data: object): void` — единственная отправка странице: `win.postMessage({proto: SUI_PROTO, type, ...data}, star ? "*" : origin)`.
  - `suiHostInfo() → {proto: "setup/1", apply: SUI_APPLY}`; `suiTheme() → {mode, tokens}`; `suiUnitOf(n) → {uid, kind, name, version, properties, status?}` (у объекта по схеме `properties` — снимок «до» черновика, у ручного — `unitProps.get(uid)`); `suiInitMsg(n) → init без proto и type`.
  - `suiCardHtml(n) → string` — `schemaHeadHtml` + `[data-sui-slot]` (внутри — строка «Консоль загружает страницу подсистемы…» до `ready`) + `[data-sui-errs]` (задача 7) + `unitActionsHtml` + `schemaStateHtml` + `ruleUsesFor`. Сбой — `[data-sui-fail]`: «Страница подсистемы недоступна, поэтому консоль показывает все параметры по схеме вида.» + причина + `[data-sui-retry]` «Повторить», ниже — форма по схеме.

- [ ] **Step 1: Сценарий — сначала.** `tests/ui-setup-page.js`, начало: `if (typeof suiOn !== "function") { ok(true, "своей страницы подсистемы на этой странице нет: проверять нечего"); return; }`. Шпион: `const sent = []; const realPost = suiPost; suiPost = (t, d) => { sent.push({ proto: "setup/1", type: t, ...d }); return realPost(t, d); };` (функция глобальная). Схема — `<script src="api/setup-ui.schema.js">` в `document.head`, ждать `window.CONSOLEM_SETUP_UI_SCHEMA`; `valid(m)` — `ConsolemContract.check({components: {schemas: S.$defs}}, S.$defs[m.type], m, m.type, [])` пусто. Проверки:

```js
// открыть SUI_UNIT (pick, until !find(uid).n._row)
ok(suiOn(n) && JSON.stringify(tabsFor(n)) === JSON.stringify([["gen","Настройка"]]), "вид с iframe: одна вкладка «Настройка»");
ok(!!main().querySelector("[data-sui-slot]") && !main().querySelector("[data-schema-card]"), "страница вместо формы по схеме");
const fr = document.querySelector("#suiDock iframe");
ok(fr && fr.getAttribute("sandbox") === "allow-scripts allow-forms" && /api\/plugins\/security_controller\/setup\/index\.html\?/.test(fr.src) && fr.src.includes("id=" + uid),
   "стенд: рамка без allow-same-origin, адрес тестовой страницы");
ok(await until(() => suiFrame?.state === "ready"), "страница прислала ready");
const init = sent.find((m) => m.type === "init");
ok(valid(init) && JSON.stringify(init.host) === '{"proto":"setup/1","apply":"button"}' && init.readOnly === false && init.unit.version === hwVer.get(uid) && JSON.stringify(init.draft) === "{}",
   "init: по схеме, host шага 1 без bridge, readOnly false, версия объекта");
ok(JSON.stringify(suiFrame.fields) === JSON.stringify(["/properties/code_length","/properties/display_text","/properties/backlight","/properties/beep"]), "ready.fields — четыре поля");
ok(await until(() => parseInt(main().querySelector("[data-sui-slot]").style.height) > 80), "высота места — по сообщению height");
// перерисовка не трогает рамку (Review Focus 1)
const el0 = suiFrame.el; gear(); paint(); apiOnEvent({ type: "unit.changed", uid: <камера набора> /* чужой объект */ });
ok(suiFrame.el === el0 && el0.isConnected && sent.filter((m) => m.type === "init").length === 1, "перерисовка не трогает рамку");
// ручной экран с iframe: остаются вкладки механизма
// KINDS.get("camera").setupUi = {mode:"iframe"}; find(cam).n._caps = ["setupUi"]
ok(JSON.stringify(tabsFor(camNode)) === JSON.stringify([["gen","Настройка"],["acc","Доступ"]]), "камера со страницей: «Настройка» и «Доступ»"); // вернуть как было
// незнакомая версия протокола (Review Focus 4): setupUi.protocol = "setup/9" → suiOn false, вкладки по схеме; вернуть
// mode tab — прежняя ссылка: у CONTROLLER main() содержит a[data-plugin]
// поздний адрес (Review Focus 3): API.raw задерживает POST /setup-ui на 500 мс; pick(SUI_UNIT), сразу pick(камера);
//   после 1 с — suiFrame === null и в #suiDock нет iframe
// не загрузилась: API.raw → {url:"api/plugins/security_controller/langs/ru.json", expiresAt, readOnly:false}
ok(await until(() => suiFrame?.state === "failed", 15000) && /не ответила за 10 секунд/.test(main().textContent) && !!main().querySelector("[data-schema-card]") && !!main().querySelector("[data-sui-retry]"),
   "нет ready за 10 с — текст с причиной и форма по схеме");
// 500 на POST /setup-ui → state "failed", в тексте problemText ответа; вернуть API.raw, «Повторить» → state "ready"
// уход: pick(камера) → suiFrame === null, в #suiDock нет iframe
```

- [ ] **Step 2: Запустить.** `python3 tools/check_ui.py --page index_NN_svoya-stranica.html tests/ui-setup-page.js` → `FAIL` (`suiOn` есть только после шага 3 — до него сценарий пишет «проверять нечего»: сначала добавить пустые объявления `suiOn`, `suiPost` и убедиться, что проверки падают). `python3 tools/check_ui.py tests/ui-setup-page.js` (на `index.html`) → `1 из 1`, «проверять нечего».

- [ ] **Step 3: Код.** Функции из Interfaces. В `tabsFor`: первая строка — `if(suiOn(n)&&suiFrame?.state!=="failed"&&!cardFormAll(n))return[["gen","Настройка"]].concat(isSchemaNode(n)?[]:tabsForHand(n).filter(([id])=>SUI_MECH_TABS.has(id)));` (`suiFrame` другого `uid` считается как «ещё нет»). В `form(n)`: `if(suiOn(n)&&tab==="gen"&&!cardFormAll(n))return suiCardHtml(n);`. У сбоя — `formBase(n)` с `[data-sui-fail]` сверху. Слушатель `message` — один, `window.addEventListener("message", suiOnMessage)`. `SUI_ON.ready`: `state = "ready"`, снять таймер, `fields` (только строки-указатели), `suiPost("init", suiInitMsg(n))`, `gear()`. `SUI_ON.height`: `px` — число, зажать (Р7), стиль места `height`, `suiPlace()`. `setTheme` → `suiFrame?.ready && suiPost("theme", {theme: suiTheme()})`. Новые тексты — ключи `i18n`, английский в `assets/i18n-en-NN.js`: «Страница подсистемы» — “Subsystem page”; «Консоль загружает страницу подсистемы…» — “The console loads the subsystem page…”; «Страница подсистемы недоступна, поэтому консоль показывает все параметры по схеме вида.» — “The subsystem page is not available, so the console shows all parameters from the kind schema.”; «Причина» — “Reason”; «Страница не ответила за 10 секунд» — “The page did not reply in 10 seconds”; «Сервер не выдал адрес страницы» — “The server did not give the page address”; «Повторить» (если ключа нет). «Настройка» уже есть.

- [ ] **Step 4: Запустить.** Та же команда на прототипе → все `PASS`; на `index.html` → `PASS` «проверять нечего». Открыть прототип в браузере: `index_NN_svoya-stranica.html#node=<SUI_UNIT>&tab=gen` — страница в карточке, прокрутка `.sc` двигает рамку вместе с карточкой, модальные окна и меню — поверх рамки, ошибок в консоли нет.

- [ ] **Step 5: Коммит.** `git add index_NN_svoya-stranica.html assets/i18n-en-NN.js tests/ui-setup-page.js tests/selftest.js api/TESTS.md`; `git commit -m "Прототип NN: своя страница подсистемы — правило экрана, рамка вне разметки карточки, ready и init, страница не загрузилась; тест ui-setup-page.js"`; `git pull --rebase && git push`.

---

### Task 7: Правка и «Применить»: `change`, `invalid`, `flush`, `applied`, `errors`, `revert`, `readOnly`

**Files:**
- Modify: `index_NN_svoya-stranica.html` — раздел страницы подсистемы; `cardFootHtml`, `cardPlan`, `schemaValidate`, `cardApply`, `queueFinish`
- Modify: `assets/i18n-en-NN.js`, `tests/ui-setup-page.js`

**Interfaces:**
- Consumes: `cardEnsureBase`, `cardDraft`, `cardDiff`, `cardReset`, `setD`, `schemaValidate`, `cardPlanOpen`, `apiQueue`, `queueFinish`, `hwApplyUnit`, `toast`, `formAllSet`.
- Produces:
  - `suiMerge(base, patch) → object`, `suiPatch(base, next) → patch` — как `SetupBridge.merge` и `diff` (свои две функции: `index.html` библиотеку страницы не подключает).
  - `suiDraftOf(n) → patch` — объект по схеме: `suiPatch(снимок props, n.props)`; ручной: изменённое в `n.xprops` (по `baseChanged`).
  - `suiDraftApply(n, patch): void` — ключи вне схемы, `readOnly`, `x-transient` отброшены (Р10); объект по схеме: `n.props = suiMerge(снимок, patch)`; ручной: `n.xprops = {...patch}`; `setD(true)`, `cardFootRefresh()`; `suiFrame.pageDraft = patch`.
  - `SUI_ON.change` — при `readOnly` пропуск; иначе `suiDraftApply`. `SUI_ON.invalid` — `suiFrame.invalid = fields.length ? {fields, message} : null`, `cardFootRefresh()`. `SUI_ON.flushed` — `flushWait.get(seq)?.(true)`.
  - `suiFlush() → Promise<boolean>` — `seq += 1`, `suiPost("flush", {seq})`, ждать `flushed` не дольше `SUI_FLUSH_MS`; нет ответа — `false` и уведомление «Страница не ответила за 2 секунды. Консоль применит изменения, которые страница прислала раньше.».
  - `suiFootBlock() → string` — причина, по которой «Показать план» неактивна: `invalid` — «Страница нашла ошибку ввода. Чтобы показать план, исправить ошибку на странице.»; иначе `""`.
  - `suiErrors(n, problem): void` — `suiPost("errors", {problem})`; ошибки с `field` вне `suiFrame.fields` (или все, если `fields` нет) — список `[data-sui-errs]` под местом: «Сервер не примет поля, которых нет на странице. Чтобы исправить их, открыть «Все параметры».» + подписи полей (`propLabel`) + кнопка «Все параметры» (`formAllSet(true)`).
  - `suiQueueDone(q): void` — в конце `queueFinish()`: очередь этой рамки (`suiFrame.applyQ === q`) прошла без отказов — `GET /units/{uid}` → `hwApplyUnit` → `applying = "ok"`; с отказами — `applying = null`; затем `suiSync()`.
  - Сверка в `suiSync()` (Р9), когда `ready` и `applying !== "run"`: версия `hwVer.get(uid)` ≠ `unitVersion` и `applying === "ok"` → `applied {unit}`, `applying = null`; версия другая без своей записи, черновик пуст → `revert {unit}`; версия та же, `suiDraftOf(n)` ≠ `pageDraft`: черновик пуст → `revert {unit}`, иначе → `draft {patch}`. После отправки `unitVersion` и `pageDraft` — текущие.
  - `readOnly` из `SetupUiLink.readOnly` → `init.readOnly`; при `readOnly` нет подвала карточки, над местом — `[data-sui-ro]` «У вас есть только право на просмотр, поэтому консоль не применит изменения на странице.».

- [ ] **Step 1: Сценарий — сначала.** Дописать в `tests/ui-setup-page.js` (после `ready` у `SUI_UNIT`). Сообщение «от страницы» — `const fromPage = (d) => window.dispatchEvent(new MessageEvent("message", { data: { proto: "setup/1", ...d }, origin: "null", source: suiFrame.win }));`.

```js
fromPage({ type: "change", patch: { display_text: "Код, пожалуйста" } });
ok(cardDiff().length === 1 && find(uid).n.props.display_text === "Код, пожалуйста" && !!document.querySelector("#cardFoot:not([hidden])"), "change — строка черновика, подвал виден");
// Review Focus 5: ключи вне схемы и readOnly-поле
fromPage({ type: "change", patch: { display_text: "Код, пожалуйста", nope: 1 } });
ok(cardDiff().length === 1 && !("nope" in find(uid).n.props), "ключ вне схемы не попадает в черновик");
// Review Focus 2: не от рамки
window.dispatchEvent(new MessageEvent("message", { data: { proto: "setup/1", type: "change", patch: { beep: false } }, origin: "null", source: window }));
ok(find(uid).n.props.beep === true, "сообщение не от рамки пропущено");
fromPage({ type: "invalid", fields: ["/properties/display_text"], message: "x" });
ok(!!document.querySelector("#cardFoot button.pri[disabled]"), "invalid — «Показать план» неактивна");
fromPage({ type: "invalid", fields: [] });
ok(!document.querySelector("#cardFoot button.pri[disabled]"), "пустой invalid снимает запрет");
cardPlan();
ok(await until(() => sent.some((m) => m.type === "flush")) && await until(() => document.getElementById("bmodal").classList.contains("open")), "план: сначала flush, страница ответила flushed, план открыт");
document.querySelector('#bmodal .btn.pri').click();
ok(await until(() => sent.some((m) => m.type === "applied")), "applied после «Применить»");
const ap = sent.filter((m) => m.type === "applied").pop();
ok(valid(ap) && ap.unit.properties.display_text === "Код, пожалуйста" && (await API.get(`/units/${uid}`)).properties.display_text === "Код, пожалуйста" && !cardDiff().length,
   "сервер записал, странице — новый unit, черновик пуст");
// 422: поле на странице
fromPage({ type: "change", patch: { code_length: 12 } }); cardPlan();
ok(await until(() => sent.some((m) => m.type === "errors")) && !document.getElementById("bmodal").classList.contains("open"), "422 — errors странице, плана нет");
const er = sent.filter((m) => m.type === "errors").pop();
ok(valid(er) && er.problem.errors.some((e) => e.field === "/properties/code_length") && !main().querySelector("[data-sui-errs]"), "ошибка поля страницы — только странице");
// 422: поле не на странице
fromPage({ type: "change", patch: { lock_after_tries: 99 } }); cardPlan();
ok(await until(() => /Блокировать после попыток/.test(main().querySelector("[data-sui-errs]")?.textContent || "")), "ошибка поля вне страницы — списком под рамкой");
cardReset();
ok(await until(() => sent.at(-1).type === "revert") && valid(sent.at(-1)), "«Сбросить» — revert");
// flush без ответа: suiPost пропускает flush
// suiPost = (t, d) => { sent.push(...); if (t !== "flush") realPost(t, d); }; change; cardPlan();
ok(/* за 2 с вирт. времени */ /не ответила за 2 секунды/.test(document.getElementById("tt")?.textContent || "") && document.getElementById("bmodal").classList.contains("open"), "нет flushed за 2 с — уведомление, план всё равно открыт");
// readOnly: API.raw дописывает readOnly:true в ответ POST /setup-ui; suiClose(); gear()
ok(await until(() => sent.filter((m) => m.type === "init").pop()?.readOnly === true) && !!main().querySelector("[data-sui-ro]"), "readOnly — init.readOnly true, строка о праве");
fromPage({ type: "change", patch: { beep: false } });
ok(!cardDiff().length && document.getElementById("cardFoot")?.hidden === true, "readOnly — change не принят, подвала нет");
// тема: setTheme("light") → последний theme.mode "light"; вернуть
// язык: setUiLang("en") → новая рамка (el ≠ прежней), новый init с lang "en", черновик прежний; setUiLang("ru")
// высота: fromPage({type:"height", px:-5}) → место 80 px; fromPage({type:"height", px:1e9}) → 20000 px
```

- [ ] **Step 2: Запустить.** `python3 tools/check_ui.py --page index_NN_svoya-stranica.html tests/ui-setup-page.js` → новые проверки `FAIL`.

- [ ] **Step 3: Код.** Функции из Interfaces. `cardFootHtml`: у «Показать план» `disabled` и `title` из `suiFootBlock()`, если он не пуст. `cardPlan(flushed)`: если `!flushed`, у `cardDraft.id` открыта готовая рамка — `suiFlush().then(() => cardPlan(true))` и выход; `suiFootBlock()` не пуст — уведомление с причиной и выход. `schemaValidate`: при отказе и `suiFrame?.uid === n.id` — `suiErrors(n, {code: "VALIDATION_FAILED", message: …, errors: errs})`. `cardApply`: у рамки этого объекта — `applying = "run"`, `applyQ = bq` после `apiQueue`. `queueFinish`: последним — `suiQueueDone(bq)`. Новые тексты — ключи `i18n` и английский: “The page did not reply in 2 seconds. The console applies the changes that the page sent before.”; “The page found an input error. To show the plan, correct the error on the page.”; “The server does not accept fields that are not on the page. To correct them, open “All parameters”.”; “You have only the view right, so the console does not apply changes on the page.”.

- [ ] **Step 4: Запустить.** Та же команда → все `PASS`; `python3 tools/check_ui.py tests/ui-setup-page.js` на `index.html` → «проверять нечего».

- [ ] **Step 5: Коммит.** `git commit -m "Прототип NN: своя страница подсистемы — правка страницы в черновике карточки, flush перед планом, applied, errors, revert, только просмотр; тест ui-setup-page.js"`; `git pull --rebase && git push`.

---

### Task 8: «Все параметры» у страницы — общий черновик

**Files:**
- Modify: `index_NN_svoya-stranica.html` — `hasBaseForm` (5368) не трогать; новая `hasAllForm(n)`; `cardFormAll` (5374), `formAllSet` (5377), `formAllCtxItem` (5388), `baseFormHtml` (5439); `assets/i18n-en-NN.js`; `tests/ui-setup-page.js`

**Interfaces:**
- Consumes: `formAllByKind`, `tabMemKey`, `schemaFormHtml`, `schemaTabs`, `suiSync` (задача 7).
- Produces: `hasAllForm(n) → boolean` = `hasBaseForm(n) || (isSchemaNode(n) && suiOn(n))`. `cardFormAll`, `formAllSet`, `formAllCtxItem` берут `hasAllForm` вместо `hasBaseForm`. `xpropsEnsure` по-прежнему по `hasBaseForm`: у объекта по схеме `n.xprops` не появляется (иначе `cardDiffNode` покажет строку `xprops`). У объекта по схеме со страницей `baseFormHtml` = строка `[data-base-head]` (прежняя, с «Вернуться к настройке» без запрета) + `schemaFormHtml(n, tab)`, вкладки — `schemaTabs`. Запрет `FORM_BACK_WHY` — только у ручного экрана (у объекта по схеме `baseChanged` пуст). Пока открыты «Все параметры», места рамки нет, док скрыт, рамка жива; по возвращении `suiSync` шлёт `draft`.

- [ ] **Step 1: Сценарий — сначала.**

```js
fromPage({ type: "change", patch: { display_text: "А" } });
formAllSet(true);
ok(await until(() => !!main().querySelector("[data-schema-card]")) && sf("display_text").value === "А" && document.getElementById("suiDock").hidden && suiFrame.el.isConnected,
   "«Все параметры»: форма по схеме с правкой страницы, рамка скрыта, но жива");
ok(!find(uid).n.xprops && cardDiff().length === 1, "у объекта по схеме нет xprops, строка черновика одна");
type(sf("display_text"), "Б");
formAllSet(false);
ok(await until(() => sent.at(-1).type === "draft") && sent.at(-1).patch.display_text === "Б" && valid(sent.at(-1)), "вернулись — странице draft с правкой формы");
ok(/Все параметры/.test(formAllCtxItem(find(uid).n, (f, v) => ["x"]) || ""), "пункт «Все параметры» в «Ещё» у страницы");
cardReset();
```

- [ ] **Step 2: Запустить** → новые проверки `FAIL`.
- [ ] **Step 3: Код** по Interfaces. Текст строки `[data-base-head]` у страницы — прежний ключ «Все параметры вида»; новых ключей нет, если строка та же.
- [ ] **Step 4: Запустить** → все `PASS`.
- [ ] **Step 5: Коммит.** `git commit -m "Прототип NN: своя страница подсистемы — «Все параметры» с общим черновиком страницы и формы по схеме; тест ui-setup-page.js"`; `git pull --rebase && git push`.

---

### Task 9: Режим сравнения (только прототип)

**Files:**
- Modify: `index_NN_svoya-stranica.html` — новый раздел `// ── Режим сравнения: свой экран и общие настройки ──`; `gear` (шапка: `cmpSwitchHtml(n)` перед `cardMoreBtn(n)`; строка покрытия над `form`/`baseFormHtml`), `cardFormAll`; CSS переключателя и строки; `assets/i18n-en-NN.js`; `tests/ui-setup-page.js`

**Interfaces:**
- Consumes: `hasAllForm`, `KIND_PROFILES`, `kindExtraProps`, `sfEntries`, `baseChanged`, `FORM_BACK_WHY`, `suiFrame.fields`.
- Produces:
  - `CMP_KEY = "consolem.cmpGeneral"`; `cmpGeneral: boolean` (читается из `localStorage` при старте); `cmpSet(v: boolean): void` — у ручного экрана с `baseChanged(n).length` или `ownDraftRows(n).length` — уведомление `FORM_BACK_WHY`, переключения нет; иначе пишет `localStorage`, `tab = tabKeep(n)`, `gear()`.
  - `cardFormAll(n)` = `hasAllForm(n) && (cmpGeneral || formAllByKind.get(tabMemKey(n)) === true)`.
  - `cmpSwitchHtml(n) → string` — только при `hasAllForm(n)`: две кнопки «Свой» / «Общие» (`role="radiogroup"`, `aria-checked`), `data-cmp`.
  - `suiCoverOf(n) → {own: string[]|null, schema: string[], missing: string[], extra: string[]}` — `schema` — поля `sfEntries` схемы вида без `x-transient` и `x-hidden`; `own` — у страницы `suiFrame.fields` → имена (`null`, если не прислала), у ручного — объединение `KIND_PROFILES.get(id).properties` по `implements`.
  - `suiCoverHtml(n) → string` — `[data-cover]` над экраном в обоих положениях: «Свой экран показывает N из M полей вида.»; «Нет на своём экране» + кнопка-раскрытие ▸ со списком `missing`; при `extra` — отдельная строка «Свой экран называет поля, которых нет в схеме вида. Это ошибка описания вида.» и список; `own === null` — «Страница не сообщила свои поля». Раскрытие не двигает соседей (`CLAUDE.md`).
  - `suiCoverToggle(): void`.

- [ ] **Step 1: Сценарий — сначала.**

```js
const c = suiCoverOf(find(uid).n);
ok(JSON.stringify(c.missing) === '["lock_after_tries"]' && !c.extra.length && /4 из 5/.test(main().querySelector("[data-cover]")?.textContent || ""), "покрытие страницы: 4 из 5, не показан lock_after_tries");
ok(JSON.stringify(suiCoverOf(camNode).missing) === JSON.stringify(kindExtraProps("camera")), "покрытие ручного экрана — по профилям вида");
suiFrame.fields = ["/properties/code_length", "/properties/nope"]; gear();
ok(JSON.stringify(suiCoverOf(find(uid).n).extra) === '["nope"]' && /ошибка описания/.test(main().textContent), "поле вне схемы — отдельной строкой");
suiFrame.fields = null; gear();
ok(/Страница не сообщила свои поля/.test(main().textContent), "без ready.fields — строка об этом");
ok(!!main().querySelector("[data-cmp]") && !cmpSwitchHtml(find(<test.unknown>).n), "переключатель — только у объекта со своим экраном");
cmpSet(true);
ok(localStorage.getItem("consolem.cmpGeneral") === "1" && !!main().querySelector("[data-schema-card]"), "«Общие» — форма по схеме и запомнено");
// pick(камера) → cardFormAll(cam) === true (переключатель перекрывает formAllByKind)
// камера: правка ручного экрана (имя) → cmpSet(false) → уведомление FORM_BACK_WHY, cmpGeneral остаётся true; cardReset()
cmpSet(false);
ok(localStorage.getItem("consolem.cmpGeneral") === "0" && !cardFormAll(find(uid).n), "«Свой» — снова страница");
```

- [ ] **Step 2: Запустить** → новые проверки `FAIL`.
- [ ] **Step 3: Код** по Interfaces. Тексты и английский: «Свой» — “Own”; «Общие» — “General” (если ключа нет; «Общие» есть как имя вкладки — проверить `assets/i18n-en.js`, перевод не менять); «Свой экран показывает» — “The own screen shows”; «из» уже есть; «полей вида» — “fields of the kind”; «Нет на своём экране» — “Not on the own screen”; «Свой экран называет поля, которых нет в схеме вида. Это ошибка описания вида.» — “The own screen names fields that are not in the kind schema. This is an error in the kind description.”; «Страница не сообщила свои поля» — “The page did not report its fields”.
- [ ] **Step 4: Запустить** → все `PASS`. В браузере: переключатель справа перед «Ещё», выбор держится после перезагрузки страницы.
- [ ] **Step 5: Коммит.** `git commit -m "Прототип NN: режим сравнения — переключатель «Свой / Общие» и строка покрытия полей; тест ui-setup-page.js"`; `git pull --rebase && git push`.

---

### Task 10: Запрос к w2c: шаг 1 в контракте V

**Files:**
- Create: `api/requests/<ГГГГ-ММ-ДД-ЧЧММССZ>-owner-setup-ui-step1-request.md`
- Modify: `api/requests/README.md` (строка таблицы)

- [ ] **Step 1:** Перед записью — скиллы `api-contract` («Запрос вместо правки», п. 1) и `vms-requests`. Шапка: дата, коммит контракта V из `origin/main`, «Кому: w2c», «Статус: новый». Основа — запрос `2026-11-18-120707Z-owner-setup-ui-iframe-request.md` (не дубль: тот о стороне w2c, этот — что уже есть в контракте). Пункты:
  1. `SetupUiLink.readOnly` и правило «у `iframe` адрес — всегда `POST /units/{uid}/setup-ui`» (Р2): бэкенд ставит `readOnly` по праву человека;
  2. `setupUi.protocol` (`setup/1`), `origin` у `setupUi` и `SetupUiLink` — когда их заполнять;
  3. протокол — `api/SETUP-UI.md` и `api/setup-ui.schema.json`; библиотека `api/setup-bridge.js` для страниц подсистем и для psim-sdk;
  4. право `view` у `iframe`, `edit` у `tab` — в `capabilities` и в пути;
  5. относительный адрес — только на стенде, бэкенд отдаёт абсолютный.
- [ ] **Step 2: Коммит.** `git add api/requests/…-owner-setup-ui-step1-request.md api/requests/README.md`; `git commit -m "API: запрос владельца к w2c — своя страница подсистемы, шаг 1 в контракте V: readOnly, protocol, origin, протокол и библиотека"`; `git pull --rebase && git push`.

---

### Task 11: Полная проверка прототипа и перенос в `index.html`

Задача выполняется по слову владельца («прототип готов», «перенеси из прототипа NN в основной») — по скиллу `proto-promote`.

**Files:**
- Modify: `index.html`, `assets/i18n-en.js`, `CHANGES.md`, `protos.html`, `api/FRONTEND.md` (абзац о форме по схеме: своя страница, протокол, «Все параметры»), `api/ACCEPTANCE.md` (п. «Страница плагина» → шаги для `iframe`: страница в карточке, «Показать план», только просмотр, страница не загрузилась)
- Delete or keep: `index_NN_svoya-stranica.html` и `assets/i18n-en-NN.js` (по В2)

- [ ] **Step 1: Полная проверка прототипа.** `python3 tools/check_ui.py --page index_NN_svoya-stranica.html` → `RESULT pass`; `index_NN_svoya-stranica.html?selftest` (`python3 tools/check_ui.py --page index_NN_svoya-stranica.html --selftest`) → `RESULT pass`. Дерево, кэш, поиск, выбор и поток задача не трогала, поэтому `check_perf --page` не нужен.
- [ ] **Step 2: Перенос.** В `index.html` поверх текущего — разделы задач 6–8 и правки `tabsFor`, `form`, `gear`, `paintMain`, `setTheme`, `cardFootHtml`, `cardPlan`, `schemaValidate`, `cardApply`, `queueFinish`, `cardFormAll`, `formAllSet`, `formAllCtxItem`, `baseFormHtml`; режим сравнения (задача 9) — только по В2. `schemaPluginLink` (`mode: tab`) остаётся. Английский — из `assets/i18n-en-NN.js` в `assets/i18n-en.js` под заголовком `// Своя страница подсистемы (контракт V)`.
- [ ] **Step 3: Проверки `index.html`.** `python3 tools/check_api.py`, `python3 tools/run_api_tests.py`, `python3 tools/check_ui.py` (теперь `tests/ui-setup-page.js` идёт на `index.html` целиком; `tests/ui-unknown.js` — без изменений и `PASS`), `python3 tools/check_perf.py --quick` → `RESULT pass` / в пределах разброса. `python3 tools/outline.py --check` проходит на `index.html` (опоры `tabsFor` и разделов). `python3 tools/build_webui.py` собирает без отказа (новых подключений файлов нет).
- [ ] **Step 4: Коммит и записи.** `CHANGES.md` — запись; `protos.html` — статус «принят» или «частично принят: перенесено …, режим сравнения — в прототипе»; отчёт о пробелах — `proto-promote`, шаг 5 (пунктов `PROTO` нет — проверить `grep` по «страниц» и «плагин» и поправить задетые пункты `G`). `git commit -m "Макет: из прототипа NN — своя страница подсистемы в iframe, шаг 1: правило трёх ступеней, рамка, протокол setup/1, «Применить» в консоли, «Все параметры» с общим черновиком; контракт V"`; `git pull --rebase && git push`. Принят целиком — `git rm` прототипа и его `assets/i18n-en-NN.js`, «(удалён)» в `protos.html`, коммит `Прототип NN: удалён — перенесён в index.html`.

---

## Открытые вопросы владельцу

- **В1. `readOnly` и постоянный `url` у `iframe` (Р2).** План берёт `readOnly` из `SetupUiLink.readOnly` и поэтому у `mode: iframe` всегда зовёт `POST /units/{uid}/setup-ui`, даже при постоянном `url` (описание решения, раздел 5, допускает постоянный адрес без вызова). Другой путь — общая отметка `edit` в `Unit.capabilities` у каждого объекта (она закрыла бы и форму по схеме у человека с правом `view`), но она меняет ответ `GET /units/{uid}` у всех видов. Принимаете Р2?
- **В2. Режим сравнения в основном макете.** Описание решения оставляет его прототипу. План не переносит его в `index.html`, прототип остаётся «частично принят». Переносить ли переключатель и строку покрытия?
- **В3. Карточки consolem под страницей.** «Команды», «Состояние», «Правила автоматизации» план оставляет под рамкой (Р1). На шаге 2 страница сможет запускать команды сама (`runUnitAction`), и кнопки задвоятся. Оставить их на шаге 1 и решить в части 06?

## Что не входит

- Шаг 2: `call`/`result`, `subscribe`/`event`, `navigate`, `confirm`, разметка `x-bridge`, `init.host.bridge`, тестовая страница «сложного» экрана — часть 06.
- Режим «Применение при уходе» (`apply: "leave"`) и предупреждение `beforeunload` при непустом черновике: протокол к нему готов (`flush`/`flushed`, `init.host.apply`), сам режим — решение для всего consolem.
- Работа в psim-sdk (ADR, эмулятор, шаблон генератора, `railway_detector`) и на стороне w2c (манифест `mode: iframe`, заголовки двери, кука, WebSocket, CSP оболочки) — запросы и разговор с авторами.
- Правка `api/plugins/security_controller/plugin.json`: у ресурса `setup_ui` в манифесте psim нет поля `mode`, его вводит ADR psim-sdk.
- Ручной экран со своей страницей в наборе: в `demo.json` нет вида с ручным экраном и `mode: iframe`; ветка ручного экрана проверяется подменой описания в сценарии.
- Проверка черновика сервером на ходу (Р6), видео и свои пути сервера страницы (раздел 8 описания).

## Interfaces для части 06

| Что | Имя | Формат |
|---|---|---|
| раздел хоста | `// ── Своя страница подсистемы: рамка и протокол setup/1 ──` | — |
| состояние рамки | `suiFrame` | `{uid, kind, el, win, url, origin, star, lang, state, ready, why, readOnly, fields, invalid, pageDraft, unitVersion, seq, flushWait, applying, applyQ, gen} \| null` |
| отправка | `suiPost(type, data)` | `{proto: "setup/1", type, ...data}` на `origin` или `"*"` (`star`) |
| приём | `suiOnMessage(e)`, таблица `SUI_ON` | шаг 1: `ready`, `change`, `invalid`, `height`, `flushed`; часть 06 дописывает свои ключи |
| `init.host` | `suiHostInfo()` | шаг 1: ровно `{proto: "setup/1", apply: "button"}`; `$defs.host` — `additionalProperties: false`, часть 06 добавляет `bridge` |
| прочее хоста | `suiOn(n)`, `suiKindOf(n)`, `suiOpen(n)`, `suiClose()`, `suiFail(why)`, `suiSync()`, `suiPlace()`, `suiInitMsg(n)`, `suiUnitOf(n)`, `suiDraftOf(n)`, `suiDraftApply(n, patch)`, `suiMerge`, `suiPatch`, `suiFlush()`, `suiErrors(n, problem)`, `suiFootBlock()`, `suiQueueDone(q)`, `hasAllForm(n)`, `SUI_MECH_TABS` | задачи 6–8 |
| библиотека | `SetupBridge.connect(opts) → Promise<Session>`; `Session {init, host, unit, readOnly, draft, change, invalid, height}`; `SetupBridge.merge`, `SetupBridge.diff` | задача 3 |
| стенд | `SUI_KIND = "security_controller/KEYPAD"`, `SUI_UNIT = "30000306-0000-4000-8000-000000000000"`, `SUI_TEST_PAGE = "api/plugins/security_controller/setup/index.html"` (+ `page.js`, `page.css`) | задачи 1, 4 |
| схема | `api/setup-ui.schema.json`: `$defs` по `type`, общие `unit`, `themeSpec`, `host`, `pointer`, `mergePatch`, `problem`, `problemError`; `x-direction`, `x-step`; `examples`. Сборка — `window.CONSOLEM_SETUP_UI_SCHEMA` | задача 2 |
| проверки | `tools/check_setup_bridge.js` (Node), проверки `check_api.py` «Протокол страницы setup/1…» и «Библиотека страницы setup-bridge.js…», сценарий `tests/ui-setup-page.js` (шпион `suiPost`, `fromPage`) | задачи 2, 3, 6 |
