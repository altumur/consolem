#!/usr/bin/env python3
"""Проверка модуля слоёв контракта (tools/layers.py): ловит ли он нарушения границы «механизм или
подсистема» и верно ли называет слой, владельца и проверяющих.

Каждый случай берёт копию живого api/openapi.json, делает в ней одну правку и вызывает
layers.static_problems. Так проверка видит и отказ там, где граница нарушена, и тишину там, где
правка законна. Отдельные строки проверяют функции, на которые опираются другие проверки
(layer_of_schema, layer_of_path, profile_ids, profile_file, owner_of, reviewers_of, leak_marks).

Запуск из корня репозитория, после правки tools/layers.py:
  python3 tools/check_layers.py
Код выхода 1, если хоть одна проверка не прошла.
"""
import copy
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import layers  # noqa: E402

failed = 0


def ok(cond, what):
    global failed
    print(("PASS " if cond else "FAIL ") + what)
    if not cond:
        failed += 1


def skip(what):
    print("SKIP " + what)


with open(os.path.join(ROOT, "api", "openapi.json"), encoding="utf-8") as f:
    SPEC = json.load(f)
IDS = layers.profile_ids()
POS = "vms.pos/1"
POS_PATH = "/units/{uid}/pos/raw"


def base():
    """Свежая копия контракта, где схемы и путь vms.pos/1 помечены (если разметка ещё не стоит)."""
    s = copy.deepcopy(SPEC)
    sch = s["components"]["schemas"]
    for name in ("PosRawLine", "PosRawLines"):
        sch[name].setdefault("x-layer", POS)
    s["paths"][POS_PATH].setdefault("x-layer", POS)
    return s


def problems(s):
    return layers.static_problems(s, IDS)


def node_at(s, path):
    """Узел схемы по пути записи check_api.schema_removed: Схема.поле.подполе, [] — items, {} — additionalProperties, |N — вариант."""
    name, rest = re.match(r"^([^.\[{|]+)(.*)$", path).groups()
    node = s["components"]["schemas"][name]
    for tok in re.findall(r"\[\]|\{\}|\|\d+|\.[^.\[{|]+", rest):
        if tok == "[]":
            node = node["items"]
        elif tok == "{}":
            node = node["additionalProperties"]
        elif tok[0] == "|":
            node = next(node[k][int(tok[1:])] for k in ("anyOf", "oneOf", "allOf") if k in node)
        else:
            node = node["properties"][tok[1:]]
    return node


def drop_mark(s, path):
    del node_at(s, path)["x-layer"]


# ── живой контракт ──
ok(problems(SPEC) == [], "живой контракт: граница цела")
ok(problems(base()) == [], "base(): контракт с разметкой vms.pos/1 цел")

