# Версии контракта по слоям

Таблица говорит, кому из бэкендов делать каждую версию контракта с 0.3.0 по текущую. Слой версии — это слой её схем и путей в `api/openapi.json` (расширение `x-layer`, [«Слои контракта» в `api/README.md`](../../api/README.md)).

## Как читать

- **Столбец «Слой» отвечает на вопрос: кому делать версию.** Механизм делает каждый бэкенд. Профиль делает тот бэкенд, который его объявил. Так w2c переходит с 0.2.0 сразу на механизм: он делает строки «механизм» и строки тех профилей, которые объявит.
- **`video`** — просмотр, архив, выгрузка. Их заберёт будущий API видео.
- **`vms`** — часть VMS без своего профиля. Часть 04 переделки по слоям вынесет её из механизма.
- **«механизм; `профиль`»** — смешанная версия. Что из неё механизм, а что профиль, написано в столбце «Что».
- Столбец «Слой» содержит «механизм» или значения `x-layer` в обратных кавычках, через `; `. Пояснения пишут только в столбце «Что».

| Версия | Что | Слой | Схемы и пути `openapi.json` |
|---|---|---|---|
| 0.3.0 | Цепочка правила: «или», шаги, интервал. Механизм: правила. `vms`: события и команды видов камеры, реле, сервера и тома — это данные набора | механизм; `vms` | `Rule*`, `RuleAbort`, `RuleAfter`, `RuleCheck`, `Reference.ruleFeatures`, `ruleControls`; события и команды видов — данные набора |
| 0.4.0 | Режимы | механизм | `ObjectMode`, `Modes*`, `ModeCurrent*`, `RuleCondition`, `RuleStatus` |
| 0.5.0 | Карточка кассы | `vms.pos/1` | `PosRawLine`, `PosRawLines`, `/units/{uid}/pos/raw` |
| 0.6.0 | Репликация со встроенного хранилища. `vms.edge/1`: репликация. `vms.timeline/1`: забор архива (`edgeOnly`). `UnitStatus` и `StreamMessage` — общие схемы | `vms.edge/1`; `vms.timeline/1` | `EdgeReplication*`, `UnitStatus`, `StreamMessage`, `ArchiveFetch*` (`edgeOnly`) |
| 0.7.0 | Предзапись у каждого хранилища камеры | `vms.camera/1` | данные вида (`preRecordSec`) |
| 0.8.0 | Поиск в журнале | механизм | `Journal*`, `/journal/facets`, `/journal/kinds`, `Feature` |
| 0.9.0 | Журнал аудита и выгрузка CSV | механизм | `/journal/export`, `Feature.journalAudit`, `JournalEvent` |
| 0.10.0 | Умолчания и настройки с устройства у камеры | `vms.camera/1` | команды вида `defaults`, `readConfig` |
| 0.11.0 | Веб-сервер и RTSP-сервер. Механизм: поле `ActionDescriptor.direct`. Остальное — профиль | `vms.webserver/1`; механизм | `WebServerSettings`, `WebCertificate`, `WebReservedPorts`, `UnitStatus`, коды `PORT_TAKEN`, `CERTIFICATE_*`, `KEY_MISMATCH`; механизм — `ActionDescriptor.direct` |
| 0.12.0 | Настройки детектора и поддетекторы | `vms.detector/1`; `vms.subdetector/1` | данные видов `det`, `subdet` |
| 0.13.0 | Маска и треки детектора | `vms.detector/1` | данные вида `det` |
| 0.14.0 | Автор у каждой записи журнала. Ломающая правка | механизм | `JournalEvent.actor` обязательно |
| 0.15.0 | Поля детекторов и зон по отчёту Axxon One | `vms.detector/1`; `vms.subdetector/1` | данные видов `det`, `subdet` |
| 0.16.0 | Страница плагина, `x-hidden`, `statusSchema`, кэш `/kinds`. Есть ломающая правка | механизм | `SetupUiLink`, `/units/{uid}/setup-ui`, `UnitKind`, `Unit`, `UnitCondition`, `JsonSchema`, `Text`, `/kinds` |
| 0.17.0 | Маска приватности камеры, мета-детектор, детекторы лиц, события детекторов в правилах. `EventDescriptor` — только описание | `vms.camera/1`; `vms.detector/1` | данные видов; `EventDescriptor` — описание |
| 0.18.0 | Один детектор в событии правила (`match.detector`). Движок правил знает `vms.detector/1`: это вынесет часть 04 | `vms.detector/1` | `params.detector` событий камеры |
| 0.19.0 | Общая загрузка файлов, файлы хода ассистента, пределы файлов | механизм | `FileUpload`, `/files`, `AssistTurnRequest.fileIds`, `Reference.limits` |
| 0.20.0 | Ключи лицензий. Есть ломающая правка | механизм | `LicenseKey*`, `/licenses/keys…`, `License` |
| 0.21.0 | Несовместимые виды серверных детекторов на одном сервере | `vms.detector/1` | `Reference.analyticsConflicts`, `ProblemCode` |
| 0.22.0 | `params.with` в `409 BUSY`. Ломающая правка | `vms.detector/1` | `params.with` в `409 BUSY` |
| 0.23.0 | Проверка `match.detector` при сохранении правила | `vms.detector/1` | `RuleTrigger.match.detector` |
| 0.24.0 | Слои контракта: расширение `x-layer` у схем, путей и полей подсистем | механизм | `x-layer` |
| 0.25.0 | Профили в файлах: `version` и `uses` у `Profile` | механизм | `Profile.version`, `Profile.uses`, `ProfileUse`, `api/profiles/` |
| 0.26.0 | Раскладки дерева объявляет система: `GET /kinds` → `layouts`. Ломающая правка: у `layout` снят `enum` | механизм | `TreeLayout`, `PlaceRule`, `KindSelector`, `TreeGroup`, `KindsList.layouts`, `TreeNode.group`, `StreamMessage.layout`, параметр `layout` у `/tree/children` и `/tree/paths` |
| 0.27.0 | Разделы приложения объявляет система: `capabilities.sections` | механизм | `AppSection`, `Capabilities.sections` |

## Как дополнять

- Каждая новая версия контракта получает строку в этой таблице. Строку пишет тот, кто поднимает версию, в том же коммите.
- Строку сверяют с `git show --stat` коммита версии. Коммиты версий находит `git log -G'"version": "0\.[0-9]+\.0"' -- api/openapi.json`.
- Если версия правит и механизм, и профиль, в столбце «Слой» стоят оба слоя, а в столбце «Что» написано, что из них механизм.
- После части 02 правка только профиля версию контракта не поднимает, и в эту таблицу она не попадает. Её история — поле `changes` в файле профиля.
- Версию поднимает правка `api/openapi.json`. Правка только файлов сервера (`server.js`…) версию не поднимает и в таблицу не попадает (решение владельца 2026-11-18).
- `python3 tools/check_api.py` проверяет таблицу: у каждой версии из `api/README.md` и у текущей есть строка, а слои знакомые.
