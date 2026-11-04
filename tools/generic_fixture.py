#!/usr/bin/env python3
"""Перевести эталонный набор api/fixtures/demo.json в набор универсальной модели api-generic/fixtures/demo.json.

Что делает:
- kinds — описания видов (UnitKind): по одному на каждое значение DeviceType, плюс domain, server, folder, volume, stream,
  archive.<вид> на каждый вид хранилища из reference.archiveKinds; виды плагина psim security_controller (CONTROLLER,
  SENSOR — переводом plugin.json и langs/ru.json); синтетические test.unknown (все виды полей и виджетов),
  test.perunit (схема объекта зависит от model), w2c.example/rows (строка таблицы с хозяином), domain.shared
  (shape: document — общие настройки домена).
  Схемы видов — из типизированного контракта api/openapi.json (Device, Server, Domain, Folder, Archive, Volume, DeviceStream
  и их *Patch/*Create) и данных: свойства вида устройства — поля его записей ∪ reference.capabilities.writableFields[вид];
  неправимое — readOnly (или x-immutable, если задаётся при создании); пароли и секреты — writeOnly (login читается, как в Device и Volume); ссылки — x-ref;
  перечисления — из схем и справочников reference; подписи — из словарей index.html (LB_RU и соседние).
- profiles — профили (Profile) из описания решения, 5.2.
- units — объекты (Unit) из разделов domains, servers, devices, folders, archives, volumes: uid = id записи; поля записи →
  properties; состояние (связь, сбои, телеметрия) → status; членство folders[].deviceIds → Unit.folders; потоки камеры →
  объекты вида stream (uid — uid камеры с номером потока во второй группе: 30000013-0001-…).
  Плюс объекты незнакомых видов в домене 1.

Старых разделов в наборе нет: сервер живёт на units, а записи старых таблиц выводит из объектов склада (api-generic/server.js,
Legacy; инструменты — tools/generic_legacy.py). reference.capabilities.operations — операции базы и реализованные операции ядра
(CORE_DONE), в порядке контракта api-generic/openapi.json. Справочников видов (deviceKinds, archiveKinds…) и capabilities.deviceTypes,
foundDeviceTypes, unitTypes, writableFields в reference нет: это — описания видов и Unit.writable.
Остальные разделы — как в базе. Набор пишется только в --api (по умолчанию api-generic); база только читается.

Запуск из корня репозитория:
  python3 tools/generic_fixture.py             собрать api-generic/fixtures/demo.json
  python3 tools/generic_fixture.py --check     собранное не отстало (код выхода 1, если отстало)
  --plugin DIR                                 плагин security_controller не из api-generic/plugins/security_controller
Потом: python3 tools/profile_fixture.py --api api-generic && python3 tools/build_api.py --api api-generic
"""
import copy
import json
import os
import re
import sys

import cli_paths
from generic_legacy import DROPPED, OBSERVED, OLD_TABLES, UNIT_FIELDS, unit, units_from_tables

API = cli_paths.opt("api", "api-generic")
# Плагин psim security_controller: plugin.json и langs/ru.json, копия из psim-sdk лежит в репозитории.
# --plugin DIR — другая папка (в том числе psim_plugins/cmd/security_controller: там plugin.json в manifest/)
PLUGIN = cli_paths.opt("plugin", f"{API}/plugins/security_controller")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_FIXTURE = "api/fixtures/demo.json"
BASE_SPEC = "api/openapi.json"
SPEC = f"{API}/openapi.json"
# Операции ядра (/kinds, /units), которые сервер api-generic уже выполняет: их система объявляет в capabilities.operations.
# Чтение — задача 3 плана, запись — задача 4 (testPutKind — служебная операция стенда, в capabilities её нет)
CORE_DONE = ["listKinds", "getKind", "listUnits", "getUnit", "getUnitSchema", "getCreatable",
             "createUnits", "patchUnit", "deleteUnit", "moveUnit", "runUnitAction", "validateUnits",
             # Команда вида без объекта (задача 8): определить модель, опросить адреса, проверить подключение до создания
             "runKindAction",
             # Предметные API объекта по uid (задача 6): видео, разговор, архив камеры, PTZ, назначение записи
             "startUnitLive", "moveUnitLive", "startUnitTalk", "getUnitTimeline", "getUnitPlayback", "listUnitHolds", "createUnitHold",
             "listUnitBookmarks", "createUnitBookmark", "fetchUnitArchive", "putUnitPtz", "deleteUnitPtz", "putUnitPreset",
             "deleteUnitPreset", "putUnitRecordingTarget",
             # Выгрузка (ADR-0117, догон базы 080bfa9): сутки с записью — предметный путь камеры по uid
             "getUnitRecordingDays"]
BASE_PAGE = "index.html"
OUT = f"{API}/fixtures/demo.json"
LANG = "ru"

# ===== Источники =====


def read(path):
    with open(path if os.path.isabs(path) else os.path.join(ROOT, path), encoding="utf-8") as f:
        return f.read()


def page_dict(page, name):
    """Словарь подписей из index.html: const NAME={key:"текст",…}; ключ — слово или строка в кавычках."""
    m = re.search(r"\bconst " + name + r"\s*=\s*\{(.*?)\};", page, re.S)
    if not m:
        sys.exit(f"В {BASE_PAGE} нет const {name}")
    return {k1 or k2: v for k1, k2, v in re.findall(r'(?:"([^"]+)"|(\w+))\s*:\s*"([^"]*)"', m.group(1))}


def page_pairs(page, name):
    """Список пар из index.html: const NAME=[["код","текст",…],…]; → {код: текст}."""
    m = re.search(r"\bconst " + name + r"\s*=\s*\[(.*?)\];", page, re.S)
    if not m:
        sys.exit(f"В {BASE_PAGE} нет const {name}")
    return {a: b for a, b in re.findall(r'\[\s*"([^"]+)"\s*,\s*"([^"]*)"', m.group(1))}


def text(key, value):
    return {"key": key, "text": value, "lang": LANG}


# ===== Схемы типизированного контракта → схемы видов =====
# Ключевые слова подмножества, которые переносим из контракта как есть
KEEP = ("type", "enum", "const", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "pattern", "format",
        "minItems", "maxItems", "required", "default", "readOnly", "description", "title")


def conv(node, S):
    """$ref раскрыт, anyOf [X, null] → X с null в type (и в enum), только ключевые слова подмножества."""
    if "$ref" in node:
        out = conv(S[node["$ref"].split("/")[-1]], S)
        if "description" in node:
            out["description"] = node["description"]
        return out
    alts = node.get("anyOf") or node.get("oneOf")
    if alts:
        rest = [a for a in alts if a != {"type": "null"}]
        if len(rest) != 1:
            sys.exit(f"Не умею перевести {json.dumps(node, ensure_ascii=False)[:200]}")
        out = conv(rest[0], S)
        if len(rest) < len(alts):
            out = nullable(out)
        if "description" in node:
            out["description"] = node["description"]
        return out
    out = {k: copy.deepcopy(node[k]) for k in KEEP if k in node}
    if "items" in node:
        out["items"] = conv(node["items"], S)
    if "properties" in node:
        out["properties"] = {k: conv(v, S) for k, v in node["properties"].items()}
    if isinstance(node.get("additionalProperties"), dict):
        out["additionalProperties"] = conv(node["additionalProperties"], S)
    elif "additionalProperties" in node:
        out["additionalProperties"] = node["additionalProperties"]
    return out


def nullable(s):
    s = dict(s)
    t = s.get("type")
    if t is not None:
        t = [t] if isinstance(t, str) else list(t)
        if "null" not in t:
            t.append("null")
        s["type"] = t
    if "enum" in s and None not in s["enum"]:
        s["enum"] = s["enum"] + [None]
    return s


def ordered(s):
    """Порядок ключей схемы свойства: подпись, тип, ограничения, расширения — так её легче читать в наборе."""
    first = ("x-label", "type", "format", "enum", "const", "items", "properties", "required", "additionalProperties")
    keys = [k for k in first if k in s] + sorted(k for k in s if k not in first and not k.startswith("x-")) + sorted(k for k in s if k.startswith("x-") and k not in first)
    return {k: s[k] for k in keys}