# ── функции интерфейса ──
ok(layers.layer_of_schema(SPEC, "Unit") is None, "layer_of_schema: у схемы механизма слоя нет")
ok(layers.layer_of_schema(SPEC, "PosRawLines") == POS, "layer_of_schema: схема vms.pos/1")
ok(layers.layer_of_schema(SPEC, "Нет такой") is None, "layer_of_schema: схемы нет — None")
ok(layers.layer_of_path(SPEC, "/units") is None, "layer_of_path: у пути механизма слоя нет")
ok(layers.layer_of_path(SPEC, POS_PATH) == POS, "layer_of_path: путь vms.pos/1")
ok(layers.layer_of_path(SPEC, "/нет/такого") is None, "layer_of_path: пути нет — None")
ok("vms.camera/1" in layers.profile_ids(), "profile_ids: профиль из demo.json")
ok(set(layers.LAYER_EXTRA) == {"video", "vms"} and not (set(layers.LAYER_EXTRA) & layers.profile_ids()), "LAYER_EXTRA: video и vms — не профили")
ok(layers.profile_file("vms.camera/1") == "api/profiles/vms.camera.json", "profile_file: vms.camera/1")
ok(layers.profile_file("vms.camera/1", "x/api") == "x/api/profiles/vms.camera.json", "profile_file: свой каталог API")
ok(layers.owner_of("vms.nope/1") == layers.DEFAULT_OWNER == "mockup", "owner_of: файла профиля нет — mockup")
ok(layers.reviewers_of("vms.nope/1") == layers.DEFAULT_REVIEWERS == ["w2c"], "reviewers_of: файла профиля нет — w2c")
ok(layers.reviewers_of("vms.nope/1") is not layers.DEFAULT_REVIEWERS, "reviewers_of: отдаёт копию, а не общий список")
ok(layers.owner_of("vms.camera/1") == "mockup" and layers.reviewers_of("vms.camera/1") == ["w2c"], "owner_of, reviewers_of: файл api/profiles/vms.camera.json — берутся из него")
marks = layers.leak_marks(SPEC)
ok(isinstance(marks, dict) and set(marks) == set(layers.KNOWN_LEAKS), "leak_marks: пометки полей живого контракта = KNOWN_LEAKS")
s = base()
s["components"]["schemas"]["Unit"]["properties"]["posRaw"] = {"type": "string", "x-layer": POS}
ok(layers.leak_marks(s).get("Unit.posRaw") == POS, "leak_marks: пометка поля — путь Схема.поле")
s = base()
s["components"]["schemas"]["Unit"]["properties"]["tags"] = {"type": "array", "items": {"type": "string", "x-layer": POS}}
ok(layers.leak_marks(s).get("Unit.tags[]") == POS, "leak_marks: элемент массива — []")
s = base()
s["components"]["schemas"]["Unit"]["properties"]["tags"] = {"type": "object", "additionalProperties": {"type": "string", "x-layer": POS}}
ok(layers.leak_marks(s).get("Unit.tags{}") == POS, "leak_marks: additionalProperties — {}")
s = base()
s["components"]["schemas"]["Unit"]["properties"]["tags"] = {"anyOf": [{"type": "null"}, {"type": "string", "x-layer": POS}]}
ok(layers.leak_marks(s).get("Unit.tags|1") == POS, "leak_marks: вариант anyOf — |N")
ok("PosRawLines" not in "".join(layers.leak_marks(base())), "leak_marks: помеченная схема целиком — не пометка поля")

# ── S2: значение ──
s = base()
s["components"]["schemas"]["PosRawLine"]["x-layer"] = "vms.nope/1"
ok(any("vms.nope/1" in p and "PosRawLine" in p for p in problems(s)), "S2: незнакомый слой")
for extra in layers.LAYER_EXTRA:
    s = base()
    s["components"]["schemas"]["PosRawLine"]["x-layer"] = extra
    ok(not any("PosRawLine:" in p for p in problems(s)), f"S2: слой {extra} разрешён")
s = base()
s["paths"][POS_PATH]["x-layer"] = "vms.nope/1"
ok(any("vms.nope/1" in p and POS_PATH in p for p in problems(s)), "S2: незнакомый слой у пути")

# ── S1: где стоит пометка ──
s = base()
s["paths"]["/units"]["get"]["x-layer"] = "vms"
ok(any("/units" in p and "x-layer только" in p for p in problems(s)), "S1: x-layer в операции")
s = base()
s["paths"]["/units"]["get"]["parameters"][0]["x-layer"] = "vms"
ok(any("/units" in p and "x-layer только" in p for p in problems(s)), "S1: x-layer в параметре")
s = base()
s["components"]["schemas"]["PosRawLines"]["properties"]["items"]["x-layer"] = POS
ok(any("PosRawLines" in p and "x-layer только" in p for p in problems(s)), "S1: вложенная пометка в помеченной схеме")
s = base()
s["paths"][POS_PATH]["get"]["x-layer"] = POS
ok(any(POS_PATH in p and "x-layer только" in p for p in problems(s)), "S1: x-layer в операции помеченного пути")
s = base()
s["components"]["schemas"]["Unit"]["properties"]["a"] = {"type": "object", "x-layer": POS, "properties": {"b": {"type": "string", "x-layer": POS}}}
ok(any("Unit.properties.a.properties.b" in p and "x-layer только" in p for p in problems(s)), "S1: пометка внутри помеченного поля")

