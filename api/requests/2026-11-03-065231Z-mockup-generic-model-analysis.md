# Приложения к запросу «Универсальная модель объектов»

К запросу [`2026-11-03-065231Z-mockup-generic-model-request.md`](2026-11-03-065231Z-mockup-generic-model-request.md). Ревизии, по которым сделан анализ:

| Репозиторий | Коммит |
|---|---|
| `consolem` | `43c6f71` (контракт — `9818b3b`) |
| `server-vms-course` (w2c) | `c57420943` |
| `ngp.axxon` | `930e5e6d62` |
| `psim-sdk` | `c3d9ebb` |

Пути в ссылках `путь:строка` — от корня своего репозитория; у чужих репозиториев в начале стоит имя.

## А. Инвентарь: где типизация зашита

### А.1. Количества (скрипт по `api/openapi.json`)

Скрипт лежал во временной папке, в репозиторий не входит. Вывод:

```
openapi 3.1.0 version 0.1.0
paths 97 ops 142 schemas 186
additionalProperties:false 292
enums 143          (из них в свойствах схем — 135)
ops by first segment: devices 26, domains 13, rules 11, operations 9, access 8, archives 7, servers 6, folders 6, volumes 5, …
крупнейшие схемы по числу полей: Device 87, DeviceCreate 61, DevicePatch 59, Volume 30, Rule 30, RuleAction 27, Reference 27
```

Перечисления, закрывающие список видов:

| Перечисление | Значений |
|---|---|
| `DeviceType` (`api/openapi.json:11586`) | 17 |
| `TreeNode.kind` (`:18561`) | 7 |
| `StreamMessage.kind` (`:11699`) | 24 |
| `Feature` (`:11609`) | 12 |
| `ProblemCode` (`:12932`) | 39 |
| `RecordMode` (`:8482`) | 6 |
| `Device.detectorKind` | 7 |
| `RuleTarget.include.kind` | 4 |
| `Reference.ruleTargets.kinds` | 4 |

Сравнения вида с конкретным значением (скрипт, регулярка по `type|kind ==/!= "<вид>"`):
- `index.html`: 527 сравнений на 409 строках; больше всего — `camera` 102, `server` 74, `domain` 68, `ipsrv` 57;
- `api/server.js`: 81 сравнение на 76 строках.

История:
- `git log -- api/openapi.json` — 73 коммита с 2026-10-29 по 2026-11-03;
- коммиты «по запросу w2c» — 38: 496 изменений файлов, 39 992 добавленных строки, 6150 удалённых;
- `953777e` («единицы СКУД, контроллер, команды») — 16 файлов, 957 добавленных строк.

### А.2. Место → что предполагается о виде → что нужно, чтобы это пришло данными

| Слой | Место | Что предполагается | Что нужно |
|---|---|---|---|
| контракт | пути `/devices`, `/servers`, `/archives`, `/volumes`, `/folders`, `/domains` | вид — это путь | `/units` + `kind` |
| контракт | `Device` (`api/openapi.json:8512`), `DeviceCreate` (`:13813`), `DevicePatch` (`:12033`), все с `additionalProperties: false` | все поля всех видов известны | `properties` по `UnitKind.schema` |
| контракт | `DeviceType` (`:11586`), `TreeNode.kind` (`:18561`), `StreamMessage.kind` | список видов закрыт | открытая строка, перечень — `GET /kinds` |
| контракт | `Reference.deviceKinds`, `deviceParams` (`:10893`, `:11017`), `UnitOption`/`UnitProperty` (`:17403`, `:17381`) | зачатки описаний, но без типов, подписей и обязательности | `UnitKind` |
| контракт | `Capabilities.deviceTypes`, `foundDeviceTypes`, `unitTypes`, `writableFields` (`:11641`) | возможности — по видам устройств | `UnitKind.capabilities`, `Unit.capabilities`, `readOnly` в схеме |
| контракт | `RecordMode`, `ArchiveKind`, `Device.detectorKind`, `Volume.state` | значения закрыты | `enum` в схеме вида или профиля |
| контракт | `Feature` (`:11609`) | необязательные части — общим списком | остаётся для платформенного; для видов — `UnitKind.capabilities` |
| контракт | коды прав (`RoleGlobal`, `:10068`), слова событий и действия правил (`RuleTrigger` `:9288`, `RuleAction` `:9342`) | события и права — по известным видам | `UnitKind.events`, `actions`, `accessLevels`; `kindAccess` |
| контракт | `ProblemCode` (`:12932`), `Problem.field` (`:8088`) | поле — имя верхнего уровня | JSON Pointer, `errors[]` |
| сервер | `parentFits` (`api/server.js:525`), `ACS_UNITS` (`:522`), `ACS` (`:704`); 81 сравнение вида | кто чей родитель, каскады, отказы по виду | `UnitKind.parents`, `creatable`, проверка по схеме |
| интерфейс | `LB_RU` (`index.html:1986`) | подписи видов | `UnitKind.label` |
| интерфейс | `TYPE_FILTERS` (`:2039`) | фильтры по видам | `GET /kinds` + `x-ui-filter` |
| интерфейс | `WIZ` (`:2047`) | каталог мастера | `parents`, `creatable` |
| интерфейс | `tabsFor` (`:7704`) | вкладки карточки по виду | `x-ui-tab`; ручные экраны — по профилю |
| интерфейс | `CARD_PROP` (`:4114`), `CARD_FLD_PROP` (`:4119`) | поля карточки | схема |
| интерфейс | `devNode` (`:2280`), `keyToApi` (`:22223`) | перевод ответа в структуры экрана | не нужен для формы по схеме |
| интерфейс | `needsParent`, `parentOpts` (`:20009-20017`) | выбор родителя | `parents`, `creatable` |
| интерфейс | права по видам, редактор правил | коды прав и события известны | `accessLevels`, `events`, `actions` |