# ===== Устройства =====
# Секреты: в ответе нет, Unit.secrets[имя] = true. Только то, чего нет при чтении в базовом контракте: у Device — password
# (login — обычное читаемое поле Device), у Volume — password и secret (login NAS читается)
SECRETS = {"password"}
VOLUME_SECRETS = {"password", "secret"}
# Виды без своего writableFields сейчас правят всё из DevicePatch (api/server.js, fieldProblem). Свойства таких видов —
# поля их записей и то, что им по смыслу положено (описания полей Device)
DEVICE_EXTRA = {
    "det": ["detectorKind", "sensitivity", "zone", "stream", "params", "labels", "alarmKinds", "builtin", "template", "serverId", "enabled"],
    "export": ["short", "path", "format", "serverId", "enabled"],
    "email": ["short", "mode", "smtp", "port", "ssl", "from", "to", "serverId", "enabled"],
    "sms": ["short", "gateway", "serverId", "enabled"],
}
# Ссылки на объекты
REFS = {
    "serverId": {"kinds": ["server"]},
    "archiveId": {"implements": ["vms.archive/1"]},
    # Источник replica: сняли — ссылка остаётся, запись ждёт и говорит причину (waiting, SOURCE_GONE)
    "replicaFrom": {"implements": ["vms.archive/1"], "onDelete": "keep"},
    "cameraId": {"implements": ["vms.camera/1"]},
    "audioDeviceId": {"kinds": ["mic"]},
    "recordDetectorIds": {"implements": ["vms.detector/1"]},
}
# Поиск GET /devices?q= (api/server.js: name, short, identifier, ip, vendor, model); name и uid ищутся всегда
SEARCH = {"short", "identifier", "ip", "vendor", "model"}
# Родители по нынешней топологии: данные набора, api/server.js parentFits/ACS_UNITS/ACS, дерево treeKids.
# null — корень домена (parentId записи null)
DEVICE_PARENTS = {
    "camera": [None, "ipsrv"],
    "ipsrv": [None],
    "channel": ["ipsrv"],
    "mic": ["camera", "ipsrv"],
    "spk": ["camera", "ipsrv"],
    "sensor": ["camera", "channel", "ipsrv"],
    "relay": ["camera", "channel", "ipsrv", "acfa", "acfa_sensor", "acfa_lock", "acfa_fence"],
    "storage": ["camera", "ipsrv"],
    "det": ["camera"],
    "eventsrc": [None],
    "acfa": [None, "acfa"],
    "acfa_sensor": ["acfa", "camera", "ipsrv"],
    "acfa_lock": ["acfa", "camera", "ipsrv"],
    "acfa_fence": ["acfa", "camera", "ipsrv"],
    "export": [None],
    "email": [None],
    "sms": [None],
}
# Где вид устройства создаёт оператор (подмножество parents): api/server.js creatable/alienType (найденное сервером —
# только единицы под СКУД), unitCreateProblem/parentFits/ACS_UNITS, дети ipsrv в POST /devices (камеры регистратора),
# детектор — под камерой. Найденные сервером channel, mic, spk, sensor, storage оператор не создаёт
DEVICE_CREATE_PARENTS = {
    "camera": [None, "ipsrv"],
    "ipsrv": [None],
    "relay": ["acfa", "acfa_sensor", "acfa_lock", "acfa_fence"],
    "det": ["camera"],
    "eventsrc": [None],
    "acfa": [None, "acfa"],
    "acfa_sensor": ["acfa", "camera", "ipsrv"],
    "acfa_lock": ["acfa", "camera", "ipsrv"],
    "acfa_fence": ["acfa", "camera", "ipsrv"],
    "export": [None],
    "email": [None],
    "sms": [None],
}
# Под чем бывают единицы СКУД (unitOptions): что создать — спрашивать GET /units/{uid}/creatable
DYNAMIC_CREATE = {"acfa", "camera", "ipsrv"}
# Класс доступа: нынешние категории роли (reference.access.levels; index.html accObjFieldsAll, api/rule-engine.js COMMAND).
# Остальные виды класса не объявляют: класс = код вида, уровни view < edit < admin
ACCESS = {"camera": "cam", "mic": "mic", "spk": "spk", "sensor": "sens", "relay": "relay", "eventsrc": "pos",
          "acfa": "acfa", "acfa_sensor": "acfa", "acfa_lock": "acfa", "acfa_fence": "acfa"}
ARCHIVE_ACCESS = "arch"
# Дополнительные классы прав объекта (UnitKind.access.also): у камеры — телеметрия, нынешняя категория роли tel. У источника
# событий своего класса камер нет, как в «Правах» базы (accObjFieldsAll: один тип — pos): правило по его событию судится
# уровнем камер (api/rule-engine.js COMMAND: eventsrc → cam FULL) через right.class события, уровни класса cam — у камеры
ACCESS_ALSO = {"camera": ["tel"]}
# Право предметного API вида (UnitKind.apiRights): в базе пути камеры (ptz, пресеты, live, шкала…) правом роли не судятся —
# записей нет. Механизм есть: вид, которому право нужно, объявляет его здесь
API_RIGHTS = {}

# ===== Правила: события и действия видов (перевод reference.ruleTriggers, ruleActions, eventKinds и api/rule-engine.js) =====
# Событие базы (source, kind) → виды, у которых оно есть (TRIGGERS движка, deviceTypes). Код события — kind базы
TRIGGER_KINDS = {
    ("vms", "io.input"): ["sensor", "acfa_sensor"], ("det", "motion"): ["camera"], ("det", "linecross"): ["camera"],
    ("det", "lpr"): ["camera"], ("det", "other"): ["camera"], ("vms", "text"): ["eventsrc"],
    ("vms", "unit"): ["acfa_sensor", "acfa_lock", "acfa_fence"], ("vms", "silent"): ["camera"], ("rec", "segment.lost"): ["camera"],
}
# Виды событий камеры из reference.eventKinds без своей строки в ruleTriggers: детекторы — тоже события камеры
CAMERA_DETECTOR_EVENTS = ("abandoned", "disappeared", "crowd")
# Событие базы без строки в ruleTriggers (детекторы) — триггером правила не берут (rule: false); other и segment.lost — не тревоги (alarm: false).
# Порядок — как eventKinds базы: motion, linecross, abandoned, disappeared, crowd, lpr, silent, затем other, segment.lost
NOT_RULE = set(CAMERA_DETECTOR_EVENTS)
NOT_ALARM = {"other", "segment.lost"}
EVENT_ORDER = ["motion", "linecross", "abandoned", "disappeared", "crowd", "lpr", "silent", "other", "segment.lost"]
# У события есть конец (active → normal): запись «пока идёт событие», эскалация до сброса
ENDS = {"io.input", "motion"}
# Уточнения событий (match в ruleTriggers базы) — параметры события
EVENT_PARAMS = {"io.input": {"value": {"type": "string", "enum": ["active", "normal"]}}, "other": {"template": {"type": "string"}},
                "text": {"word": {"type": "string"}}, "unit": {"word": {"type": "string"}}}
EVENT_LABELS = {"other": "Другой детектор", "segment.lost": "Потеря записи"}
# Действие базы → виды (ACTIONS движка, deviceTypes). Действия без устройства (layout, email, tg, http, runrule) остаются в
# reference.ruleActions
ACTION_KINDS = {
    "arm": ["camera"], "disarm": ["camera"], "preset": ["camera"], "record": ["camera"], "disable": ["camera"], "detect": ["camera"],
    "scan": ["camera"], "alarm": ["camera"], "alarmclose": ["camera"], "wall": ["camera"], "output": ["relay"],
    "unit": ["acfa_lock", "acfa_sensor", "acfa_fence", "relay"],
}
ACTION_LABELS = {"arm": "Взять на охрану", "disarm": "Снять с охраны", "preset": "Перейти на пресет", "record": "Записывать", "disable": "Выключить на время",
                 "detect": "Включить детектор на время", "scan": "Проверить архив детектором", "alarm": "Поднять тревогу",
                 "alarmclose": "Закрыть тревогу", "wall": "Показать на видеостене", "unit": "Команда единицы"}
# Поля действия (RuleAction базы) → параметры. required — обязательные поля движка (ACTIONS.fields), x-template — шаблоны (tpl)
ACTION_PARAMS = {
    "preset": ({"preset": {"type": "integer", "minimum": 0}}, ["preset"]),
    "record": ({"duration": {"type": "string", "enum": ["min", "event"]}, "minutes": {"type": "integer", "minimum": 0},
                "afterSec": {"type": "integer", "minimum": 0}, "archive": {"type": "string"}}, []),
    "disable": ({"minutes": {"type": "integer", "minimum": 0}}, ["minutes"]),
    "detect": ({"detectorKind": {"type": "string"}, "minutes": {"type": "integer", "minimum": 1, "maximum": 1440}, "params": {"type": "string"}},
               ["detectorKind", "minutes"]),
    "scan": ({"detectorKind": {"type": "string"}, "beforeSec": {"type": "integer", "minimum": 0, "maximum": 3600},
              "afterSec": {"type": "integer", "minimum": 0, "maximum": 3600}, "archive": {"type": "string"}, "params": {"type": "string"}}, ["detectorKind"]),
    "alarm": ({"priority": {"type": "string", "enum": ["normal", "high"]}, "text": {"type": "string", "x-template": True}}, []),
    "alarmclose": ({}, []),
    "wall": ({"monitorId": {"type": "string"}}, []),
    "arm": ({}, []),
    "disarm": ({}, []),
    "unit": ({"operation": {"type": "string"}}, ["operation"]),
}
# Право назвать объект в правиле — как в базе (api/rule-engine.js COMMAND): по виду объекта, одно на все его события и действия.
# Источник событий судится классом камер (cam FULL) — у вида это дополнительный класс (ACCESS_ALSO)
RULE_RIGHT = {"camera": {"level": "FULL"}, "eventsrc": {"class": "cam", "level": "FULL"}, "sensor": {"level": "MANAGE"},
              "relay": {"level": "MANAGE"}, "acfa_sensor": {"level": "MANAGE"}, "acfa_lock": {"level": "MANAGE"}, "acfa_fence": {"level": "MANAGE"}}