# ── S3: механизм не ссылается на подсистему ──
s = base()
s["components"]["schemas"]["Unit"]["properties"]["posRaw"] = {"$ref": "#/components/schemas/PosRawLines"}
ok(any("Unit.posRaw" in p and "PosRawLines" in p for p in problems(s)), "S3: ссылка механизма на подсистему")
s = base()
s["components"]["schemas"]["Unit"]["properties"]["posRaw"] = {"type": "array", "items": {"$ref": "#/components/schemas/PosRawLine"}}
ok(any("Unit.posRaw[]" in p and "PosRawLine" in p for p in problems(s)), "S3: ссылка из элемента массива")
s = base()
s["paths"]["/units"]["get"]["responses"]["200"]["content"]["application/json"]["schema"] = {"$ref": "#/components/schemas/PosRawLines"}
ok(any("/units" in p and "PosRawLines" in p and "ссылается" in p for p in problems(s)), "S3: путь механизма ссылается на подсистему")

# ── S4: пометка поля и KNOWN_LEAKS ──
s = base()
s["components"]["schemas"]["Unit"]["properties"]["posRaw"] = {"$ref": "#/components/schemas/PosRawLines", "x-layer": POS}
ok(any("Unit.posRaw" in p and "KNOWN_LEAKS" in p for p in problems(s)), "S4: новое поле подсистемы")
ok(not any("ссылается на схему подсистемы" in p and "Unit.posRaw" in p for p in problems(s)), "S4: помеченное поле S3 не пропускает дважды")

# ── S4: устаревшая строка KNOWN_LEAKS ──
saved_leaks = dict(layers.KNOWN_LEAKS)
try:
    layers.KNOWN_LEAKS["Unit.нет.такого"] = "часть 04"
    ok(any("Unit.нет.такого" in p and "убери из KNOWN_LEAKS" in p for p in problems(base())), "S4: строка KNOWN_LEAKS без пометки")
finally:
    layers.KNOWN_LEAKS.clear()
    layers.KNOWN_LEAKS.update(saved_leaks)
if layers.KNOWN_LEAKS:
    first = sorted(layers.KNOWN_LEAKS)[0]
    s = base()
    drop_mark(s, first)
    ok(any(first in p and "убери из KNOWN_LEAKS" in p for p in problems(s)), f"S4: пометку {first} сняли, а KNOWN_LEAKS помнит")
else:
    skip("S4: устаревшая строка KNOWN_LEAKS — KNOWN_LEAKS пуст")

# ── S5: id профиля в описании общего поля ──
s = base()
s["components"]["schemas"]["Unit"]["properties"]["foo"] = {"type": "string", "description": "Поле vms.camera/1"}
ok(any("Unit.foo" in p and "vms.camera/1" in p for p in problems(s)), "S5: профиль в описании")
s = base()
s["components"]["schemas"]["Unit"]["properties"]["foo"] = {"type": "string", "description": "Поле vms.camera/1", "x-layer": "vms.camera/1"}
ok(not any("в описании" in p and "Unit.foo" in p for p in problems(s)), "S5: помеченное поле описание не проверяет")
saved_ex = dict(layers.EXAMPLE_MENTIONS)
try:
    s = base()
    s["components"]["schemas"]["Unit"]["properties"]["foo"] = {"type": "string", "description": "Например vms.camera/1"}
    layers.EXAMPLE_MENTIONS["Unit.foo"] = "пример"
    ok(not any("в описании" in p and "Unit.foo" in p for p in problems(s)), "S5: пример из EXAMPLE_MENTIONS")
    ok(any("Unit.foo" in p and "EXAMPLE_MENTIONS" in p for p in problems(base())), "S5: строка EXAMPLE_MENTIONS без упоминания")