### А.3. Что уже универсально и годится как есть

- **Версии и `If-Match`** (`api/README.md:78`) — непрозрачная строка, `412` с `current`.
- **`problem+json`** с `code` и `field` (`:79`) — нужна только форма `field` и `errors[]`.
- **Групповые операции, очередь, откат** (`:80-83`) — шаги нужно адресовать по `uid`.
- **Поток событий** (`:84-90`) — `kind` сделать открытой строкой.
- **Дерево** `/tree/children`, `/tree/paths` — кроме закрытого `TreeNode.kind`.
- **`POST /objects/delete`** — уже «любые объекты».
- **Возможности** `capabilities.operations`.
- **Зачатки описаний:** `UnitOption` с `events` и `operations` — по сути маленький `UnitKind`.

## Б. Доказательства к разбору гипотезы

| Утверждение | Где |
|---|---|
| NGP: `ChangeConfigRequest` без ожидаемой версии | `ngp.axxon/BL/bl.grpc.proto/protos/axxonsoft/bl/config/ConfigurationService.proto:199-209` |
| NGP: `config_etag` — версия **пакета**, раздаётся детям | `ConfigurationService.proto:94-98`; `ngp.axxon/BL/NativeBL/ConfiguratorUtils.h:186-195` (`FillConfigInfo`, `FillConfigInfoDFT`) |
| NGP: реализация записи `config_etag` не читает | `ngp.axxon/BL/NativeBL/ConfigurationService.cpp` — в файле нет ни одного `etag` (поиск), запись — `changeConfig` (`:2456`) |
| NGP: частичный успех записи | `ConfigurationService.proto:211-224` (`failed`, `failed_reason`) |
| NGP: схема свойств на объект, зависимые свойства, геометрия | `PropertyDescriptor.proto:14-79` (значения `:40-67`, ограничения `:69-74`), `:128-148` (`EnumerationConstraintsItem.properties`) |
| NGP: ссылка, секрет, внешнее перечисление | `PropertyAttribute.proto:82-107`, `:59`, `:50` |
| NGP: `factory` — что можно создать внутри; `BatchGetFactories` по родителю | `ConfigurationService.proto:61-62`, `:316-351` |
| NGP: команд и событий у `UnitDescriptor` нет; есть `reset_operations` | `ConfigurationService.proto:27-99`, `:19-25` |
| NGP: динамические параметры | `DynamicParametersService.proto:52-66` |
| NGP: локализация по `accept-language` | `ConfigurationService.proto:400-409` |
| NGP: свой вид единицы `Plugin` (модуль, тип, аргументы); psim и Plugin V2 в коде нет | `ngp.axxon/BL/NativeBL/PluginConfigurator.cpp:142-146`, `:202`; поиск `PluginV2`, `psim` по `*.cpp`, `*.h`, `*.proto` — пусто |
| psim: объект без версии; `UpdateObject` — слияние по ключам, родитель неизменен | `psim-sdk/proto/psim/platform/v1/common.proto:37-46`; `platform_service.proto:286-299` |
| psim: `CanCreateChild` с причинами | `plugin_service.proto:51`, `:129-180` |
| psim: команда — синхронный ответ с `success`, `result`, `error_code` | `common.proto:198-228` |
| psim: параметр без `required`, без групп; `parent` — одна строка; параметры команды — произвольный объект | `psim-sdk/schema/plugin.schema.json:8-80`, `:198`, `:246` |
| psim: `source: platform_objects` | `plugin.schema.json:42-56`; `psim_plugins/cmd/security_controller/manifest/plugin.json:41-74` |
| psim: `setup_ui` | `security_controller/manifest/plugin.json:23-31`; `plugin.schema.json:170-176`; страницы только показывают значения — `security_controller/webui/webui.go:151-160` |
| psim: эмулятор показывает свою форму и по переключателю — iframe плагина с `?type=&id=&lang=` | `psim_platform_emulator/webui/webui.html:628-705` |
| psim к NGP: объект плагина = юнит NGP, NativeBL регистрирует конфигуратор на каждый вид манифеста — **решение предложено, не принято**; ADR-012 упомянут, в репозитории его нет | `doc/adr/009-plugin-v2-platform-implementation/009-plugin-v2-platform-implementation.md:2` (`status: proposed`), `:61`, `:235-241`, `:174` |
| psim: права — пользователь плагина, ACL объекта в `meta.conf` | `doc/adr/010-…/010-plugin-v2-identity-and-acl.md:45-57`; ADR-009 `:184` |
| w2c: восемь типов поля | `server-vms-course/Platform/02-installer/spec/02.1-installer.norms.md:737` |
| w2c: `required`, `fixed`, `default`/`inherit`, `enum`, `unique` | `02.1-installer.norms.md:1263`; `Source/vms/cam.subsystem.yaml:47`, `:100-101`, `:201`, `:223` |
| w2c: секрет по суффиксу `_secret` | `02.1-installer.norms.md:159`; `cam.subsystem.yaml:218` |
| w2c: таблицы, команды (`requests`), права (`rights`), общее на домен, раскладка формы, события | `cam.subsystem.yaml:246`, `:332`, `:358`, `:402`, `:450-516`, `:523` |
| w2c: связь `about` | `Source/vms/rec.subsystem.yaml:60` |
| w2c: строгая версия `revision` в форме единицы | `Platform/07-console-module/spec/07-console-module.norms.md:80`, `:102` |
| w2c: проекция манифеста `/manifest` | `Platform/06-console/spec/06.5-console.norms.md:275-300` |
| w2c: смена манифеста останавливает консоль | `06.5-console.norms.md:293` |