# Право назвать область (папку, сервер, домен) в правиле — как в базе (roleAllowsArea): уровень камер на папке или домене,
# иначе умолчание роли; у сервера — только умолчание
AREA_RIGHT = {"class": "cam", "level": "FULL"}
SYSTEM_ACTIONS = ("layout", "email", "tg", "http", "runrule")
# Условия правил: armed, recording — у камер (профиль), online — у любого объекта правил
CONDITION_IMPLEMENTS = {"armed": ["vms.camera/1"], "recording": ["vms.camera/1"]}
IMPLEMENTS = {
    "camera": ["vms.camera/1", "vms.live/1", "vms.ptz/1", "vms.timeline/1"],
    "spk": ["vms.talk/1"],
    "det": ["vms.detector/1"],
    "acfa": ["vms.acs/1"], "acfa_sensor": ["vms.acs/1"], "acfa_lock": ["vms.acs/1"], "acfa_fence": ["vms.acs/1"],
}
# Подписи свойств сверх CARD_PROP index.html
PROP_LABELS = {
    "identifier": "Номер", "mac": "MAC", "login": "Имя пользователя", "password": "Пароль", "rtspUrl": "Адрес RTSP", "serverId": "Сервер",
    "archiveId": "Архив", "extraArchives": "Дополнительные архивы", "preRecordSec": "Предзапись, с", "recordDetectorIds": "Запись по детекторам",
    "sensitivity": "Чувствительность", "detectorKind": "Вид детектора", "subtype": "Подтип", "norm": "Нормальное состояние", "channel": "Канал",
    "videoChannel": "Видеоканал", "encrypted": "Шифрование", "provider": "Провайдер", "role": "Роль", "netmask": "Маска сети", "gateway": "Шлюз",
    "dns": "DNS", "allocated": "Распределён", "disk": "Диск", "sizeBytes": "Объём", "state": "Состояние", "path": "Путь", "mode": "Режим",
    "smtp": "SMTP сервер", "from": "От кого", "to": "Получатели", "format": "Формат", "firmware": "Драйвер", "cameraId": "Камера титров",
    "streamId": "Код потока", "width": "Ширина", "height": "Высота", "secret": "Секретный ключ", "keyId": "Ключ доступа", "bucket": "Корзина",
    "region": "Регион", "host": "Сервер", "endpoint": "Адрес", "style": "Вид адреса", "account": "Учётная запись", "proto": "Протокол", "dir": "Папка",
    "file": "Файл",
}


# Поля, которые у вида есть на самом деле. У камеры, источника событий и СКУД capabilities.writableFields — весь DevicePatch
# (так старые пути не судили поле по виду): схема вида — только своё, сверх него — то, что есть в записях набора
KIND_FIELDS = {
    "camera": {"enabled", "ip", "port", "vendor", "model", "login", "password", "rtspUrl", "mac", "identifier", "short", "serverId", "archiveId",
               "recordMode", "stream", "extraArchives", "replicaFrom", "recordScheduleId", "retentionDays", "minDepthDays", "audioDeviceId",
               "preRecordSec", "recordDetectorIds", "res", "fps", "codec", "firmware", "labels", "lat", "lon", "azimuth", "alarmKinds",
               "videoChannel"},
    "eventsrc": {"enabled", "ip", "port", "vendor", "model", "login", "password", "mac", "identifier", "short", "serverId", "cameraId",
                 "words", "overlayDelayMs", "overlayDurationSec"},
    "acfa": {"enabled", "ip", "port", "vendor", "model", "login", "password", "mac", "identifier", "short", "path"},
}
# Профиль камеры при добавлении (DeviceCreate.configMode, templateId): разовый выбор строки создания — x-transient, после
# создания не правится (x-immutable)
CREATE_ONLY = {"camera": ["configMode", "templateId"]}
# Подтверждение уменьшения карты камеры w2c (запись storage) — как у тома: пишется в правке рядом с sizeBytes, не хранится
TRANSIENT = {"storage": ["confirmShrinkBytes"]}


def device_kind_schema(t, recs, caps, S, labels):
    """Схема вида устройства t."""
    device, patch, create = S["Device"]["properties"], S["DevicePatch"]["properties"], S["DeviceCreate"]["properties"]
    present = {k for r in recs for k in r} - UNIT_FIELDS - DROPPED - set(OBSERVED["devices"])
    listed = caps["writableFields"].get(t)
    writable = set(listed) if listed is not None else set(DEVICE_EXTRA.get(t, [])) & set(patch)
    # Карта камеры w2c: запись storage со своим writableFields (recordMode, sizeBytes) — правится и у вида
    for r in recs:
        writable |= set(r.get("writableFields", []))
    names = present | writable | set(DEVICE_EXTRA.get(t, []))
    names -= {"name", "configMode", "templateId", "confirmShrinkBytes"}
    if t in KIND_FIELDS:
        names &= KIND_FIELDS[t] | present
        writable &= names
    creatable = t not in caps["foundDeviceTypes"] or t in caps["unitTypes"]
    props = {}
    for name in sorted(names):
        s = typed_prop(name, device, patch, create, S)
        if s is None:
            sys.exit(f"Поле {name} вида {t}: нет в Device, DevicePatch, DeviceCreate")
        if name not in writable:
            # Только при создании — x-immutable; что сервер заполняет сам («Только чтение» в Device) — readOnly
            if creatable and name in create and not str((device.get(name) or {}).get("description", "")).startswith("Только чтение"):
                s["x-immutable"] = True
            else:
                s["readOnly"] = True
        if name in SECRETS:
            s["writeOnly"] = True
        props[name] = decorate(name, s, labels, search=True)
    for name in CREATE_ONLY.get(t, []):
        s = conv(create[name], S)
        s.update({"x-transient": True, "x-immutable": True})
        props[name] = ordered(s)
    for name in TRANSIENT.get(t, []):
        props[name] = ordered(dict(conv(patch[name], S), **{"x-transient": True}))
    return props


def device_actions(t, S):
    """Команды вида устройства: определить модель (бывший POST /devices/probe), реле (operations/output), единицы СКУД
    (operations/{operation}: команды шаблона unitOptions)."""
    acs = {"acfa_lock": [("open", "Открыть"), ("close", "Закрыть"), ("block", "Заблокировать")], "acfa_fence": [("arm", "Взять под охрану"), ("disarm", "Снять с охраны")]}
    done = {"type": "object", "additionalProperties": False, "required": ["done"], "properties": {"done": {"type": "boolean"}}}
    if t in ("camera", "ipsrv"):
        # Модель определяют и до добавления: команда вида без объекта (scope kind)
        return [{"id": "probe", "label": text(f"action.{t}.probe", "Определить модель"), "execution": "instant", "scope": ["unit", "kind"],
                 "params": conv(S["DeviceProbeRequest"], S), "result": conv(S["DeviceProbeResult"], S)}]
    if t == "relay":
        args = conv(S["DeviceOperationArgs"], S)
        args["required"] = ["state"]
        return [{"id": "output", "label": text("action.relay.output", "Выход"), "execution": "instant", "params": args, "result": done}]
    return [{"id": c, "label": text(f"action.{t}.{c}", lbl_), "execution": "instant", "result": done} for c, lbl_ in acs.get(t, [])]


def rule_events(t, ref, labels):
    """События вида t — источники правил (RuleTrigger source: unit): строки reference.ruleTriggers и eventKinds базы."""
    out = []
    pairs = [(x["source"], x["kind"]) for x in ref["ruleTriggers"]] + [("det", k) for k in CAMERA_DETECTOR_EVENTS]
    for source, code in pairs:
        if t not in TRIGGER_KINDS.get((source, code), ["camera"] if code in CAMERA_DETECTOR_EVENTS else []):
            continue
        e = {"id": code, "label": text(f"event.{code}", labels["event"].get(code) or EVENT_LABELS[code])}
        if code in EVENT_PARAMS:
            e["params"] = {"type": "object", "properties": copy.deepcopy(EVENT_PARAMS[code])}
        if code in ENDS:
            e["ends"] = True
        if code in NOT_RULE:
            e["rule"] = False
        if code in NOT_ALARM:
            e["alarm"] = False
        if t in RULE_RIGHT:
            e["right"] = dict(RULE_RIGHT[t])
        out.append(e)
    # Порядок событий камеры — как в «Что считать тревогой» базы; прочие виды — как были
    out.sort(key=lambda e: EVENT_ORDER.index(e["id"]) if e["id"] in EVENT_ORDER else -1)
    return out


def kind_rule_action(t, code, ref):
    """Действие правила code у вида t: поля строки reference.ruleActions базы → params, варианты полей — enum."""
    props, required = ACTION_PARAMS[code]
    props = copy.deepcopy(props)
    row = next(a for a in ref["ruleActions"] if a["action"] == code)
    for f in row["fields"]:
        if f["id"] in props and f.get("options"):
            props[f["id"]]["enum"] = list(f["options"])
    a = {"id": code, "label": text(f"action.{t}.{code}", ACTION_LABELS[code]), "execution": "instant", "ruleAction": True, "ruleOnly": True,
         "params": {"type": "object", "additionalProperties": False, "properties": props}}
    if required:
        a["params"]["required"] = list(required)
    right = RULE_RIGHT.get(t)
    if right:
        a["right"] = dict(right)
    return a


def rule_actions(t, S, ref):
    """Команды вида t (device_actions) и действия правил: команда реле output — и действие правила (импульс — state + pulseMs,
    номер выхода port — как в записи); прочие действия правил — только правилом (ruleOnly)."""
    out = device_actions(t, S)
    for a in out:
        if a["id"] == "output":
            a["params"]["properties"]["port"] = {"type": "integer", "minimum": 0,
                                                 "description": "Необязательно. Номер выхода берётся из записи (channel); если поле есть, значит то же самое"}
            a["ruleAction"] = True
            # Команда реле в базе (POST /devices/{id}/operations/output) правом не судится; в правиле — уровень реле (COMMAND)
            a["ruleRight"] = dict(RULE_RIGHT[t])
    have = {a["id"] for a in out}
    out += [kind_rule_action(t, code, ref) for code, kinds in ACTION_KINDS.items() if t in kinds and code not in have]
    return out