finally:
    layers.EXAMPLE_MENTIONS.clear()
    layers.EXAMPLE_MENTIONS.update(saved_ex)

# ── законно ──
s = base()
s["components"]["schemas"]["PosRawLines"]["properties"]["unit"] = {"$ref": "#/components/schemas/Unit"}
ok(problems(s) == problems(base()), "помеченная схема ссылается на механизм — можно")
s = base()
s["paths"][POS_PATH]["get"]["responses"]["200"]["description"] = "vms.camera/1 в описании пути — это не поле схемы"
ok(problems(s) == problems(base()), "описание операции S5 не трогает")

# ── не строка в x-layer ──
s = base()
s["components"]["schemas"]["PosRawLine"]["x-layer"] = ["vms"]
try:
    got = problems(s)
except TypeError as e:
    got = [f"TypeError {e}"]
ok(any("PosRawLine" in p and "x-layer" in p and "нет такого профиля" in p for p in got), "S2: x-layer не строка — отказ, а не исключение")
s = base()
s["paths"]["/units"]["get"]["x-layer"] = ["vms"]
ok(any("/units" in p and "x-layer только" in p for p in problems(s)), "S1: x-layer не строка в операции")
s = base()
s["components"]["schemas"]["Unit"]["properties"]["x-layer"] = {"type": "string"}
ok(problems(s) == problems(base()), "поле с именем x-layer — не пометка")

# ── сломанный файл профиля ──
import tempfile
with tempfile.TemporaryDirectory() as tmp:
    os.makedirs(os.path.join(tmp, "profiles"))
    with open(os.path.join(tmp, "profiles", "vms.test.json"), "w", encoding="utf-8") as f:
        f.write("{ не json")
    for what, fn in (("profile_ids", lambda: layers.profile_ids(tmp)), ("owner_of", lambda: layers.owner_of("vms.test/1", tmp)),
                     ("reviewers_of", lambda: layers.reviewers_of("vms.test/1", tmp))):
        try:
            fn()
            raised = False
        except ValueError as e:
            raised = "vms.test.json" in str(e)
        ok(raised, f"{what}: сломанный файл профиля — ValueError с именем файла")
ok(layers.owner_of("vms.nope/1") == "mockup", "owner_of: нет файла — умолчание")

# ── таблица версий по слоям ──
TABLE_FILE = os.path.join(ROOT, "docs", "contract-layers", "versions-by-layer.md")
with open(os.path.join(ROOT, "api", "README.md"), encoding="utf-8") as f:
    README = f.read()
CUR = SPEC["info"]["version"]


def drop_row(table, ver):
    return "\n".join(l for l in table.split("\n") if not l.startswith(f"| {ver} |"))


def set_layer(table, ver, layer):
    out = []
    for l in table.split("\n"):
        if l.startswith(f"| {ver} |"):
            cells = l.split(" | ")
            cells[2] = layer
            l = " | ".join(cells)
        out.append(l)
    return "\n".join(out)


def add_row(table, ver, layer):
    return table.rstrip("\n") + f"\n| {ver} | проба | {layer} | проба |\n"


if not os.path.exists(TABLE_FILE):
    ok(False, "нет файла docs/contract-layers/versions-by-layer.md")
else:
    with open(TABLE_FILE, encoding="utf-8") as f:
        TABLE = f.read()
    vp = layers.versions_table_problems
    ok(vp(README, TABLE, CUR, IDS) == [], "живая таблица версий цела")
    ok(any("0.12.0" in p for p in vp(README, drop_row(TABLE, "0.12.0"), CUR, IDS)), "нет строки версии")
    ok(any("механизмы" in p for p in vp(README, set_layer(TABLE, "0.8.0", "механизмы"), CUR, IDS)), "незнакомое слово в слое")
    ok(any("vms.nope/1" in p for p in vp(README, set_layer(TABLE, "0.5.0", "`vms.nope/1`"), CUR, IDS)), "незнакомый профиль в слое")
    ok(any("9.9.0" in p for p in vp(README, TABLE, "9.9.0", IDS)), "case_current_version_missing")
    ok(any("0.99.0" in p for p in vp(README, add_row(TABLE, "0.99.0", "механизм"), CUR, IDS)), "строка версии, которой нет в README")