## В. Сравнение метамоделей (шаг 2) и сборка `UnitKind`

| Понятие | w2c | NGP | psim-sdk | consolem сейчас | `UnitKind` |
|---|---|---|---|---|---|
| описание вида | манифест подсистемы, проекция `/manifest` | `UnitDescriptor` объекта и `factory` родителя — **на объект** | `plugin.json` `object_types[]` | `Reference.deviceKinds`, `UnitOption` | `GET /kinds`; `GET /units/{uid}/schema` при `schemaPerUnit` |
| тип поля | string, int, float, bool, list, json, url, blob | string, int32/64, double, bool, геометрия, цвет, группы | string, integer, float, boolean, array | закрыто в схемах | JSON Schema + `x-ui-widget` |
| умолчание | `default`, `{id}` | `RangeConstraint.default`, `EnumerationConstraints.default` | `default` | — | `default` |
| обязательность | `required` | нет (поиск в `PropertyDescriptor.proto`) | нет | в схемах | `required` |
| диапазон | пределы int/float | `RangeConstraint` | `min`, `max`, `pattern` | в схемах | `minimum`/`maximum`/`pattern` |
| перечисление с подписями | `enum` + `display.options` | `EnumerationConstraintsItem.name` (ключ) | `enum_values {value, name_key}` | коды, подписи в UI | `enum` + `x-enum-labels` |
| только чтение | вне `domain.edit` | `readonly`, `traits` | `readonly` | `writableFields` | `readOnly` |
| неизменяемое после создания | `fixed` | — | родитель неизменен | в описаниях | `x-immutable` |
| наследование | `inherit`, `merge` | шаблоны (`assigned_templates`) | — | — | `x-inherit` |
| скрытое | — | `internal` | `hidden` | — | `x-ui-hidden` |
| секрет | `*_secret`, `bound_to` | `SecretPropertyAttribute` | `secret` | `password` → `hasPassword` | `writeOnly` + `Unit.secrets` |
| ссылка | `about {sub, field}` | `ReferencePropertyAttribute` (тип, область) | `source: platform_objects` | `parentId`, `archiveId`… | `x-ref {kinds, implements, scope}` |
| топология | подсистема — коллекция строк | `units`, `factory`, `BatchGetFactories` | `parent` (тип), `CanCreateChild` | `parentFits`, `needsParent` | `parents`, `children`, `creatable` |
| события | `display.kinds`, `events` | не в дескрипторе (шина `EventSupplier`) | `events[] {id, severity}` | `ruleTriggers`, `UnitOption.events` | `events[] {id, label, severity, params}` |
| команды | `requests.schema` | `reset_operations`; прочие — другие сервисы | `commands[]` | `UnitOption.operations`, `/devices/{id}/operations` | `actions[]` |
| группы, вкладки, раскладка | `display.form`, `general` | `category`, `PropertyCategoryDescriptor` | нет | `tabsFor` | `x-ui-group`, `x-ui-tab`, `x-ui-order` |
| подписи и переводы | русские тексты в манифесте | локализация на сервере по `accept-language` | ключи в `langs/{en,ru}.json` | в UI (`LB_RU`) | `label {key, text}` |
| версии и конкурентная запись | `revision`, строгая | `config_etag` пакета, без проверки | нет | `version`, `If-Match` | `version`, `If-Match` (требует доработок) |
| пакетная запись, частичный успех | дверь пакета с `cas` | `ChangeConfig` с `failed` | по одному | `/operations`, быстрые групповые | `/operations` |
| задано / получилось / почему | строка / пульс воркера / слова | свойства / `status` / — | `params` / события `ONLINE`/`OFFLINE` | поля вперемешку, `fault` | `properties` / `status` |
| не-единицы | таблицы, `/domain/shared` | `ServerSettings`, шаблоны | `parameters` плагина (`Configure`) | `Settings`, `Modes`… | `shape: document`, `x-inherit`, вид `plugin:<id>` |
| свой UI объекта | модуль консоли подсистемы | — | `setup_ui` | — | `setupUi` |

**Вывод шага.** Общее ядро есть, и оно без потерь выражает поле, тип, ограничения, секрет, ссылку, топологию, события и команды трёх систем. В ядро не ложатся:
- w2c — размещение, токены, книги, метрики; это не настройка объекта;
- NGP — схема на объект (решено через `schemaPerUnit`), шаблоны и команды вне `ConfigurationService`;
- psim — ничего, но его манифесту не хватает обязательности, групп и схем параметров команд и событий.