def typed_prop(name, typed, patch, create, S):
    """Схема свойства из записи контракта, иначе из *Patch или *Create. null в *Patch — это «убрать поле» JSON Merge Patch,
    а не значение свойства: у взятого оттуда null снимается"""
    if name in typed:
        s = conv(typed[name], S)
    elif name in patch or name in create:
        s = conv(patch.get(name) or create.get(name), S)
        if isinstance(s.get("type"), list) and "null" in s["type"]:
            rest = [x for x in s["type"] if x != "null"]
            s["type"] = rest[0] if len(rest) == 1 else rest
            if "enum" in s:
                s["enum"] = [v for v in s["enum"] if v is not None]
    else:
        return None
    s.pop("readOnly", None)
    return s


def decorate(name, s, labels, search=False):
    """Подпись, поиск (только у устройств: так ищет GET /devices?q=), ссылки, подписи вариантов."""
    if name in labels["prop"]:
        s["x-label"] = text(f"field.{name}", labels["prop"][name])
    if search and name in SEARCH:
        s["x-search"] = True
    if name in REFS:
        target = s["items"] if s.get("type") == "array" else s
        target["x-ref"] = dict(REFS[name])
        s["x-ui-widget"] = "ref"
    enum_labels = labels["enum"].get(name)
    target = s["items"] if s.get("type") == "array" else s
    if enum_labels and "enum" in target:
        target["x-enum-labels"] = {str(v): text(f"enum.{name}.{v}", enum_labels[v]) for v in target["enum"] if v is not None and v in enum_labels}
    if name == "extraArchives":
        for k in ("archiveId", "replicaFrom"):
            s["items"]["properties"][k]["x-ref"] = dict(REFS[k])
    if name in ("password", "secret"):
        s["x-ui-widget"] = "password"
    return ordered(s)


# ===== Остальные виды =====


def plain_props(fields, typed, patch, create, S, labels, writable=None, secrets=()):
    """Свойства вида из типизированной записи: правимое — из *Patch, при создании — x-immutable, прочее — readOnly."""
    writable = set(patch) if writable is None else writable
    props = {}
    for name in fields:
        s = typed_prop(name, typed, patch, create, S)
        if name not in writable:
            if name in create:
                s["x-immutable"] = True
            else:
                s["readOnly"] = True
        if name in secrets:
            s["writeOnly"] = True
        props[name] = decorate(name, s, labels)
    return props


def archive_check(S):
    """Проверка подключения (бывший POST /archives/check) — у видов с check: NAS и бакет. Том — как при создании; проверяют и
    до создания хранилища — команда вида без объекта (scope kind), и том существующего — команда объекта"""
    req = S["ArchiveCheckRequest"]["properties"]
    return {"id": "check", "label": text("action.archive.check", "Проверить подключение"), "execution": "instant", "scope": ["unit", "kind"],
            "params": {"type": "object", "additionalProperties": False, "required": ["volume"],
                       "properties": {"provider": conv(req["provider"], S), "volume": conv(req["volume"], S)}},
            "result": conv(S["ArchiveCheckResult"], S)}


def archive_kind(spec_k, S, ref, labels):
    """Вид хранилища: схема по адресу и режимам вида из reference.archiveKinds."""
    typed, patch, create = S["Archive"]["properties"], S["ArchivePatch"]["properties"], S["ArchiveCreate"]["properties"]
    fields = ["storage", "encrypted", "retentionDays", "provider", "admits"] + (["recordMode"] if spec_k["archiveModes"] else [])
    props = plain_props(fields, typed, patch, create, S, labels)
    props["storage"]["enum"] = list(ref["storageTypes"])
    if not spec_k["encryption"]:
        props["encrypted"]["const"] = False
    if not spec_k["admits"]:
        props["admits"]["const"] = False
    if spec_k["address"] == "bucket":
        props["provider"]["enum"] = [p["id"] for p in ref["cloudProviders"]] + [None]
    else:
        props["provider"] = ordered(dict(props["provider"], type="null"))
    if spec_k["archiveModes"]:
        rm = props["recordMode"]
        rm.update(type="string", enum=list(spec_k["archiveModes"]))
        if "archiveModeDefault" in spec_k:
            rm["default"] = spec_k["archiveModeDefault"]
        rm["x-enum-labels"] = {m: text(f"enum.archiveMode.{m}", labels["archiveMode"][m]) for m in spec_k["archiveModes"] if m in labels["archiveMode"]}
        props["recordMode"] = ordered(rm)
    return {"type": "object", "additionalProperties": False, "required": ["storage", "encrypted", "retentionDays", "provider"], "properties": props}


# ===== Незнакомые виды =====


def plugin_kinds(cameras_profile):
    """security_controller: plugin.json и langs/ru.json → два вида."""
    path = f"{PLUGIN}/plugin.json"
    if not os.path.exists(path if os.path.isabs(path) else os.path.join(ROOT, path)):
        path = f"{PLUGIN}/manifest/plugin.json"
    manifest = json.loads(read(path))
    ru = json.loads(read(f"{PLUGIN}/langs/ru.json"))
    pid = manifest["metadata"]["plugin_id"]
    # Подписей команд и событий в langs нет: запасной текст наш, ключ — место в манифесте
    fallback = {"command.arm": "Поставить на охрану", "command.disarm": "Снять с охраны", "command.bypass": "Обойти", "command.unbypass": "Снять обход",
                "event.online": "На связи", "event.offline": "Нет связи", "event.alarm": "Тревога", "event.restore": "Норма",
                "event.tamper": "Вскрытие корпуса"}
    say = lambda key: text(f"{pid}.{key}", ru.get(key) or fallback.get(key) or key)
    setup = next(p for p in manifest["provides"] if p.get("role") == "setup_ui")
    setup_kinds = [f"{pid}/{t}" for t in setup["object_types"].split(",")]
    out = []
    for ot in manifest["object_types"]:
        code = f"{pid}/{ot['type']}"
        props = {}
        for order, (name, p) in enumerate(ot["parameters"].items(), 1):
            if name == "name":
                continue  # имя объекта — Unit.name
            s = {"x-label": say(p["name_key"]), "type": p["type"]}
            if "items" in p:
                s["items"] = dict(p["items"])
            if p.get("description_key") in ru:
                s["description"] = ru[p["description_key"]]
            target = s["items"] if p["type"] == "array" else s
            if "enum_values" in p:
                target["enum"] = [e["value"] for e in p["enum_values"]]
                target["x-enum-labels"] = {e["value"]: say(e["name_key"]) for e in p["enum_values"]}
                s["x-ui-widget"] = "multiselect" if p["type"] == "array" else "select"
            if "default" in p:
                s["default"] = p["default"]
            src = p.get("source") or {}
            if src.get("provider") == "platform_objects" and src.get("object_type") == "CAM":
                target["x-ref"] = {"implements": [cameras_profile]}
                s["x-ui-widget"] = "ref"
                if p["type"] == "string":
                    s["type"] = ["string", "null"]
            if name == "ip_address":
                s["x-search"] = True
            s["x-ui-order"] = order
            props[name] = ordered(s)
        out.append({
            "kind": code,
            "origin": {"system": "ngp", "plugin": pid, "pluginVersion": manifest["metadata"]["plugin_version"]},
            "label": say(ot["name_key"]),
            "icon": f"{pid}.{ot['type'].lower()}",
            "parents": [None] if ot["parent"] is None else [f"{pid}/{ot['parent']}"],
            "implements": [],
            "capabilities": ["create", "rename", "delete"] + (["folders"] if ot["parent"] is None else []),
            "access": {"class": pid, "label": text(f"access.{pid}", "Охранные контроллеры"), "levels": ["view", "edit", "admin"]},
            "schema": {"type": "object", "additionalProperties": False, "properties": props},
            "actions": [{"id": c["id"], "label": say(c["name_key"]), "execution": "instant", "group": True, "ruleAction": True,
                         "right": {"level": "edit"}}
                        for c in ot.get("commands", [])],
            "events": [{"id": e["id"], "label": say(e["name_key"]), "severity": e["severity"]} for e in ot.get("events", [])],
            "setupUi": {"url": f"stub://plugin/{pid}/setup", "kinds": setup_kinds, "mode": "tab"},
        })
    return out


# Подпись в описаниях синтетических видов — короче
L = text