# ── слои правки против origin/main ──

import contextlib  # noqa: E402
import io  # noqa: E402
import subprocess  # noqa: E402
import tempfile  # noqa: E402

# временные репозитории лежат не у владельца репозитория проекта: git без этого отказывает («dubious ownership»)
os.environ.update(GIT_CONFIG_COUNT="1", GIT_CONFIG_KEY_0="safe.directory", GIT_CONFIG_VALUE_0="*",
                  GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")
classify, classify_specs, classify_fixture = layers.classify, layers.classify_specs, layers.classify_fixture
changed_files, version_problems = layers.changed_files, layers.version_problems

with open(os.path.join(ROOT, "api", "fixtures", "demo.json"), encoding="utf-8") as f:
    FX = json.load(f)


def write(root, rel, text):
    path = os.path.join(root, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def git(root, *args):
    """git во временном репозитории: без GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE из окружения, без подписи и хуков."""
    env = {k: v for k, v in os.environ.items() if k not in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE")}
    return subprocess.run(["git", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "-C", root, *args],
                          capture_output=True, text=True, check=True, env=env).stdout


def new_repo(root):
    git(root, "init", "-q", "-b", "main")
    write(root, "api/openapi.json", json.dumps(SPEC))
    write(root, "api/fixtures/demo.json", json.dumps(FX))
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "первый")


def add_schema(spec, name):
    s = copy.deepcopy(spec)
    s["components"]["schemas"][name] = {"type": "object", "properties": {"a": {"type": "string"}}}
    return s


def touch_schema(spec, name):
    s = copy.deepcopy(spec)
    s["components"]["schemas"][name].setdefault("properties", {})["zzzProbe"] = {"type": "string"}
    return s


def set_description(spec, name, text):
    s = copy.deepcopy(spec)
    s["components"]["schemas"][name]["description"] = text
    return s


def add_profile_prop(fx, pid, kind, prop):
    f = copy.deepcopy(fx)
    next(p for p in f["profiles"] if p["id"] == pid)["properties"].append(prop)
    next(k for k in f["kinds"] if k["kind"] == kind)["schema"]["properties"][prop] = {"type": "string"}
    return f


def add_kind_prop(fx, kind, prop):
    f = copy.deepcopy(fx)
    next(k for k in f["kinds"] if k["kind"] == kind)["schema"]["properties"][prop] = {"type": "string"}
    return f


def touch_reference(fx, key):
    f = copy.deepcopy(fx)
    v = f["reference"][key]
    if isinstance(v, list):
        v.append("проба")
    else:
        v["zzzProbe"] = 1
    return f


def run_cli(*args):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = layers.main(list(args))
    return code, buf.getvalue()


def git_available():
    try:
        subprocess.run(["git", "--version"], capture_output=True, check=True)
        return True
    except (OSError, subprocess.CalledProcessError):
        return False


if not git_available():
    skip("случаи с временным репозиторием — git не найден")
else:
    with tempfile.TemporaryDirectory() as tmp:
        new_repo(tmp)
        ok(classify(base="no-such-ref", root=tmp) is None, "case_no_git: нет ссылки — None")
        with tempfile.TemporaryDirectory() as bare:
            ok(classify(base="HEAD", root=bare) is None, "case_no_git: нет репозитория — None")
        write(tmp, "api/profiles/vms.test.json", "{}")
        ok("api/profiles/vms.test.json" in (changed_files("HEAD", tmp) or []), "case_untracked: новый файл виден")
        ok("api/profiles/vms.test.json" not in (changed_files("HEAD", tmp, "HEAD") or []), "case_untracked: у коммита head новых файлов нет")
        os.remove(os.path.join(tmp, "api/profiles/vms.test.json"))
        # case_merge_base: ветка up ушла вперёд правкой openapi.json, своя правка — только demo.json
        git(tmp, "branch", "up")
        git(tmp, "checkout", "-q", "up")
        write(tmp, "api/openapi.json", json.dumps(touch_schema(SPEC, "Unit")))
        git(tmp, "commit", "-q", "-am", "чужая правка")
        git(tmp, "checkout", "-q", "main")
        write(tmp, "api/fixtures/demo.json", json.dumps(touch_reference(FX, "deviceModels")))
        git(tmp, "commit", "-q", "-am", "своя правка")
        ok("api/openapi.json" not in changed_files("up", tmp) and "api/fixtures/demo.json" in changed_files("up", tmp),
           "case_merge_base: чужая правка не своя")
        cls = classify("up", tmp)
        ok(cls is not None and cls["mechanism"] == [] and "vms" in cls["layers"], "case_merge_base: слои считаются от общего предка")
        # правка рабочей копии, которой нет в коммитах: новая общая схема без новой версии
        marked = copy.deepcopy(SPEC)
        marked["components"]["schemas"]["Unit"]["x-layer"] = POS
        write(tmp, "api/openapi.json", json.dumps(marked))
        mw = classify("HEAD", tmp)
        ok(mw["marks"] == ["схема Unit"] and mw["notify"].get(layers.OWNER_ADDRESS) == ["пометки"], "x-layer: адресат — владелец контракта, слой «пометки»")
        write(tmp, "api/openapi.json", json.dumps(add_schema(SPEC, "Foo")))
        w = classify("HEAD", tmp)
        ok(w is not None and any("+ схема Foo" in m for m in w["mechanism"]), "рабочая копия: новая общая схема — механизм")
        ok(any("без новой версии" in p for p in version_problems(w, False)), "рабочая копия: V1 без новой версии")
        # I1: правка пути профиля в openapi.json — правка механизма-файла: версия контракта нужна всегда
        git(tmp, "checkout", "-q", "--", "api/openapi.json")
        pp = copy.deepcopy(SPEC)
        pp["paths"][POS_PATH]["get"]["responses"]["418"] = {"description": "проба"}
        write(tmp, "api/openapi.json", json.dumps(pp))
        wp = classify("HEAD", tmp)
        ok(POS in wp["contract_layers"] and wp["file_layers"] == {}, "I1: правка пути профиля — contract_layers, не file_layers")
        ok(any("без новой версии" in p for p in version_problems(wp, False)), "I1: путь профиля без новой версии — V1")
        ok(any("без новой версии" in p for p in version_problems(wp, True)), "I1: V1 и при profiles_active")
        pp["info"]["version"] = "99.0.0"
        write(tmp, "api/openapi.json", json.dumps(pp))
        wp = classify("HEAD", tmp)
        ok(version_problems(wp, True) == [] and version_problems(wp, False) == [], "I1: путь профиля с новой версией — ни V1, ни V2")
        ok(any(POS in who or who == layers.OWNER_ADDRESS or "/" not in who for who in wp["notify"]) and wp["notify"], "I1: уведомление есть")
        git(tmp, "checkout", "-q", "--", "api/openapi.json")
        # решение владельца 2026-11-18: правка server.js без openapi.json — версия не нужна, уведомление владельцу
        git(tmp, "checkout", "-q", "--", "api/openapi.json")
        write(tmp, "api/server.js", "// проба\n")
        ws = classify("HEAD", tmp)
        ok("api/server.js" in ws["mechanism"] and ws["notify"].get(layers.OWNER_ADDRESS) == ["механизм"], "server.js без openapi.json: механизм, уведомление владельцу")
        ok(version_problems(ws, True) == [] and version_problems(ws, False) == [], "server.js без openapi.json: версия не нужна, V1 молчит")
        ok(any("server.js" in n for n in layers.version_notes(ws)), "server.js без openapi.json: строка INFO о том, что версия не менялась")
        os.remove(os.path.join(tmp, "api/server.js"))
        # I2: README.md и не-json в api/profiles/ — не профиль; id берётся из файла
        write(tmp, "api/profiles/README.md", "# профили")
        write(tmp, "api/profiles/notes.txt", "x")
        write(tmp, "api/profiles/vms.zed.json", json.dumps({"id": "vms.zed/2", "owner": "mockup"}))
        wr = classify("HEAD", tmp)
        ok(not any("README" in k or "notes" in k for k in wr["layers"]), "I2: README.md и notes.txt — не профили")
        ok("vms.zed/2" in wr["layers"], "I2: id профиля — из поля id файла")
        write(tmp, "api/profiles/vms.noid.json", json.dumps({"owner": "mockup"}))
        ok("vms.noid/1" in classify("HEAD", tmp)["layers"], "I2: в файле нет id — <имя>/1")
        write(tmp, "api/profiles/vms.bad.json", "{не json")
        try:
            classify("HEAD", tmp)
            bad = False
        except ValueError:
            bad = True  # check_api ловит ValueError и пишет FAIL с именем файла
        ok(bad, "I2: файл профиля не читается — ValueError с именем файла")
        ok(set(wr["file_layers"]) == set(wr["layers"]), "I2: файлы профилей — file_layers")
        for rel in ("README.md", "notes.txt", "vms.zed.json", "vms.bad.json", "vms.noid.json"):
            os.remove(os.path.join(tmp, "api/profiles", rel))
        # M7: незнакомый файл api/fixtures/ — стенд, а не молчание
        write(tmp, "api/fixtures/agents.json", "{}")
        wa = classify("HEAD", tmp)
        ok(any("agents.json" in s for s in wa["stand"]), "M7: api/fixtures/agents.json — стенд с именем файла")
        os.remove(os.path.join(tmp, "api/fixtures/agents.json"))


old = base()
c = classify_specs(old, add_schema(old, "Foo"), old)
ok("+ схема Foo" in " ".join(c["mechanism"]), "новая общая схема — механизм")
ok(POS in classify_specs(old, touch_schema(old, "PosRawLine"), old)["layers"], "схема кассы — vms.pos/1")
c = classify_specs(old, set_description(old, "Unit", "новое описание"), old)
ok(c["mechanism"] == [] and c["descriptions"], "case_description_only: только описания")
ok(version_problems({**c, "version": ("V", "V")}, True) == [], "case_description_only: без версии можно")
x = copy.deepcopy(old)
x["components"]["schemas"]["Unit"]["x-layer"] = POS
c = classify_specs(old, x, x)
ok(c["mechanism"] == [] and c["layers"] == {} and c["marks"] == ["схема Unit"], "правка только x-layer — не механизм и не слой")
# снятое — слой по старой спецификации: сначала новая, потом старая, потом рабочая
gone = copy.deepcopy(old)
del gone["components"]["schemas"]["PosRawLine"]
c = classify_specs(old, gone, gone)
ok(c["mechanism"] == [] and any("PosRawLine" in t for t in c["layers"].get(POS, [])), "снятая схема кассы — vms.pos/1")
gone = copy.deepcopy(old)
del gone["paths"][POS_PATH]
c = classify_specs(old, gone, gone)
ok(c["mechanism"] == [] and any(POS_PATH in t for t in c["layers"].get(POS, [])), "снятый путь с пометкой — слой пометки")
gone = copy.deepcopy(old)
del gone["components"]["schemas"]["AssistEvent"]["properties"]["export"]
c = classify_specs(old, gone, gone)
ok(c["mechanism"] == [] and any("AssistEvent.export" in t for t in c["layers"].get("video", [])), "снятое поле подсистемы — слой video")
# правка только x-layer: список в разборе, адресат — владелец контракта, версия не нужна
mk = {**c, "mechanism": [], "layers": {}, "kinds": [], "stand": [], "descriptions": [], "marks": ["схема Unit"],
      "version": ("V", "V"), "files": ["api/openapi.json"], "base": "0" * 40, "notify": {}}
ok("схема Unit" in layers.format_report(mk), "x-layer: схема названа в разборе")
ok(version_problems(mk, True) == [], "x-layer: версия не нужна")
ok("None" not in layers.format_report({**mk, "version": (None, None)}) and "версия не менялась" in layers.format_report({**mk, "version": (None, None)}),
   "разбор без правки openapi.json не пишет None")
m = classify_specs(old, add_schema(old, "Foo"), old)
ok(any("без новой версии" in p for p in version_problems({**m, "version": ("V", "V")}, False)), "V1: механизм без версии")
ok(version_problems({**m, "version": ("0.1.0", "0.2.0")}, False) == [], "V1: версия поднята — можно")
spec = base()
f = classify_fixture(FX, add_profile_prop(FX, "vms.camera/1", "camera", "noiseReduction"), spec, "api")
ok("vms.camera/1" in f["layers"], "поле профиля камеры — vms.camera/1")
ok(any("zzz" in s for s in classify_fixture(FX, add_kind_prop(FX, "camera", "zzz"), spec, "api")["kinds"]), "поле вне профиля — только вид")
ok("vms" in classify_fixture(FX, touch_reference(FX, "deviceModels"), spec, "api")["layers"], "справочник моделей — vms")
ok(classify_fixture(FX, touch_reference(FX, "ruleActions"), spec, "api")["stand"], "справочник без пометки — стенд")
ok(any("version в файле профиля" in p for p in version_problems({**f, "mechanism": [], "version": ("0.1.0", "0.2.0")}, True)),
   "V2: данные профиля подняли версию контракта")
ok(version_problems({**f, "mechanism": [], "version": ("0.1.0", "0.2.0")}, False) == [], "V2 до части 02 молчит")
ok(version_problems({"mechanism": [], "layers": {}, "version": ("0.1.0", "0.2.0")}, True) == [], "V2: только документы — можно")

# M1: check_api.check_layer_diff — копия API и отсутствие git дают INFO, а не FAIL
import check_api  # noqa: E402


class Rep:
    def __init__(self):
        self.infos, self.fails, self.checks = [], [], []

    def info(self, t):
        self.infos.append(t)

    def fail(self, name, items):
        self.fails.append((name, items))

    def check(self, name, items, *a):
        self.checks.append((name, items))


_api, _cls = check_api.API, layers.classify
try:
    check_api.API = "api-copy"
    r = Rep()
    check_api.check_layer_diff(r, {})
    ok(r.infos and not r.fails and not r.checks, "M1: --api не api — INFO, сверка пропущена")
    check_api.API = "api"
    layers.classify = lambda *a, **k: None
    r = Rep()
    check_api.check_layer_diff(r, {})
    ok(r.infos and "пропуск" in r.infos[0] and not r.fails and not r.checks, "M1: нет git или origin/main — INFO, не FAIL")
finally:
    check_api.API, layers.classify = _api, _cls

# история репозитория: в мелком клоне этих коммитов нет — SKIP, а не FAIL
for sha, what, check in (
        ("ed44f5a", "0.5.0 — vms.pos/1", lambda r: "vms.pos/1" in r["layers"]),
        ("60ea7f1", "0.8.0 — механизм", lambda r: any("/journal/facets" in s for s in r["mechanism"]))):
    r = classify(f"{sha}~1", head=sha)
    if r is None:
        skip(f"история: {what} — коммита {sha} нет в клоне")
    else:
        ok(check(r), f"история: {what}")

# командная строка
code, out = run_cli("--base", "HEAD", "--head", "HEAD")
ok(code == 0 and "нет правок" in out, "CLI: HEAD против HEAD — нет правок")
code, out = run_cli("--base", "no-such-ref")
ok(code == 0 and "пропущен" in out, "CLI: нет ссылки — пропуск, код 0")

print(f"RESULT {'fail' if failed else 'pass'}")
sys.exit(1 if failed else 0)
