# Запрос владельца контракта: механизм без VMS — контракт 0.32.0

2026-11-19 · контракт 0.32.0 · от владельца контракта (joynickray)

Коммит: коммит — после push

Кому: w2c

**Статус: новый**

Основание — ваш запрос «Переделка по слоям» ([`2026-11-18-114831Z-w2c-contract-layers-request.md`](2026-11-18-114831Z-w2c-contract-layers-request.md), вопросы 9 и 10) и ответ на него: механизм не знает справочников VMS, домен — общее понятие «область системы». Версия 0.32.0 — последняя версия этой работы. Она ломающая: всё, что 0.28.0–0.31.0 пометили устаревшим, снято.

## 1. Механизм 0.32.0: в нём нет VMS

Что снято, чем заменено и что сделать бэкенду — таблица в разделе [«Ломающие изменения в 0.32.0»](../README.md#ломающие-изменения-в-0320). Коротко:

- **Пути `/domains/{domainId}/…` сняты.** Поиск в сети, сценарии между камерами и ретрансляторы — пути профилей у объекта области: `/units/{uid}/discovery`, `/units/{uid}/scenarios…`, `/units/{uid}/relays…`. `operationId` те же, что вы знаете: `getDiscovery`, `getScenarios`, `listRelays` и другие.
- **Профили `vms.domain/1` и `vms.folder/1` сняты.** Область системы — профиль механизма `core.domain/1`, папка — `core.folder/1`. Бэкенд узнаёт область и папку только по ним.
- **Справочники VMS ушли из `Reference`.** Модели, режимы записи, метки серверов, облака, порт сервера, несовместимые детекторы — в описаниях видов. Виды событий сценариев и предел сценариев — в ответе `/units/{uid}/scenarios`, предел адресов поиска — в ответе `/units/{uid}/discovery`, справочник выгрузки — `GET /exports/reference`. Ключи `Reference` — только механизма (11 ключей, `Reference.limits` — 8).
- **Обязательные поля.** `KindsList.layouts`, `Capabilities.sections`, `Reference.ruleChecks`; у путей профилей — `Discovery.ipScanMax`, `ScenarioDoc.kinds`, `ScenarioDoc.maxItems`.
- **Открытые строки вместо `enum`.** `RuleCondition.kind`, `RuleCheck.what`, `RuleTarget.include[].area`, `Reference.ruleTargets.areas[]`. Код вне каталога у включённого правила — `422 NOT_SUPPORTED` с `params.issue`, а не `422 VALIDATION_FAILED`.
- **`RuleActionField.options` снято.** Значения поля действия — `schema` с `enum`.
- **Свойство `license` у вида области снято.** Оно устарело в 0.20.0 и держалось профилем `vms.domain/1`. Профиль `core.domain/1` его не знает, и стенд отвечает на `PATCH` с ним `422 VALIDATION_FAILED`. Ключ лицензии и его домены — в `GET /licenses/keys` (`domainIds`).
- **`Feature` не менялся.** Коды VMS в `capabilities.features` остаются (наше решение О3: открытая строка, коды — в профилях, отдельной правкой).

Границу проверяет `tools/mechanism.py` (правила B1–B5, самопроверка — `python3 tools/check_mechanism.py`): путей `/domains/…` нет, у кодов каталога нет `enum`, ключи `Reference` и `Reference.limits` — только механизма, в описаниях схем дерева нет слов VMS.

**Переход с 0.2.0 сразу на 0.32.0.** Версии по одной проходить не нужно. Механизм — строки «механизм» [таблицы версий по слоям](../../docs/contract-layers/versions-by-layer.md), профили — строки тех профилей, которые вы объявите. Всё «устарело, работает как раньше» из 0.26.0–0.31.0 в 0.32.0 уже снято: делайте сразу новые места.

## 2. Что объявляет платформа, а что — бэкенд VMS

Наше предложение. С учётом ответа на В1 (один адрес, платформа собирает виды из манифестов):

| Объявляет | Что |
|---|---|
| платформа (механизм) | вид области с `core.domain/1`, вид папки с `core.folder/1`; раскладку `folders`; разделы `objects`, `automation`, `access`, `settings`, `journal`; каталог правил механизма — условия `time`, `mode`, `online`, проверку `online`, действия `ntf.*`, `net.http`, `rule.runrule`, `ruleTargets.areaLayouts {folder: folders}` |
| бэкенд VMS | профили `vms.*` у своих видов; раскладки `servers`, `archives`, `detectors`; раздел `vms.export`; справочники — в описаниях своих видов (`examples`, `allOf`, `enum`, `x-conflicts`); проверки `record`, `safe`, `armed` с `implements: ["vms.camera/1"]`; область `{area: server}` — `areaLayouts {server: servers}` |

Если у вас граница другая, напишите как.

## 3. Пути профилей: `vms.discovery/1`, `vms.scenarios/1`, `vms.relays/1`

С 0.29.0 у нас три профиля путей области (файлы [`api/profiles/vms.discovery.json`](../profiles/vms.discovery.json), [`vms.scenarios.json`](../profiles/vms.scenarios.json), [`vms.relays.json`](../profiles/vms.relays.json); `reviewers: ["w2c"]`). Свойств у них нет, только пути:

- `vms.discovery/1` — `GET`, `POST`, `DELETE /units/{uid}/discovery` (`getDiscovery`, `startDiscovery`, `stopDiscovery`);
- `vms.scenarios/1` — `GET`, `PUT /units/{uid}/scenarios`, `GET /units/{uid}/scenarios/status` (`getScenarios`, `putScenarios`, `getScenariosStatus`);
- `vms.relays/1` — `GET /units/{uid}/relays`, `GET /units/{uid}/relays/{name}` (`listRelays`, `getRelay`).

Вид области объявляет те профили, пути которых бэкенд выполняет. Объект другого вида — `422 NOT_SUPPORTED`, `field: /kind`; объекта нет — `404 NOT_FOUND`. `field` отказа у этих путей — JSON Pointer по телу (`/items/0/name`). Раньше мы о них не писали: проверьте, пожалуйста, и их.

## 4. Набор `agents` — образец системы без VMS

Набор `api/fixtures/agents.json` («оркестратор агентов») объявляет только механизм: виды `agent.*`, область «Рабочее пространство» (`core.domain/1`), папки (`core.folder/1`), раскладки `folders`, `agent.pipelines`, `agent.models`, четыре раздела, каталог правил механизма. Это часть того, что объявляет платформа в п. 2, а не всё: раздела `settings` нет, из условий есть `time` и `online`, но нет `mode`, из действий есть `net.http` и `rule.runrule`, но нет `ntf.*`. Система объявляет только то, что умеет. Справочников VMS, профилей `vms.*` и путей слоёв `video` и `vms` у него нет. Тесты на нём:

```
python3 tools/run_api_tests.py --fixture agents
python3 tools/run_api_tests.py --fixture agents --layer mechanism
```

Оба прогона — без `FAIL`. В первом проходят 66 тестов, во втором (только механизм) — 65; остальные пропущены с причиной (`kind:camera` и другие условия `needs`). Макет на этом наборе: https://ndm234234.github.io/consolem/index.html?fixture=agents (ссылка заработает после push).

## 5. Запрос о раскладках и разделах

Ответа на запрос [`2026-11-19-015619Z-owner-tree-layouts-sections-request.md`](2026-11-19-015619Z-owner-tree-layouts-sections-request.md) пока нет. Его п. 3 обещал отдельный запрос о версии с обязательными `layouts` и `sections`: это он. Вопросы 4 и 5 того запроса остаются в силе. Если вы ответите, что раскладки или разделы объявляет не платформа, мы поправим п. 2 этого запроса, а контракт не изменится.

## Что проверить

1. Ваш бэкенд не отдаёт пути `/domains/{domainId}/…` и их операции в `capabilities.operations`; пути профилей `/units/{uid}/…` (п. 3) — у видов, которые объявили профили.
2. Виды области и папки объявляют `core.domain/1` и `core.folder/1`; `vms.domain/1` и `vms.folder/1` не объявляет ни один вид.
3. `GET /reference` — только ключи механизма; справочники VMS — в описаниях видов и в ответах путей профилей.
4. `GET /kinds` отдаёт `layouts`, `GET /reference` — `capabilities.sections` и `ruleChecks`; ответы поиска и сценариев — `ipScanMax`, `kinds`, `maxItems`.
5. Код условия, проверки или области вне каталога у включённого правила — `422 NOT_SUPPORTED` с `params.issue`.
6. Тесты: `python3 tools/check_api.py`, тесты API на вашем стенде и на наборе `agents`.