def unknown_kind():
    """test.unknown: по одному полю каждого типа и виджета, вкладки и группы, секрет с x-bound-to, действия и события."""
    main, extra = L("tab.test.main", "Основное"), L("tab.test.extra", "Дополнительно")
    g_id, g_net, g_geo = L("group.test.id", "Опознание"), L("group.test.net", "Подключение"), L("group.test.geo", "Геометрия")
    point = {"type": "array", "items": {"type": "number", "minimum": 0, "maximum": 1}, "minItems": 2, "maxItems": 2}
    f = lambda key, label, tab, group, order, **s: ordered(dict(s, **{"x-label": L(f"field.test.{key}", label), "x-ui-tab": tab, "x-ui-group": group, "x-ui-order": order}))
    props = {
        "title": f("title", "Заголовок", main, g_id, 1, type="string", minLength=1, maxLength=64, **{"x-ui-widget": "text", "x-search": True}),
        "serial": f("serial", "Серийный номер", main, g_id, 2, type="string", pattern="^[A-Z0-9-]{4,32}$", **{"x-immutable": True, "x-unique": True, "x-search": True}),
        "notes": f("notes", "Заметки", main, g_id, 3, type="string", maxLength=2000, **{"x-ui-widget": "textarea"}),
        "comment": f("comment", "Комментарий", main, g_id, 4, type=["string", "null"], maxLength=200),
        "active": f("active", "Работает", main, g_id, 5, type="boolean", default=True, **{"x-ui-widget": "switch"}),
        "mode": f("mode", "Режим", main, g_id, 6, type="string", enum=["auto", "manual", "off"], default="auto",
                  **{"x-ui-widget": "select", "x-ui-filter": True,
                     "x-enum-labels": {"auto": L("enum.test.mode.auto", "Сам"), "manual": L("enum.test.mode.manual", "Вручную"), "off": L("enum.test.mode.off", "Выключен")}}),
        "tags": f("tags", "Метки", main, g_id, 7, type="array", maxItems=3,
                  items={"type": "string", "enum": ["a", "b", "c"], "x-enum-labels": {"a": L("enum.test.tags.a", "Альфа"), "b": L("enum.test.tags.b", "Бета"), "c": L("enum.test.tags.c", "Гамма")}},
                  **{"x-ui-widget": "multiselect"}),
        "site": f("site", "Площадка", main, g_id, 8, type="string", maxLength=64, default="Без площадки", **{"x-inherit": {"merge": False}}),
        "host": f("host", "Адрес", main, g_net, 10, type="string", maxLength=255, **{"x-bound-to": "secret", "x-search": True}),
        "port": f("port", "Порт", main, g_net, 11, type="integer", minimum=1, maximum=65535),
        "secret": f("secret", "Пароль", main, g_net, 12, type="string", minLength=4, writeOnly=True, **{"x-ui-widget": "password"}),
        "threshold": f("threshold", "Порог", main, g_net, 13, type="number", minimum=0, maximum=100, exclusiveMaximum=100.5, **{"x-ui-widget": "number", "x-ui-unit": "%"}),
        "count": f("count", "Каналов", main, g_net, 14, type="integer", minimum=1, maximum=64, **{"x-ui-widget": "number", "x-ui-unit": "шт."}),
        "camera": f("camera", "Камера", extra, g_net, 20, type=["string", "null"], **{"x-ref": {"implements": ["vms.camera/1"]}, "x-ui-widget": "ref"}),
        "cameras": f("cameras", "Камеры", extra, g_net, 21, type="array", maxItems=8, items={"type": "string", "x-ref": {"implements": ["vms.camera/1"]}}, **{"x-ui-widget": "ref"}),
        "scheduleId": f("scheduleId", "Расписание", extra, g_net, 22, type=["string", "null"], format="uuid", **{"x-ui-widget": "schedule"}),
        "firmwareFile": f("firmwareFile", "Файл прошивки", extra, g_net, 23, type="string", **{"x-ui-widget": "file"}),
        "priority": f("priority", "Приоритет в кластере", extra, g_net, 24, type="integer", minimum=0, maximum=9, **{"x-rights": {"scope": "cluster"}}),
        "zone": f("zone", "Зона", extra, g_geo, 30, type="array", minItems=3, maxItems=16, items=point, **{"x-ui-widget": "polygon"}),
        "line": f("line", "Линия", extra, g_geo, 31, type="array", minItems=2, maxItems=2, items=point, **{"x-ui-widget": "line"}),
        "spot": f("spot", "Точка", extra, g_geo, 32, **dict(point, **{"x-ui-widget": "point"})),
        "mask": f("mask", "Маска", extra, g_geo, 33, type="string", maxLength=4096, **{"x-ui-widget": "mask"}),
        "hologram": f("hologram", "Голограмма", extra, g_geo, 34, type="object", additionalProperties=True, **{"x-ui-widget": "hologram", "x-future": {"since": "v9"}}),
        "debug": f("debug", "Отладка", extra, g_net, 40, type="boolean", default=False, **{"x-ui-advanced": True}),
        "firmwareVersion": f("firmwareVersion", "Версия прошивки", extra, g_net, 41, type="string", readOnly=True),
    }
    return {
        "kind": "test.unknown",
        "origin": {"system": "test"},
        "label": L("kind.test.unknown", "Незнакомый объект"),
        "labelPlural": L("kind.test.unknown.plural", "Незнакомые объекты"),
        "icon": "test.unknown",
        "parents": [None, "test.unknown"],
        "implements": [],
        "capabilities": ["create", "rename", "delete", "move", "folders", "bulkSet"],
        "schema": {
            "type": "object", "additionalProperties": False, "required": ["title", "mode"], "properties": props,
            # Ручной режим — с числом каналов; адрес — с портом
            "if": {"properties": {"mode": {"const": "manual"}}, "required": ["mode"]}, "then": {"required": ["count"]},
            "dependentSchemas": {"host": {"required": ["port"]}},
        },
        "actions": [
            {"id": "ping", "label": L("action.test.ping", "Проверить связь"), "execution": "instant", "group": True, "ruleAction": True, "right": {"level": "view"},
             "params": {"type": "object", "additionalProperties": False, "required": ["count"],
                        "properties": {"count": {"type": "integer", "minimum": 1, "maximum": 10, "x-label": L("field.test.ping.count", "Сколько раз")},
                                       "note": {"type": "string", "maxLength": 100, "x-label": L("field.test.ping.note", "Пометка")}}},
             "result": {"type": "object", "properties": {"rttMs": {"type": "number", "x-label": L("field.test.ping.rtt", "Задержка, мс")}}}},
            {"id": "calibrate", "label": L("action.test.calibrate", "Откалибровать"), "execution": "longRunning", "group": True, "right": {"level": "admin"},
             "confirm": {"typeCount": True, "text": L("action.test.calibrate.confirm", "Калибровка остановит объект на минуту")},
             "params": {"type": "object", "additionalProperties": False,
                        "properties": {"level": {"type": "string", "enum": ["low", "high"], "default": "low", "x-label": L("field.test.calibrate.level", "Уровень")}}}},
        ],
        "events": [
            {"id": "triggered", "label": L("event.test.triggered", "Сработал"), "severity": "alarm",
             "params": {"type": "object", "properties": {"zone": {"type": "string", "x-label": L("field.test.event.zone", "Зона")}}}},
            {"id": "restored", "label": L("event.test.restored", "Восстановлен"), "severity": "info"},
        ],
    }


def perunit_kind():
    """test.perunit: схема объекта зависит от model (GET /units/{uid}/schema — ветка if/then его модели)."""
    res = lambda opts: {"properties": {"resolution": {"enum": opts}}}
    return {
        "kind": "test.perunit",
        "origin": {"system": "test"},
        "label": L("kind.test.perunit", "Объект со своей схемой"),
        "icon": "test.perunit",
        "parents": [None],
        "implements": [],
        "capabilities": ["create", "rename", "delete"],
        "schemaPerUnit": True,
        "schema": {
            "type": "object", "additionalProperties": False, "required": ["model"],
            "properties": {
                "model": {"x-label": L("field.test.model", "Модель"), "type": "string", "enum": ["tp-100", "tp-200"], "x-immutable": True},
                "channels": {"x-label": L("field.test.channels", "Каналов"), "type": "integer", "minimum": 1},
                "resolution": {"x-label": L("field.test.resolution", "Разрешение"), "type": "string", "pattern": "^[0-9]+x[0-9]+$"},
            },
            "if": {"properties": {"model": {"const": "tp-100"}}, "required": ["model"]},
            "then": {"properties": {"channels": {"maximum": 4}, **res(["1280x720", "1920x1080"])["properties"]}},
            "else": {"properties": {"channels": {"maximum": 16}, **res(["1920x1080", "3840x2160"])["properties"]}},
        },
    }


def rows_kind():
    """w2c.example/rows: строка таблицы подсистемы w2c с хозяином-камерой (родитель по rights.unit_of)."""
    return {
        "kind": "w2c.example/rows",
        "origin": {"system": "w2c", "subsystem": "example", "table": "rows"},
        "label": L("kind.w2c.example.rows", "Строка таблицы (пример w2c)"),
        "icon": "w2c.row",
        "parents": ["camera"],
        "implements": [],
        "capabilities": ["create", "delete", "bulkSet"],
        "schema": {
            "type": "object", "additionalProperties": False, "required": ["slot", "channelType"],
            "properties": {
                "slot": {"x-label": L("field.w2c.example.slot", "Номер"), "type": "integer", "minimum": 1, "maximum": 16, "x-immutable": True, "x-unique": True},
                "channelType": {"x-label": L("field.w2c.example.channelType", "Тип"), "type": "string", "enum": ["io", "audio"],
                                "x-enum-labels": {"io": L("enum.w2c.example.channelType.io", "Вход-выход"), "audio": L("enum.w2c.example.channelType.audio", "Звук")}},
                "enabled": {"x-label": L("field.enabled", "Включено"), "type": "boolean", "default": True},
                "note": {"x-label": L("field.w2c.example.note", "Пометка"), "type": "string", "maxLength": 200},
            },
        },
    }


def shared_kind():
    """domain.shared: общие настройки домена, один документ на домен; здесь — умолчания полей x-inherit по видам."""
    return {
        "kind": "domain.shared",
        "origin": {"system": "w2c"},
        "label": L("kind.domain.shared", "Общие настройки домена"),
        "icon": "settings",
        "parents": [None],
        "implements": [],
        "capabilities": [],
        "shape": "document",
        "schema": {
            "type": "object", "additionalProperties": False,
            "properties": {
                "test.unknown": {"x-label": L("kind.test.unknown", "Незнакомый объект"), "type": "object", "additionalProperties": False,
                                 "properties": {"site": {"x-label": L("field.test.site", "Площадка"), "type": "string", "maxLength": 64}}},
            },
        },
    }