## Г. Прецеденты (шаг 3а)

Источники открывались поиском; где документ не прочитан целиком, это сказано.

| Продукт | Откуда описание вида | Что строится само / что модуль рисует сам | Топология, команды, события, права | UX известных видов | Версии описаний, незнакомое поле | Переносим / избегаем |
|---|---|---|---|---|---|---|
| **Kubernetes CRD** ([Extend the API with CRDs](https://kubernetes.io/docs/tasks/access-kubernetes-api/extend-api-custom-resource-definitions/), [CRD v1](https://kubernetes.io/docs/reference/kubernetes-api/apiextensions/custom-resource-definition-v1/), [CEL](https://kubernetes.io/docs/reference/using-api/cel/), [KEP-598](https://www.kubernetes.dev/resources/keps/598/)) | CRD со схемой OpenAPI v3 | проверка по схеме и CEL (`oldSelf` — неизменяемость), колонки списка `additionalPrinterColumns` | команд и событий у CRD нет; права — RBAC по виду; `status` — подресурс | встроенные виды типизированы, CRD — общим кодом | несколько версий, вебхук конверсии; незнакомое поле отбрасывается (pruning) | берём схему, `spec`/`status`, правила с путём к полю (`fieldPath`); избегаем отбрасывания без ошибки |
| **Headlamp** ([Kubernetes blog, 2026-07-13](https://kubernetes.io/blog/2026/07/13/introducing-headlamp-plugin-for-kubeflow/)); Kubernetes Dashboard архивирован, рекомендован Headlamp ([2026-06-01](https://kubernetes.io/blog/2026/06/01/dashboard-to-headlamp/), [репозиторий](https://github.com/kubernetes-retired/dashboard)) | CRD | CRD видны сами; «первоклассные» экраны — плагины | — | плагины для важных видов | — | ручные экраны поверх общего — как наши профили |
| **Rancher** ([extensions: resources](https://extensions.rancher.io/internal/code-base-works/customising-how-k8s-resources-are-presented)) | CRD | по умолчанию — список и правка YAML; свой экран — `plugin.register('edit', тип, компонент)` | — | свои компоненты на вид | — | «YAML для неизвестного» нам не годится — нужна форма по схеме |
| **Nx Meta** ([settings_model.md](https://raw.githubusercontent.com/networkoptix/nx_open/master/vms/libs/nx_sdk/src/nx/sdk/settings_model.md), [manifests.md](https://raw.githubusercontent.com/networkoptix/nx_open/master/vms/libs/nx_sdk/src/nx/sdk/analytics/manifests.md), [i_settings_response.h](https://raw.githubusercontent.com/networkoptix/nx_open/master/vms/libs/nx_sdk/src/nx/sdk/i_settings_response.h)) | модель настроек JSON в манифесте Engine (`deviceAgentSettingsModel`), `typeLibrary` (`eventTypes`, `objectTypes`) | «The Client can offer a user a dialog with controls corresponding to such Model»; виджеты, в том числе `PolygonFigure`, `BoxFigure`, `LineFigure` | свои виды событий и объектов с `base`; ответ плагина — `errors()` по id настройки и `model()` — новая модель поверх модели из манифеста; Active settings меняют модель на ходу | — | — | берём виджеты геометрии, ошибку по полю, модель объекта поверх модели вида (`schemaPerUnit`). Как правила выбирают вид события плагина, в прочитанных документах не описано — **не подтверждено** |
| **Milestone XProtect MIP** ([ItemManager](https://doc.developer.milestonesys.com/mipsdk/miphelp/class_video_o_s_1_1_platform_1_1_admin_1_1_item_manager.html), [Admin namespace](https://doc.developer.milestonesys.com/html/MIPhelp/namespace_video_o_s_1_1_platform_1_1_admin.html), [Config API REST](https://doc.developer.milestonesys.com/mipvmsapi/api/config-rest/v1/)) | `ItemNode` вида в плагине | ничего: `GenerateDetailUserControl` — плагин отдаёт свой `UserControl` для настройки вида | `CreateItem`, `FillUserControl` | всё — свой код | — | избегаем: код UI в клиенте на каждый вид. Как Config REST API описывает виды — спецификацию не читали, **не подтверждено** |
| **Genetec Security Center** ([About custom fields](https://techdocs.genetec.com/r/en-US/Security-Center-Administrator-Guide-5.13/About-custom-fields), [custom data types](https://techdocs.genetec.com/r/en-US/Security-Center-Administrator-Guide-5.13/Creating-custom-data-types-for-custom-fields), [Web SDK custom entity types](https://github.com/Genetec/DAP/wiki/web-sdk-custom-entity-types)) | пользовательские поля к виду сущности; описатели пользовательских видов сущностей | вкладка «Custom fields»; типы Text, Numeric, Decimal, Date, Boolean, Image, **Entity** (ссылка) | права на видимость поля; обязательность и уникальность не меняются после создания | — | Web SDK описатели только читает и удаляет, не создаёт | берём тип «ссылка на объект» и «видимость поля по правам»; как Config Tool рисует пользовательский вид — **не подтверждено** |
| **Axis ACAP** ([manifest v1.5.0](https://www.developer.axis.com/acap/develop/manifest-schemas/schema-field-descriptions-v1.5.0), [v1.3](https://www.developer.axis.com/acap/develop/manifest-schemas/schema-field-descriptions-v1.3)) | `paramConfig` (имя, умолчание, тип) | параметры доступны через VAPIX и Parameter API; своя страница — `settingPage` | `httpConfig.access`: admin, operator, viewer | — | версия схемы манифеста | точно наш случай: схема параметров и необязательная своя страница |
| **ONVIF** ([Device Feature Discovery 26.06](https://www.onvif.org/wp-content/uploads/2026/07/ONVIF_Device_Feature_Discovery_Specification_26.06.pdf)) | типизированные сервисы и `GetServices`/`GetServiceCapabilities` | — | возможности объявляются, сервисы закрыты | всё типизировано | версии спецификации | это пример типизированного подхода «с объявлением возможностей», как наш нынешний `capabilities`; новых видов он не даёт. Текст спецификации не читали целиком |
| **Home Assistant** ([data entry flow](https://developers.home-assistant.io/docs/data_entry_flow_index), [options flow](https://developers.home-assistant.io/docs/core/integration/options_flow), [selectors](https://home-assistant.io/docs/blueprint/selectors/), [entity features](https://developers.home-assistant.io/blog/2022/04/02/support-constants-deprecation)) | config flow — шаги формы по схеме (voluptuous и селекторы); тексты в `strings.json` | формы настройки интеграции | сущности — типизированные домены (`LightEntity`, `ClimateEntity`) с флагами возможностей `EntityFeature` | экраны сущностей по домену | от «магических чисел» перешли к перечислениям возможностей | берём гибрид: форма по схеме плюс экраны по профилю с возможностями |
| **openHAB** ([Configuration Descriptions](https://www.openhab.org/docs/developer/addons/config-xml.html)) | XML описания настроек: тип, `required`, `readOnly`, `min`/`max`, `pattern`, `unit`, `advanced`, `context` (url, item, thing, channel…), `filter` | формы | thing-type и channel-type | — | — | берём `context` → `x-ui-widget`, `advanced`, фильтр ссылки |
| **NetBox** ([Custom Fields](https://netboxlabs.com/docs/netbox/en/stable/models/extras/customfield/), [custom object type fields](https://netboxlabs.com/docs/extensions/custom-objects/field-attributes/)) | пользовательские поля, наборы вариантов, ссылка на вид с фильтром | формы | — | — | — | предупреждение документации: фильтр ссылки «for convenience only, and should not be relied upon to enforce data integrity» — проверка на сервере |
| **Terraform** ([tfplugin6.0.proto](https://github.com/hashicorp/terraform/blob/4b25a07bc796c392e95ce9d8b4228e6b3416803b/docs/plugin-protocol/tfplugin6.0.proto)) | `GetProviderSchema` | проверка, план | — | — | у схемы версия для обновления состояния; кэш схемы по возможности сервера | берём версию описания и кэш |
| **JSON Forms** (вторичный пересказ: [Prismatic UI schema](https://prismatic.io/docs/integrations/data-sources/json-forms/reference/ui-schema/); jsonforms.io не открылся) | JSON Schema + UI schema: `VerticalLayout`, `Group`, `Categorization` (вкладки) | без UI schema — поля столбиком | свои рендереры | — | — | берём разделение «данные / подсказки формы» |
| **Антипаттерн** ([Inner-platform effect](https://en.wikipedia.org/wiki/Inner-platform_effect)) | — | — | — | — | — | не делать «платформу в платформе» для всего: предметные экраны и API остаются типизированными |

**Неудачи и отказы.** Документированного отказа VMS от универсальной модели не нашли. Найдено:
- Kubernetes Dashboard архивирован из-за нехватки сопровождающих — это не довод против универсальности;
- Rancher и Headlamp дополняют общее отображение экранами для важных видов;
- Milestone держит настройку видов в коде плагина.

Avigilon, Qognify и другие PSIM не проверялись: открытой документации SDK по видам объектов поиском не нашли.

## Д. Наброски схем OpenAPI 3.1

### Д.1. Описание вида и объект

```yaml
UnitKind:
  type: object
  required: [kind, label, schema, parents]
  properties:
    kind: {type: string, description: "security_controller/CONTROLLER, cam, AVDetector…"}
    origin:
      type: object
      properties:
        system: {enum: [w2c, ngp]}
        subsystem: {type: string}
        plugin: {type: string}
        pluginVersion: {type: string}
    label: {$ref: Text}
    labelPlural: {$ref: Text}
    icon: {type: string}
    parents: {type: array, items: {type: [string, "null"]}}
    children: {type: array, items: {type: string}}
    dynamicCreate: {type: boolean}
    implements: {type: array, items: {type: string}, description: "vms.camera/1 …"}
    capabilities: {type: array, items: {type: string}, description: "rename, enable, delete, move, folders, bulkSet; незнакомое клиент пропускает"}
    schema: {type: object, description: "JSON Schema 2020-12 настроек, с x-*"}
    schemaPerUnit: {type: boolean}
    shape: {enum: [unit, document], default: unit}
    actions: {type: array, items: {$ref: ActionDescriptor}}
    events: {type: array, items: {$ref: EventDescriptor}}
    accessLevels: {type: array, items: {$ref: AccessLevel}}
    setupUi:
      type: object
      properties:
        url: {type: string}
        mode: {enum: [iframe, link]}
  additionalProperties: true      # незнакомое поле описания клиент пропускает

Text:
  type: object
  required: [text]
  properties:
    key: {type: string}
    text: {type: string}

EventDescriptor:
  type: object
  properties:
    id: {type: string}
    label: {$ref: Text}
    severity: {enum: [info, warning, error, critical, alarm]}
    params: {type: object, description: "JSON Schema данных события"}

Unit:
  type: object
  required: [uid, kind, name, version]
  properties:
    uid: {type: string}
    kind: {type: string}
    parentId: {type: [string, "null"]}
    name: {type: string}
    domainId: {type: string}
    folders: {type: array, items: {type: string}}
    version: {type: string}
    properties: {type: object, additionalProperties: true}
    secrets: {type: object, additionalProperties: {type: boolean}}
    inherited: {type: object, additionalProperties: {type: object, properties: {from: {type: string}}}}
    status:
      type: object
      properties:
        link: {enum: [online, offline, unknown]}
        observedVersion: {type: string}
        observed: {type: object, additionalProperties: true}
        conditions:
          type: array
          items:
            type: object
            required: [type, status]
            properties:
              type: {type: string}
              status: {enum: ["true", "false", unknown]}
              reason: {type: string}
              params: {type: object}
              since: {type: string, format: date-time}
    capabilities: {type: array, items: {type: string}}
```

### Д.2. Операции

```yaml
/kinds:            {get: {operationId: listKinds, responses: {200: {headers: {ETag: …}}, 304: …}}}
/kinds/{kind}:     {get: {operationId: getKind}}
/units:            {get: {operationId: listUnits}, post: {operationId: createUnits}}
/units/{uid}:      {get: {operationId: getUnit}, patch: {operationId: patchUnit, requestBody: {content: {application/merge-patch+json: …}}}, delete: {operationId: deleteUnit}}
/units/{uid}/move:        {post: {operationId: moveUnit}}
/units/{uid}/actions/{action}: {post: {operationId: runUnitAction}}   # 200 {result} | 202 {operationId}
/units/{uid}/creatable:   {get: {operationId: getCreatable}}            # [{kind, allowed, reason?, schema?}]
/units/{uid}/schema:      {get: {operationId: getUnitSchema}}           # при schemaPerUnit; ETag
/units/validate:          {post: {operationId: validateUnits}}          # без записи
# StreamMessage.type += kinds.changed; StreamMessage.kind — открытая строка
# OperationItemRequest.op += set {uid, patch} | action {uid, action, params} | delete {uid}
# Problem.field — JSON Pointer; Problem.errors[] {code, field, params}
```

### Д.3. Что остаётся, уходит, становится частным случаем

| Нынешнее | Судьба |
|---|---|
| `getMe`, `getReference` | остаются; из `Reference` уходят `deviceKinds`, `deviceParams`, `ipServerSubtypes`, `detectorKinds`, `archiveKinds`, `storageTypes`, `volumeStates`, `unitOptions` — в описания видов |
| `Capabilities` | `operations`, `features` остаются; `deviceTypes`, `foundDeviceTypes`, `unitTypes`, `writableFields` уходят в `UnitKind` |
| домены, серверы, устройства, папки, хранилища, тома (CRUD, около 30 операций) | частный случай `/units`; виды `domain`, `server`, `folder`, `archive`, `volume` и виды устройств — описаниями; профили `vms.camera/1`, `vms.server/1`, `vms.archive/1`, `vms.volume/1` |
| `POST /devices/update`, `/servers/assign` | шаги операции `set`, `move` |
| `POST /devices/probe`, `/archives/check`, `/volumes/{id}/format`, `/devices/{id}/operations/{operation}` | действия (`actions`) |
| потоки камеры `/devices/{id}/streams` | дочерние объекты вида `stream` |
| `putPreset`, `deletePreset`, `putPtz`, `deletePtz`, `startLive`, `moveLive`, `startTalk`, `getTimeline`, `getPlayback`, удержания, отметки, `archive-fetch`, `putRecordingTarget` | остаются предметными; путь — по `uid`; доступность — профилем |
| `/operations*`, `/stream*`, `/objects/delete` | остаются; адресация по `uid` |
| `/rules*`, `/rule-prompts*`, `/schedules`, `/day-groups`, `/modes*`, `/maintenance-windows*`, `/domains/{id}/scenarios*` | остаются; `RuleTrigger`/`RuleAction` получают варианты `unit`/`unitAction` |
| `/access*`, `/stream-accounts*` | остаются; `kindAccess`, `objectAccess` по `uid` |
| `/settings`, `/licenses`, `/journal`, `/assist/turns`, `/test/*`, `archive-watches`, `archive-scans`, поиск в сети | остаются |
| `Device`, `DeviceCreate`, `DevicePatch`, `DeviceRow`, `DeviceType`, `UnitOption`, `UnitProperty`, `TreeNode.kind` (enum) | уходят |

## Е. Сквозные сценарии (шаг 5)

| № | Сценарий | Что приходит с сервера | Что рисует WebUI и какие запросы уходят | Что нужно от адаптера | Без правки WebUI |
|---|---|---|---|---|---|
| 1 | NGP + `security_controller` | `kinds.changed`; `UnitKind` `security_controller/CONTROLLER` (`parents: [null]`, схема с `mode`: `enum` + `x-enum-labels` из `langs/`, `cameras`: `x-ref {implements: [vms.camera/1]}`, `actions` ARM/DISARM, `events` ONLINE/OFFLINE), `…/SENSOR` (`parents: [CONTROLLER]`, BYPASS/UNBYPASS, ALARM/RESTORE/TAMPER) | дерево — узлы с иконкой и подписью; мастер под CONTROLLER предлагает только SENSOR (`creatable`); карточка по схеме; выбор камер — `GET /units?implements=vms.camera/1`; кнопки команд → `POST /units/{uid}/actions/ARM`; в правилах — события и команды из описания; в правах — уровни вида и `action:ARM` | перевод `plugin.json` и `langs/` в `UnitKind`; `CreateObject`/`UpdateObject`/`DeleteObject`/`SendCommand`/`PullEvents` платформы; **в NGP нужен Plugin V2 (ADR-009 — предложен, не реализован)** | **да**; группы полей и обязательность беднее (в манифесте их нет) |
| 2 | плагин обновился: новое поле, значение, событие | `kinds.changed` с новыми версиями описаний | форма показывает поле; список вариантов шире; событие доступно в правилах | перечитать манифест; старым объектам — `default` | **да** |
| 3 | плагин отдаёт `setup_ui` | `UnitKind.setupUi {url, mode: iframe}` | по умолчанию форма; переключатель «Страница плагина» открывает iframe с `?uid=&kind=&lang=`; после записи плагином приходит `entity.changed` | проксирование страницы (ADR-009 §6 — `/plugins/v2/`) | **да**; у w2c — зависит от CSP (вопрос 8) |
| 4 | в w2c новая подсистема | `kinds.changed` (или перезапуск бэкенда — вопрос 5) | вид появляется в дереве и мастере | перевод манифеста | **да**, если w2c отдаёт смену манифеста событием |
| 5 | в NGP новый тип `Unit` с `factory` и ссылками | `UnitKind` с `schemaPerUnit: true`; `GET /units/{uid}/schema` — свойства с ограничениями; `creatable` — из `BatchGetFactories`; ссылки — `x-ref` из `ReferencePropertyAttribute` | форма по схеме объекта; зависимые поля — `if/then`; геометрия — виджеты `polygon`/`line` | перевод `PropertyDescriptor` в JSON Schema, `ExternEnumeration` — в `enum` | **да**, пока тип значения из известного набора виджетов; новый геометрический тип NGP — **нет**, нужен виджет |
| 6 | хорошо известный вид — камера | `implements: [vms.camera/1, vms.live/1, vms.ptz/1, vms.archive/1]` | ручной экран камеры по профилю (вкладки «Просмотр», «Архив», «Детекторы»…), свойства сверх профиля — «Дополнительно» | заполнить профиль | **да** для любой камеры с профилем; сам ручной экран — код WebUI один раз на профиль |
| 7 | групповая правка поля у 200 объектов разных видов | у каждого вида — своя схема | правка показывает поле, если оно есть хоть у одного выбранного; счётчик «есть у N из 200»; операция `set` только для объектов, где поле есть в схеме | частичный успех по шагам | **да** |
| 8 | описание вида не пришло или устарело | `GET /kinds/{kind}` → `404` или версия описания не совпадает с версией у объекта | узел с общей иконкой и `kind`; карточка — общие поля и `properties` только для чтения (ключ — значение); запись запрещена до получения описания | — | **да** (показ); правка — после описания |

## Ж. Открытые вопросы

| № | Вопрос | Варианты | Рекомендация |
|---|---|---|---|
| В-1 | Строгая версия при записи у NGP и psim | (а) требовать от систем: N-01 для NGP, `version` и ожидаемая версия в `UpdateObject` psim; (б) эмулировать в адаптере «прочитал — сравнил — записал», с окном гонки; (в) объявлять в возможностях «слабая версия» | (а) как цель, (б) временно, с честным объявлением (в); иначе нарушается «объявленное работает целиком» |
| В-2 | Тексты: коды с сервера и подписи в UI или тексты с сервера | (а) ключи и тексты с сервера по `Accept-Language`; (б) только ключи и словари `/kinds/labels`; (в) как сейчас | (а) для видов из систем; платформенные слова — как сейчас |
| В-3 | Имена: `Unit` или `Object` | — | оставить `Unit` и `properties`: так в гипотезе, в NGP и в psim |
| В-4 | Кто публикует профили | (а) контракт consolem; (б) системы | (а): профиль — часть контракта, иначе ручной экран снова зависит от системы |
| В-5 | Схема на объект (NGP) | (а) `schemaPerUnit` + `GET /units/{uid}/schema`; (б) схема в каждом `Unit` | (а): меньше трафик дерева, кэш по ETag |
| В-6 | iframe плагина | (а) только ссылка; (б) iframe с `sandbox` без `allow-same-origin`; (в) iframe с доступом к токену | (б); (в) не делать |
| В-7 | Порядок перехода | (а) ядро рядом и перевод по разделам; (б) замена разом | (а), даже при разрешённой ломающей правке: прототипы и тесты переводятся по разделам |
| В-8 | Манифест psim: `required`, группы, схемы параметров команд и данных событий, несколько родителей | запрос к команде psim-sdk | передать владельцу psim-sdk |

### Ж.2. Пункты запросов w2c, которые в новой модели становятся описанием вида

Разметка ручная, по заголовкам пунктов:
- `2026-11-01-073518Z-w2c-devices`: 1, 2, 3, 5;
- `2026-11-01-094639Z-w2c-devices-update`: 1, 2, 3, 6, 7;
- `2026-11-01-135335Z-w2c-recording-detectors-ptz-archives`: 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17, 18, 19, 20, 21, 22, 26, 28;
- `2026-11-01-182545Z-w2c-domain-startup-archives-rollback`: 2, 3, 5, 7, 8, 9, 10, 18, 19, 20, 21, 24, 25, 29.

Итого 42 из 116 пронумерованных пунктов всех двенадцати запросов w2c.

## З. Сравнение вариантов (шаг 3)

| Критерий | 1. Типизированный + `x-*` | 2. Полностью универсальный | 2а. Гипотеза (CRD, проекции, связи) | 3. Гибрид (рекомендуем) | 4. Только чужой UI (`setup_ui`) |
|---|---|---|---|---|---|
| Новый вид без правки WebUI | нет: `x-*` без схемы не нарисовать | да | да для формы; проекции требуют кода | да | да, если плагин дал страницу; иначе нет |
| UX известных видов | лучший | плохой (видео, архив, права — не формы) | зависит от проекций | ручные экраны по профилю | разнородный |
| Сложность адаптеров | высокая на каждый вид | средняя | высокая (проекции, связи) | средняя | низкая у нас, высокая у авторов плагинов |
| Проверяемость тестами | на каждый вид | общие + описания | проекции — на каждую | общие + описания + профили | почти нет |
| Совместимость с контрактом и прототипами | полная | ломает всё | ломает многое | переход по разделам | не затрагивает, но не решает |
| Производительность дерева и групповых | как сейчас | как сейчас | связи — лишние запросы | как сейчас | — |
| CSP w2c и «без кода в атрибутах» | — | — | — | — | только iframe с другого источника |

## И. Расхождения с прежними работами

- **`configurator-backend/notes/08` §0: «OpenAPI менять не нужно».** Заметка отвечает, можно ли реализовать **нынешний** контракт поверх w2c и NGP, — и отвечает да, ценой доработок NativeBL. Новые виды и плагины в ней не рассматривались. Наш вывод другой не потому, что заметка ошибается, а потому, что условие другое: вид, неизвестный при выпуске WebUI, нынешний контракт не выражает вовсе — `DeviceType` закрыт, `Device` с `additionalProperties: false`. Совпадаем в главном: строгая версия при записи требует доработки NGP (N-01, §10.1) — она нужна и универсальной модели.
- **`prompts/api-multi-vms.md`.** Там уже сформулирован вариант «общее ядро плюс описания видов с сервера». Документа `api/MULTI_VMS.md` нет — проверено. Наш запрос этот вариант конкретизирует: профили вместо «известных видов», схема на объект для NGP, страница плагина, правила и права из описаний. Добавлено условие, которого там не было: psim-плагины.

## К. Отчёт самопроверки

Роль — рецензент, не участвовавший в проектировании.

| Находка | Что сделано |
|---|---|
| Утверждение «без правки WebUI» в сценарии 5 неверно для нового геометрического типа NGP | исправлено: «нет, нужен виджет»; набор виджетов — конечный список в WebUI |
| Сценарий 6: ручной экран камеры — это код WebUI | названо прямо: код один раз на профиль, не на вид |
| Выигрыш «ноль правок» скрывает работу адаптера | в таблице выигрыша: адаптер — один раз на систему; цена расписана отдельно |
| psim к NGP не подключён — сценарий 1 сегодня невыполним на NGP | сказано в итоге и в сценарии: Plugin V2 — предложенная ADR-009, кода в NGP нет |
| «Строгая версия» — видимость у NGP и psim | вынесено в В-1 с рекомендацией; доказательства — приложение Б |
| Оценка «−35 / +12 операций» и «половина из 409 строк» — оценки, а не расчёт | помечены как оценки; −35 — перечень по разделам в таблице выигрыша |
| 42 из 116 — ручная разметка | список пунктов в Ж.2 для проверки |
| Прецеденты Nx, Milestone, Genetec — не всё подтверждено | непрочитанное помечено «не подтверждено» |
| Термины JSON Schema, JSON Pointer, Merge Patch, CEL, профиль | пояснены в запросе при первом упоминании или в разделе 1 |
| Противоречие «тексты — в интерфейсе» (`api/README.md`, «Тексты») | вынесено в В-2 и п. 5.8 как изменение договорённости |
| Выводы по названиям методов | `config_etag` проверен по реализации (`ConfiguratorUtils.h`, поиск в `ConfigurationService.cpp`), `setup_ui` — по коду страниц (`webui.go`), `CanCreateChild` и `UpdateObject` — по proto с комментариями семантики |
| Не проверено | `/manifest` w2c по живому ответу — только по нормам; размер `GET /kinds` для NGP — оценка, без замера |
