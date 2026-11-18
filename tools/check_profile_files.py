#!/usr/bin/env python3
"""Самопроверка модуля файлов профиля (tools/profile_files.py): разбор версий, формат одного файла,
запись профиля для GET /kinds, тип словами и таблица для людей.

Каждая порча — копия образца GOOD с одной правкой. Запуск из корня репозитория:
  python3 tools/check_profile_files.py
Код выхода 1, если хоть одна проверка не прошла.
"""
import copy
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from profile_files import (load_profiles, major_of, parse_version, profile_name, profile_problems,  # noqa: E402
                           profile_wire, render_md, type_text)

failed = 0


def ok(cond, what):
    global failed
    print(("PASS " if cond else "FAIL ") + what)
    if not cond:
        failed += 1


def raises(exc, fn, *args):
    try:
        fn(*args)
    except exc:
        return True
    return False


def says(problems, word):
    return any(word in p for p in problems)


GOOD = {
    "id": "vms.camera/1", "version": "1.5", "label": "Камера", "owner": "mockup", "reviewers": ["w2c"],
    "uses": [{"id": "vms.archive/1", "version": "1.0"}],
    "properties": {
        "archiveId": {"schema": {"type": ["string", "null"], "x-ref": {"implements": ["vms.archive/1"]}},
                      "meaning": "Архив, в который камера пишет видео.", "since": "1.0"},
        "privacyMasks": {"schema": {"type": "array", "maxItems": 16, "items": {"type": "object"}},
                         "meaning": "Маски приватности: до 16 зон.", "since": "1.3"},
    },
    "status": {"recordState": {"schema": {"type": "string", "enum": ["off", "on"]},
                               "meaning": "Идёт ли запись.", "since": "1.0"}},
    "apis": ["recording-target", "recording-days"],
    "changes": [{"version": "1.5", "what": "Описание поля archiveId уточнено."},
                {"version": "1.3", "what": "Добавлено поле privacyMasks."},
                {"version": "1.0", "what": "Профиль перенесён в файл."}],
    "_file": "vms.camera.json",
}


def bad(**kw):
    d = copy.deepcopy(GOOD)
    d.update(kw)
    return d


def bad_prop(name, **kw):
    d = copy.deepcopy(GOOD)
    d["properties"][name].update(kw)
    return d


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

# добавлено сверх плана (Н12, Н13 и пробелы плана)
no_owner = copy.deepcopy(GOOD)
del no_owner["owner"]
ok(says(profile_problems(no_owner), "owner"), "нет обязательного ключа")
ok(says(profile_problems(bad(id="vms.camera")), "id"), "id без старшей версии")
ok(says(profile_problems(bad(reviewers=[])), "reviewers"), "пустой список проверяющих")
ok(says(profile_problems(bad(changes=[{"version": "1.3", "what": "a"}, {"version": "1.5", "what": "b"}])), "убыв"), "changes не по убыванию")
ok(says(profile_problems(bad(uses=GOOD["uses"] * 2)), "повтор"), "uses с повтором")
ok(says(profile_problems(bad(apis=["a", "a"])), "повтор"), "apis с повтором")
ok(says(profile_problems(bad_prop("archiveId", schema={"x": 1})), "schema"), "schema без type")
with_removed = bad(changes=[{"version": "1.5", "what": "Поле снято.", "removed": ["oldField"]}] + GOOD["changes"][1:])
ok(profile_problems(with_removed) == [], "строка changes с removed проходит")
ok(says(profile_problems(bad(changes=[{"version": "1.5", "what": "x", "removed": "a"}] + GOOD["changes"][1:])), "removed"), "removed не списком — ошибка")

w = profile_wire(GOOD)
ok(w == {"id": "vms.camera/1", "label": {"key": "profile.vms.camera/1", "text": "Камера", "lang": "ru"}, "version": "1.5",
         "uses": [{"id": "vms.archive/1", "version": "1.0"}], "properties": ["archiveId", "privacyMasks"],
         "status": ["recordState"], "apis": ["recording-target", "recording-days"]}, "запись GET /kinds")
ok("uses" not in profile_wire(bad(uses=[])) and "status" not in profile_wire(bad(status={})), "пустые uses и status не выводятся")
ok("apis" not in profile_wire({k: v for k, v in GOOD.items() if k != "apis"}), "без apis поле не выводится")

ok(type_text({"type": ["string", "null"], "x-ref": {"implements": ["vms.archive/1"]}}) == "string | null — uid (`vms.archive/1`)", "тип ссылки")
ok(type_text({"type": "array", "items": {"type": "string"}}) == "массив string", "массив")
ok(type_text({"type": "string", "enum": ["a", "b"]}) == "string: `a`, `b`", "перечень")
ok(type_text({"type": "boolean", "readOnly": True}) == "boolean (только чтение)", "только чтение")
ok(type_text({"type": "string", "writeOnly": True}) == "string (секрет)", "секрет")
ok(type_text({"type": "array", "maxItems": 16, "items": {"type": "object"}}) == "массив object, до 16", "массив с maxItems")
ok(type_text({"type": "string", "x-ref": {"kinds": ["camera"]}}) == "string — uid (camera)", "ссылка на вид")

md = render_md(GOOD, ["camera"])
ok(md.startswith("<!-- Собрано tools/build_api.py из api/profiles/vms.camera.json — руками не править -->\n# `vms.camera/1` — Камера\n"), "шапка таблицы")
ok("| `privacyMasks` |" in md and "| 1.3 |" in md and "## Состояние (`status.observed`)" in md and "## Изменения" in md, "разделы таблицы")
ok("Версия 1.5 · ведёт: mockup · смотрят правку: w2c" in md, "строка версии и хозяина")
ok("Использует: `vms.archive/1` с 1.0" in md, "строка зависимостей")
ok("Виды эталонного набора: `camera`. Предметные пути: `/units/{uid}/recording-target`, `/units/{uid}/recording-days`" in md, "виды и пути")
md2 = render_md(bad(uses=[], status={}, apis=[]), ["camera"])
ok("Использует: —" in md2 and "Своих свойств нет." in md2 and "Предметные пути" not in md2, "пустые разделы")

with tempfile.TemporaryDirectory() as d:
    os.makedirs(os.path.join(d, "profiles"))
    for name, data in (("vms.b.json", {"id": "vms.b/1"}), ("vms.a.json", {"id": "vms.a/1"})):
        with open(os.path.join(d, "profiles", name), "w", encoding="utf-8") as f:
            json.dump(data, f)
    with open(os.path.join(d, "profiles", "README.md"), "w", encoding="utf-8") as f:
        f.write("не профиль")
    docs = load_profiles(d)
    ok([x["_file"] for x in docs] == ["vms.a.json", "vms.b.json"] and docs[0]["id"] == "vms.a/1", "load_profiles: по имени файла, _file проставлен, README пропущен")
    with open(os.path.join(d, "profiles", "vms.c.json"), "w", encoding="utf-8") as f:
        f.write("{")
    try:
        load_profiles(d)
        named = False
    except ValueError as e:
        named = "vms.c.json" in str(e)
    ok(named, "load_profiles: сломанный JSON — ValueError с именем файла")
    ok(load_profiles(os.path.join(d, "nope")) == [], "load_profiles: нет папки — пустой список")

print(f"RESULT {'fail' if failed else 'pass'}")
sys.exit(1 if failed else 0)