# ===== Профили =====
PROFILES = [
    ("vms.domain/1", "Домен", []), ("vms.server/1", "Сервер", []), ("vms.folder/1", "Папка", []), ("vms.camera/1", "Камера", ["recording-target", "recording-days"]),
    ("vms.archive/1", "Хранилище", []), ("vms.volume/1", "Том", []), ("vms.stream/1", "Поток", []), ("vms.detector/1", "Детектор", []),
    ("vms.acs/1", "Единица СКУД с командами", []),
    ("vms.live/1", "Живое видео", ["live"]), ("vms.ptz/1", "PTZ", ["ptz", "presets/{n}"]), ("vms.talk/1", "Разговор", ["talk"]),
    ("vms.timeline/1", "Архив: шкала и записи", ["timeline", "playback", "holds", "bookmarks", "archive-fetch"]),
]
# Профили-возможности предметных API: свойства — свои, а не общие у видов
CAPABILITY_PROPS = {"vms.live/1": [], "vms.ptz/1": ["ptz", "presets", "presetMax"], "vms.talk/1": [], "vms.timeline/1": []}
# Состояние камеры, которого нет в записях набора, но оно есть в Device. Тот же список — PROFILE_STATUS_EXTRA в
# tools/check_api.py: имя status профиля без данных в наборе допустимо, только если оно названо там
CAMERA_STATUS_EXTRA = ["detectorKinds", "direct", "recordingTarget"]
STATUS_EXTRA = {"vms.camera/1": CAMERA_STATUS_EXTRA}
# Свойства, которые показывают ручные экраны профиля, хотя они есть не у каждого его вида: «Когда писать» у хранилища на карте
# сервера (archive.edge), карточка динамика (spk), подключение СКУД и команды и свойства единиц (acfa, acfa_*)
PROFILE_EXTRA = {
    "vms.archive/1": ["recordMode"],
    "vms.talk/1": ["channel", "enabled", "short"],
    "vms.acs/1": ["identifier", "ip", "login", "password", "port", "unitOptions", "vendor", "operations", "properties"],
}
# Свойства профиля камеры: поля записей камер набора и правимое, что читает карточка камеры. Остальное из writableFields
# камеры (smtp, words, zone… — общий список правки устройств) в профиль не входит
# configMode, templateId — профиль при добавлении (x-transient): их показывает мастер добавления камеры, а не вкладка
# «Дополнительно» — свойства профиля, а не сверх него
CAMERA_PROFILE_EXTRA = ["login", "password", "firmware", "preRecordSec", "recordDetectorIds", "stream", "configMode", "templateId"]


# ===== Правила, запуски, права: перевод на описания видов =====


def rule_target(t):
    """Цель: устройство {kind: device, id} → {uid}, область {kind, id} → {area, uid}."""
    if t is None:
        return None
    inc = [{"uid": x["id"]} if x["kind"] == "device" else {"area": x["kind"], "uid": x["id"]} for x in t["include"]]
    return {"include": inc, "exclude": list(t["exclude"]), "gone": list(t["gone"]), "fromEvent": t["fromEvent"]}


def rule_trigger(t):
    """Событие {source, kind, target, match} → {source: unit, kinds, event, target, match}."""
    return {"source": "unit", "kinds": list(TRIGGER_KINDS[(t["source"], t["kind"])]), "event": t["kind"], "target": rule_target(t["target"]),
            "match": copy.deepcopy(t["match"])}


# Состояние выхода реле в правиле базы (строка) → state команды output: импульс — замкнуть и вернуть через pulseMs
OUTPUT_STATE = {"pulse": True, "on": True, "off": False}


def rule_action(a):
    """Действие на устройстве → {type: unitAction, action, target, params}; действие без устройства — как было."""
    if a["action"] in SYSTEM_ACTIONS:
        return copy.deepcopy(a)
    params = {k: copy.deepcopy(v) for k, v in a.items() if k not in ("source", "action", "target")}
    if a["action"] == "output" and "state" in params:
        params["state"] = OUTPUT_STATE[params["state"]]
    return {"type": "unitAction", "action": a["action"], "target": rule_target(a.get("target")), "params": params}


def rule_step(a):
    if "control" not in a:
        return rule_action(a)
    out = copy.deepcopy(a)
    if a["control"] == "waitEvent":
        out["event"] = rule_trigger(a["event"])
    for b in ("yes", "no"):
        if b in a:
            out[b] = [rule_step(x) for x in a[b]]
    return out


def rule_condition(c):
    out = copy.deepcopy(c)
    if "target" in c:
        out["target"] = rule_target(c["target"])
    return out


def rule_content(r):
    out = copy.deepcopy(r)
    out["triggers"] = [rule_trigger(t) for t in r["triggers"]]
    out["conditions"] = [rule_condition(c) for c in r["conditions"]]
    out["steps"] = [rule_step(a) for a in r["steps"]]
    return out


def fire_event(e):
    """Событие запуска (и ожидаемое событие в подписи): {source, kind, match} → {source: unit, event, match}."""
    return {"source": "unit", "event": e["kind"], "match": copy.deepcopy(e["match"]), **{k: e[k] for k in ("deviceId", "at") if k in e}}


def fire_msg(m):
    """Сообщение трассы кодом: события, цели и действия в параметрах — в новом виде."""
    if not m:
        return m
    p = dict(m["params"])
    if "condition" in p:
        p["condition"] = rule_condition(p["condition"])
    if "trigger" in p and p["trigger"]:
        t = p["trigger"]
        p["trigger"] = rule_trigger(t) if "target" in t else {"source": "unit", "event": t["kind"]}
    if "event" in p and isinstance(p["event"], dict):
        p["event"] = fire_event(p["event"])
    if "target" in p and isinstance(p["target"], dict):
        p["target"] = rule_target(p["target"])
    return {"code": m["code"], "params": p}


def rule_fire(f):
    out = copy.deepcopy(f)
    out["events"] = [fire_event(e) for e in f["events"]]
    out["checks"] = [dict(c, params=fire_msg({"code": c["code"], "params": c["params"]})["params"], reason=fire_msg(c["reason"])) for c in f["checks"]]
    out["steps"] = [dict(s, action=rule_action(s["action"]) if s["action"] else None, label=fire_msg(s["label"]), reason=fire_msg(s["reason"]),
                         note=fire_msg(s["note"])) for s in f["steps"]]
    return out


def kind_access(rights, defaults):
    """Умолчания роли dCam, dSens… (reference.access.defaults: key → класс) → kindAccess {класс: уровень}; остальное — как было."""
    cls = {d["key"]: d["levels"] for d in defaults}
    out = {k: copy.deepcopy(v) for k, v in rights.items() if k not in cls}
    ka = {cls[k]: rights[k] for k in cls if k in rights}
    return out, ka


def access_reference(acc):
    """Справочник прав: умолчания — классы Role.kindAccess (key = класс), fieldDefaults не нужен (поле папки = класс),
    шаблоны ролей — kindAccess вместо dCam…"""
    out = copy.deepcopy(acc)
    out["defaults"] = [{"key": d["levels"], "levels": d["levels"]} for d in acc["defaults"]]
    out.pop("fieldDefaults", None)
    for t in out["roleTemplates"]:
        rights, ka = kind_access(t["rights"], acc["defaults"])
        t["rights"] = dict(rights, kindAccess=ka)
    return out


def access_section(a, defaults):
    out = copy.deepcopy(a)
    for r in out["roles"]:
        r["global"], ka = kind_access(r["global"], defaults)
        r["kindAccess"] = ka
    return out


REFERENCE_TO_KINDS = ("deviceKinds", "deviceParams", "ipServerSubtypes", "detectorKinds", "archiveKinds", "storageTypes", "volumeStates", "unitOptions")
CAPABILITIES_TO_KINDS = ("deviceTypes", "foundDeviceTypes", "unitTypes", "writableFields")


def rule_reference(ref):
    """Каталог «Автоматизации»: события и действия на объектах — в описаниях видов (events, actions с ruleAction); в
    справочнике — только то, что не про объекты: действия без устройства, условия, ход выполнения, способы запуска, области целей."""
    out = copy.deepcopy(ref)
    for k in ("ruleTriggers", "eventKinds"):
        out.pop(k, None)
    # Справочники видов — в описаниях видов (описание решения, 5.1): группы мастера — x-ui-category, параметры и подвиды —
    # перечисления схем, виды детекторов — detectorKind вида det, виды хранилищ — x-archive видов archive.*, типы хранилищ
    # и состояния томов — перечисления схем. Что правится — Unit.writable и readOnly схемы, какие виды есть — GET /kinds
    for k in REFERENCE_TO_KINDS:
        out.pop(k, None)
    for k in CAPABILITIES_TO_KINDS:
        out["capabilities"].pop(k, None)
    out["ruleActions"] = [{k: v for k, v in a.items() if k != "deviceTypes"} for a in ref["ruleActions"] if a["action"] in SYSTEM_ACTIONS]
    out["ruleConditions"] = [dict({"kind": c["kind"]}, **({"implements": list(CONDITION_IMPLEMENTS[c["kind"]])} if c["kind"] in CONDITION_IMPLEMENTS else {}),
                                  **({"target": True} if c["deviceTypes"] else {})) for c in ref["ruleConditions"]]
    out["ruleTargets"] = {"areas": [k for k in ref["ruleTargets"]["kinds"] if k != "device"], "fromEvent": ref["ruleTargets"]["fromEvent"],
                          "areaRight": dict(AREA_RIGHT)}
    out["access"] = access_reference(ref["access"])
    return out


# ===== Сборка =====


def build(base, S, page, ops):
    ref, caps = base["reference"], base["reference"]["capabilities"]
    labels = {
        "kind": page_dict(page, "LB_RU"),
        "archive": page_dict(page, "ARCH_LABEL"),
        "archiveMode": page_dict(page, "ARCH_MODE_RU"),
        "prop": dict(page_dict(page, "CARD_PROP"), **PROP_LABELS),
        "enum": {
            "recordMode": page_pairs(page, "REC_MODES_ALL"), "detectorKind": page_dict(page, "DET_KIND_RU"), "subtype": page_dict(page, "IPSUB"),
            "norm": page_dict(page, "NORM_RU"), "mode": page_dict(page, "EMAIL_MODE_RU"), "role": page_dict(page, "ROLE_RU"), "state": page_dict(page, "VOL_STATES"),
        },
        "plural": dict(page_pairs(page, "TF_ACFA"), **page_pairs(page, "TF_SVC")),
        "event": page_dict(page, "EVENT_RU"),
    }
    # Подпись класса доступа — из ACC_DEF_TEXT: ["dCam","Камеры","cam",…]
    access_label = {c: t for d, t, c in re.findall(r'\["(\w+)","([^"]+)","(\w+)"', re.search(r"const ACC_DEF_TEXT=\[(.*?)\];", page, re.S).group(1))}
    levels = ref["access"]["levels"]

    def access(cls, also=()):
        out = {"class": cls, "label": text(f"access.{cls}", access_label[cls]), "levels": list(levels[cls])}
        if also:
            out["also"] = [access(x) for x in also]
        return out

    kinds = []
    lbl = lambda code, value: text(f"kind.{code}", value)
    # Домен, сервер, папка
    D, P, C = S["Domain"]["properties"], S["DomainPatch"]["properties"], S["DomainCreate"]["properties"]
    kinds.append({"kind": "domain", "label": lbl("domain", labels["kind"]["domain"]), "icon": "domain", "parents": [None], "implements": ["vms.domain/1"],
                  "capabilities": ["create", "rename", "delete"],
                  "schema": {"type": "object", "additionalProperties": False, "properties": plain_props(["license"], D, P, C, S, labels)}})
    D, P, C = S["Server"]["properties"], S["ServerPatch"]["properties"], S["ServerCreate"]["properties"]
    kinds.append({"kind": "server", "label": lbl("server", labels["kind"]["server"]), "icon": "server", "parents": [None], "implements": ["vms.server/1"],
                  "capabilities": ["create", "rename", "move"],
                  "schema": {"type": "object", "additionalProperties": False, "required": ["ip", "port"],
                             "properties": plain_props(["ip", "port", "role", "netmask", "gateway", "dns", "labels", "allocated"], D, P, C, S, labels)},
                  # Опрос адресов (бывший POST /servers/probe): опрашивает сервер, которому команда дана, или система — командой
                  # вида без объекта (scope kind), когда серверов в домене ещё нет
                  "actions": [{"id": "probe", "label": text("action.server.probe", "Опросить адреса"), "execution": "instant", "scope": ["unit", "kind"],
                               "params": conv(S["ProbeRequest"], S),
                               "result": {"type": "object", "additionalProperties": False, "required": ["items"],
                                          "properties": {"items": {"type": "array", "items": conv(S["ProbeResult"], S)}}}}]})
    kinds.append({"kind": "folder", "label": lbl("folder", "Папка"), "icon": "folder", "parents": [None, "folder"], "implements": ["vms.folder/1"],
                  "capabilities": ["create", "rename", "delete"], "schema": {"type": "object", "additionalProperties": False, "properties": {}}})
    # Хранилища — вид на каждый вид из reference.archiveKinds
    archive_kinds = []
    for spec_k in ref["archiveKinds"]:
        code = f"archive.{spec_k['kind']}"
        archive_kinds.append(code)
        kinds.append({"kind": code, "label": lbl(code, f"Хранилище: {labels['archive'][spec_k['kind']].lower()}"), "icon": "archive",
                      "parents": ["server"] if spec_k["serverRequired"] else [None, "server"], "implements": ["vms.archive/1"],
                      "capabilities": ["create", "rename", "delete"], "access": access(ARCHIVE_ACCESS),
                      "schema": archive_kind(spec_k, S, ref, labels),
                      **({"actions": [archive_check(S)]} if spec_k["check"] else {}),
                      # Свойства вида хранилища, которые сейчас в reference.archiveKinds: их читают камера (режимы записи) и мастер
                      "x-archive": {k: copy.deepcopy(v) for k, v in spec_k.items() if k != "kind"}})
    # Том — один вид на все адреса хранилищ
    D, P, C = S["Volume"]["properties"], S["VolumePatch"]["properties"], S["VolumeCreate"]["properties"]
    vfields = ["disk", "sizeBytes", "state", "mode", "dir", "file", "login", "password", "bucket", "region", "path", "keyId", "secret",
               "host", "port", "proto", "endpoint", "style", "account", "enabled"]
    vprops = plain_props(vfields, D, P, C, S, labels, writable=set(P) - {"confirmShrinkBytes"}, secrets=VOLUME_SECRETS)
    # Подтверждение уменьшения: пишется в правке рядом с sizeBytes, не хранится (x-transient)
    vprops["confirmShrinkBytes"] = dict(conv(P["confirmShrinkBytes"], S), **{"x-transient": True})
    vprops["state"]["enum"] = list(ref["volumeStates"])
    vprops["state"]["x-enum-labels"] = {v: text(f"enum.state.{v}", labels["enum"]["state"][v]) for v in ref["volumeStates"] if v in labels["enum"]["state"]}
    vprops["state"] = ordered(vprops["state"])
    kinds.append({"kind": "volume", "label": lbl("volume", labels["kind"]["vol"]), "icon": "vol", "parents": list(archive_kinds), "implements": ["vms.volume/1"],
                  "capabilities": ["create", "rename", "enable", "delete"],
                  "schema": {"type": "object", "additionalProperties": False, "required": ["disk", "sizeBytes"], "properties": vprops},
                  # Форматирование (бывший POST /volumes/{id}/format): долгое, по часам сервера; записи стираются
                  "actions": [{"id": "format", "label": text("action.volume.format", "Форматировать"), "execution": "longRunning",
                               "confirm": {"text": text("action.volume.format.confirm", "Всё, что на диске есть, пропадёт, записи этого тома — тоже")}}]})
    # Устройства — вид на каждое значение DeviceType
    by_type = {}
    for d in base["devices"]:
        by_type.setdefault(d["type"], []).append(d)
    device_kinds = {}
    groups = {}
    for g in ref["deviceKinds"]:
        for t in g["types"]:
            code, _, sub = t.partition("-")
            groups.setdefault(code, []).append(dict({"group": g["group"], "view": g["view"]}, **({"subtype": sub} if sub else {})))
    for t in S["DeviceType"]["enum"]:
        props = device_kind_schema(t, by_type.get(t, []), caps, S, labels)
        found, unit_t = t in caps["foundDeviceTypes"], t in caps["unitTypes"]
        writable = [n for n, s in props.items() if not s.get("readOnly") and not s.get("x-immutable")]
        listed = caps["writableFields"].get(t)
        cap = (["create"] if DEVICE_CREATE_PARENTS.get(t) else []) + (["rename"] if listed is None or "name" in listed else [])
        if "enabled" in writable:
            cap.append("enable")
        if not found or unit_t:
            cap.append("delete")
        if not found and not unit_t:
            cap.append("folders")
        if writable:
            cap.append("bulkSet")
        k = {"kind": t, "label": lbl(t, labels["kind"][t]), "icon": t, "parents": list(DEVICE_PARENTS[t]), "implements": list(IMPLEMENTS.get(t, [])),
             "capabilities": cap}
        if rule_actions(t, S, ref):
            k["actions"] = rule_actions(t, S, ref)
        if rule_events(t, ref, labels):
            k["events"] = rule_events(t, ref, labels)
        if t in API_RIGHTS:
            k["apiRights"] = copy.deepcopy(API_RIGHTS[t])
        if t in DEVICE_CREATE_PARENTS:
            k["createParents"] = list(DEVICE_CREATE_PARENTS[t])
        if t in labels["plural"] and labels["plural"][t] != labels["kind"][t]:
            k["labelPlural"] = text(f"kind.{t}.plural", labels["plural"][t])
        if t in DYNAMIC_CREATE:
            k["dynamicCreate"] = True
        if t in ACCESS:
            k["access"] = access(ACCESS[t], ACCESS_ALSO.get(t, ()))
        k["schema"] = {"type": "object", "additionalProperties": False, "properties": props}
        if t in groups:
            # reference.deviceKinds: группа мастера добавления и раздел, где вид показывается
            k["x-ui-category"] = groups[t]
        device_kinds[t] = k
        kinds.append(k)
    # Поток камеры
    D, P, C = S["DeviceStream"]["properties"], S["StreamPatch"]["properties"], S["StreamCreate"]["properties"]
    sprops = {"streamId": ordered(dict(conv(D["id"], S), readOnly=True, **{"x-label": text("field.streamId", PROP_LABELS["streamId"])}))}
    sprops.update(plain_props(["res", "fps", "codec", "width", "height", "resOptions"], D, P, C, S, labels))
    kinds.append({"kind": "stream", "label": lbl("stream", "Поток"), "icon": "stream", "parents": ["camera"], "implements": ["vms.stream/1"],
                  "capabilities": ["create", "rename", "delete"], "access": access("cam"),
                  "schema": {"type": "object", "additionalProperties": False, "properties": sprops}})
    # Незнакомые виды
    kinds += plugin_kinds("vms.camera/1")
    kinds += [unknown_kind(), perunit_kind(), rows_kind(), shared_kind()]
    # Создаёт оператор там же, где вид живёт, — у всех с capability create, кроме устройств (у них — DEVICE_CREATE_PARENTS)
    for k in kinds:
        if "create" in k.get("capabilities", []) and "createParents" not in k:
            k["createParents"] = list(k["parents"])
    # Дети — обратное parents
    for k in kinds:
        kids = [c["kind"] for c in kinds if k["kind"] in c["parents"]]
        if kids:
            k["children"] = kids
    kinds = [kind_order(k) for k in kinds]

    # ===== Объекты =====
    units = units_from_tables(base)
    units += unknown_units(base, units)
    # Что правится у объекта (Unit.writable) — там, где справочник базы (capabilities.writableFields) уже, чем схема вида: у
    # встроенного хранилища схема несёт recordMode и sizeBytes ради карты камеры w2c, правятся они только у неё; у выведенного
    # регистратора — ничего. Своё writableFields записи (карта камеры) уже перенесено
    kind_by = {k["kind"]: k for k in kinds}
    for u in units:
        listed = caps["writableFields"].get(u["kind"])
        if "writable" in u or u["kind"] not in kind_by:
            continue
        if (u.get("status") or {}).get("observed", {}).get("derived"):
            u["writable"] = []
            continue
        if listed is None:
            continue
        k = kind_by[u["kind"]]
        free = {n for n, s in k["schema"]["properties"].items() if not (s.get("readOnly") or s.get("x-immutable") or s.get("x-transient"))}
        if "rename" in k.get("capabilities", []):
            free.add("name")
        if free - set(listed):
            u["writable"] = [n for n in listed if n in free]

    # Профили
    profiles = []
    kind_props = {k["kind"]: k["schema"]["properties"] for k in kinds}
    observed_of = {}
    for u in units:
        observed_of.setdefault(u["kind"], set()).update((u.get("status") or {}).get("observed", {}))
    for pid, label, apis in PROFILES:
        impl = [k["kind"] for k in kinds if pid in k.get("implements", [])]
        p = {"id": pid, "label": text(f"profile.{pid}", label)}
        if pid in CAPABILITY_PROPS:
            p["properties"] = list(CAPABILITY_PROPS[pid])
        else:
            if pid == "vms.camera/1":
                present = {k for u in units if u["kind"] == "camera" for k in u["properties"]}
                p["properties"] = sorted(present | set(CAMERA_PROFILE_EXTRA))
            else:
                p["properties"] = sorted(set.intersection(*(set(kind_props[k]) for k in impl)) if impl else set())
            st = set().union(*(observed_of.get(k, set()) for k in impl)) if impl else set()
            st |= set(STATUS_EXTRA.get(pid, []))
            st -= {"derived"}
            if st:
                p["status"] = sorted(st)
        if pid in PROFILE_EXTRA:
            p["properties"] = sorted(set(p["properties"]) | set(PROFILE_EXTRA[pid]))
        if apis:
            p["apis"] = list(apis)
        profiles.append(p)

    # Набор: новые разделы после шапки вместо старых
    out = {}
    for key, value in base.items():
        if key == "domains":
            out["kinds"], out["profiles"], out["units"] = kinds, profiles, units
        if key in OLD_TABLES:
            continue
        if key == "rules":
            value = [rule_content(r) for r in value]
        elif key == "ruleVersions":
            value = [dict(v, rule=rule_content(v["rule"])) for v in value]
        elif key == "ruleFires":
            value = [rule_fire(f) for f in value]
        elif key == "access":
            value = access_section(value, ref["access"]["defaults"])
        out[key] = value
    # Что умеет система: операции базы и выполненные операции ядра — в порядке контракта
    reference = rule_reference(base["reference"])
    have = set(reference["capabilities"]["operations"]) | set(CORE_DONE)
    reference["capabilities"]["operations"] = [o for o in ops if o in have]
    out["reference"] = reference
    out["$comment"] = (
        "Эталонный набор универсальной модели (api-generic): kinds — описания видов, profiles — профили, units — объекты склада "
        "(uid = id записи базы) вместо разделов domains, servers, devices, folders, archives, volumes. Собран tools/generic_fixture.py "
        "из api/fixtures/demo.json. Остальное — как в базе: " + base["$comment"]
    )
    return out


def kind_order(k):
    first = ("kind", "origin", "label", "labelPlural", "labelCount", "icon", "parents", "createParents", "children", "dynamicCreate", "implements", "capabilities",
             "access", "apiRights", "shape", "schemaPerUnit", "schema", "actions", "events", "setupUi")
    return {key: k[key] for key in first if key in k} | {key: v for key, v in k.items() if key not in first}


def unknown_units(base, units):
    """Объекты незнакомых видов: все в первом домене."""
    dom = base["domains"][0]["id"]
    cams = [d["id"] for d in base["devices"] if d["type"] == "camera" and d["domainId"] == dom and not d["parentId"]]
    folder = next(f["id"] for f in base["folders"] if f["domainId"] == dom and f["deviceIds"])
    last = max(int(d["id"][1:8]) for d in base["devices"])
    seq = iter(range(last + 1, last + 100))
    nid = lambda: f"3{next(seq):07d}-0000-4000-8000-000000000000"
    ctrl1, ctrl2 = nid(), nid()
    out = [
        unit(ctrl1, "security_controller/CONTROLLER", None, dom, "Контроллер охраны — вход", "1",
             {"ip_address": "192.168.1.90", "cameras": cams[:2], "primary_camera": cams[0], "secondary_camera": cams[1], "mode": "auto", "enum_tags": ["cam", "sensor"]},
             {"link": "online", "observed": {"armed": False}}, [folder]),
        unit(nid(), "security_controller/SENSOR", ctrl1, dom, "Датчик двери", "1", {"zone": "Периметр"}, {"link": "online"}),
        unit(nid(), "security_controller/SENSOR", ctrl1, dom, "Датчик окна", "1", {"zone": "Склад"}, {"link": "online"}),
        unit(ctrl2, "security_controller/CONTROLLER", None, dom, "Контроллер охраны — склад", "1",
             {"ip_address": "192.168.1.91", "cameras": [], "primary_camera": None, "secondary_camera": None, "mode": "manual", "enum_tags": ["reader"]},
             {"link": "offline", "observed": {"armed": True}}),
        unit(nid(), "security_controller/SENSOR", ctrl2, dom, "Датчик ворот", "1", {"zone": "Ворота"}, {"link": "offline"}),
    ]
    t1 = nid()
    out += [
        unit(t1, "test.unknown", None, dom, "Незнакомый объект 1", "1",
             {"title": "Пульт охраны", "serial": "TU-0001", "notes": "Строка\nвторая строка", "comment": None, "active": True, "mode": "manual",
              "tags": ["a", "c"], "host": "192.168.1.95", "port": 8080, "threshold": 42.5, "count": 4, "camera": cams[0], "cameras": cams[:3],
              "scheduleId": base["schedules"][0]["id"], "firmwareFile": "tu-2.1.bin", "priority": 3,
              "zone": [[0.1, 0.1], [0.9, 0.1], [0.5, 0.9]], "line": [[0.2, 0.5], [0.8, 0.5]], "spot": [0.5, 0.5], "mask": "AAAA",
              "hologram": {"layers": 3}, "debug": False, "firmwareVersion": "2.1.0"},
             {"link": "online", "observed": {"triggered": False}}, [folder], {"secret": True}),
        unit(nid(), "test.unknown", t1, dom, "Незнакомый объект 2", "1", {"title": "Выносной блок", "mode": "auto", "site": "Двор"}, {"link": "offline"}),
        unit(nid(), "test.perunit", None, dom, "Модуль ТП-100", "1", {"model": "tp-100", "channels": 4, "resolution": "1920x1080"}, {"link": "online"}),
        unit(nid(), "test.perunit", None, dom, "Модуль ТП-200", "1", {"model": "tp-200", "channels": 16, "resolution": "3840x2160"}, {"link": "online"}),
        unit(nid(), "w2c.example/rows", cams[0], dom, "Строка 1", "1", {"slot": 1, "channelType": "io", "enabled": True, "note": "Вход двери"}),
        unit(nid(), "w2c.example/rows", cams[0], dom, "Строка 2", "1", {"slot": 2, "channelType": "audio", "enabled": False}),
        unit(nid(), "domain.shared", None, dom, "Общие настройки домена", "1", {"test.unknown": {"site": "Офис на Тверской"}}),
    ]
    return out


def render(fx):
    return json.dumps(fx, ensure_ascii=False, indent=1) + "\n"


def main():
    if API == "api":
        sys.exit("Набор базы api/ не трогаем: --api — папка копии (api-generic)")
    base = json.loads(read(BASE_FIXTURE))
    spec = json.loads(read(BASE_SPEC))
    page = read(BASE_PAGE)
    generic = json.loads(read(SPEC))
    ops = [o["operationId"] for item in generic["paths"].values() for m, o in item.items()
           if m in ("get", "post", "put", "patch", "delete") and "test-support" not in o.get("tags", [])]
    text_out = render(build(base, spec["components"]["schemas"], page, ops))
    path = os.path.join(ROOT, OUT)
    if "--check" in sys.argv[1:]:
        with open(path, encoding="utf-8") as f:
            if f.read() == text_out:
                return 0
        print(f"{OUT} отстал от {BASE_FIXTURE}\nСоберите: python3 tools/generic_fixture.py")
        return 1
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text_out)
    print(f"{OUT} ← {BASE_FIXTURE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
