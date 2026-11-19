#!/usr/bin/env python3
"""Проверка проверки слоёв тестов API: чистые функции tests/layers.js.

Запуск из корня репозитория:
  python3 tools/check_test_layers.py
Код выхода 1, если хоть одна проверка не прошла. Нужен node.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
failed = 0


def ok(cond, what):
    global failed
    print(("PASS " if cond else "FAIL ") + what)
    if not cond:
        failed += 1


K = {"items": [{"kind": "camera", "implements": ["vms.camera/1", "vms.live/1"]},
               {"kind": "acfa", "implements": ["vms.acs/1"]},
               {"kind": "cam2", "implements": ["vms.cam2/2"]}],
     "profiles": [{"id": "vms.camera/1", "version": "1.5"}, {"id": "vms.acs/1", "version": "1.0"}]}
# usableKind: годные виды передаются списком
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
    (("undeclaredOperation", "POST", "/test/reset", []), None),  # служебная операция стенда
    (("undeclaredOperation", "GET", "/no-such-thing", []), None),  # адреса нет в контракте
    (("undeclaredOperation", "GET", "/units/0000/live?x=1", []), None),  # метода нет у пути — не операция
]

NODE = r"""
const fs = require("fs");
globalThis.window = globalThis;
const root = process.argv[1];
require(root + "/api/contract.js");
require(root + "/tests/layers.js");
const L = window.ConsolemTestLayers;
const spec = JSON.parse(fs.readFileSync(root + "/api/openapi.json", "utf8"));
const out = JSON.parse(fs.readFileSync(0, "utf8")).map(([fn, ...a]) => {
  try {
    if (fn === "declaredProfiles") return L.declaredProfiles(a[0], (c) => a[1].includes(c));
    if (fn === "profileLack") return L.profileLack(a[0], L.declaredProfiles(a[1], (c) => a[2].includes(c)));
    if (fn === "undeclaredOperation") return L.undeclaredOperation(spec, { operations: a[2], features: [] }, a[0], a[1]);
    return L[fn](...a);
  } catch (e) { return "ERROR " + e.message; }
});
// Map → объект
const plain = (v) => v instanceof Map ? Object.fromEntries(v) : v;
process.stdout.write(JSON.stringify(out.map(plain)));
"""


def check_functions():
    cases = [[c[0][0], *c[0][1:]] for c in CASES]
    res = subprocess.run(["node", "-e", NODE, ROOT], input=json.dumps(cases), capture_output=True, text=True, timeout=60)
    if res.returncode != 0:
        err = [l for l in res.stderr.splitlines() if "Error" in l or "Cannot" in l]
        for c, _ in CASES:
            ok(False, f"{c[0]}({', '.join(json.dumps(x, ensure_ascii=False)[:30] for x in c[1:])}): node упал: {err[0] if err else res.returncode}")
        return
    got = json.loads(res.stdout)
    for (c, want), have in zip(CASES, got):
        ok(have == want, f"{c[0]}({', '.join(json.dumps(x, ensure_ascii=False)[:40] for x in c[1:])}) → {json.dumps(have, ensure_ascii=False)[:90]}"
           + ("" if have == want else f"; ждали {json.dumps(want, ensure_ascii=False)[:90]}"))


ZZ_FILE = """(() => {
  ApiTest.fileLayer("profile:vms.camera/1");
  ApiTest.test("слой: от файла", async () => {}, { needs: ["patchUnit"] });
  ApiTest.test("слой: свой", async () => {}, { layer: "mechanism" });
  ApiTest.test("слой: since", async () => {}, { since: "1.3" });
  ApiTest.loaded("api-zz-layers.js");
})();
"""
# Сквозные проверки отчёта: строки PASS/FAIL без теста за ними
CROSS = ("Файлы тестов загрузились", "Ответы соответствуют openapi.json", "Неподдержанные операции отвечают 404 NO_ROUTE",
         "Каждая объявленная операция покрыта тестами", "У каждого теста есть слой")


def registry(tests_dir=None):
    cmd = ["node", os.path.join(ROOT, "tools", "api_tests_registry.mjs")] + (["--tests", tests_dir] if tests_dir else [])
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=120, cwd=ROOT)
    if res.returncode != 0:
        return None, (res.stderr.strip().splitlines() or [f"код {res.returncode}"])[-1]
    return json.loads(res.stdout), None


def check_registry():
    copy = tempfile.mkdtemp(prefix=".tests-layers-", dir=ROOT)
    try:
        for name in os.listdir(os.path.join(ROOT, "tests")):
            src = os.path.join(ROOT, "tests", name)
            if os.path.isfile(src):
                shutil.copy(src, copy)
        with open(os.path.join(copy, "api-zz-layers.js"), "w", encoding="utf-8") as f:
            f.write(ZZ_FILE)
        page = os.path.join(copy, "api.html")
        text = open(page, encoding="utf-8").read()
        text = text.replace("<script>\n      ApiTest.run();", '<script src="api-zz-layers.js"></script>\n    <script>\n      ApiTest.run();', 1)
        open(page, "w", encoding="utf-8").write(text)
        reg, err = registry(copy)
        ok(reg is not None, "Реестр копии tests/ печатается" + (f": {err}" if err else ""))
        if reg is None:
            return
        by = {t["name"]: t for t in reg["tests"]}
        ok(reg["files"].get("api-zz-layers.js") == "profile:vms.camera/1", "files: слой файла api-zz-layers.js")
        a, b, c = by.get("слой: от файла"), by.get("слой: свой"), by.get("слой: since")
        ok(bool(a) and a["layer"] == "profile:vms.camera/1" and a["needs"] == ["patchUnit", "profile:vms.camera/1"] and a["file"] == "api-zz-layers",
           f"тест без своего слоя берёт слой файла и условие profile: в конец needs: {a}")
        ok(bool(b) and b["layer"] == "mechanism" and not any(n.startswith("profile:") for n in b["needs"]), f"тест со своим слоем: {b}")
        ok(bool(c) and c["since"] == "1.3" and "profile:vms.camera/1@1.3" in c["needs"] and "profile:vms.camera/1" not in c["needs"], f"since: условие profile:<id>@<since>: {c}")
        real, _ = registry()
        ok(real is not None and len(reg["tests"]) == len(real["tests"]) + 3, "в копии на три теста больше, чем в настоящей папке")
    finally:
        shutil.rmtree(copy, ignore_errors=True)


def check_registry_count():
    reg, err = registry()
    ok(reg is not None, "Реестр tests/ печатается" + (f": {err}" if err else ""))
    if reg is None:
        return
    res = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "run_api_tests.py")], capture_output=True, text=True, timeout=400, cwd=ROOT)
    lines = [l for l in res.stdout.splitlines() if re.match(r"(PASS|FAIL|SKIP)  ", l)]
    own = [l for l in lines if not any(l[6:].startswith(c) for c in CROSS)]
    ok(len(lines) - len(own) == len(CROSS), f"в отчёте все {len(CROSS)} сквозные проверки: {len(lines) - len(own)}")
    ok(len(reg["tests"]) == len(own), f"тестов в реестре столько же, сколько строк PASS/FAIL/SKIP тестов в отчёте: {len(reg['tests'])} и {len(own)}")
    m = re.search(r"(PASS|FAIL)  У каждого теста есть слой — (.*)", res.stdout)
    nolayer = sum(1 for t in reg["tests"] if not t["layer"])
    ok(bool(m) and (m.group(1) == "FAIL") == bool(nolayer), f"сквозная проверка «У каждого теста есть слой»: {m.group(0) if m else 'нет строки'}; без слоя в реестре {nolayer}")


def check_marking():
    print("-- Разметка")
    reg, err = registry()
    ok(reg is not None, "Реестр tests/ печатается" + (f": {err}" if err else ""))
    if reg is None:
        return
    form = re.compile(r"(mechanism|video|profile:[A-Za-z0-9_.-]+/[0-9]+)")
    bad = [t["name"] for t in reg["tests"] if not t["layer"] or not form.fullmatch(t["layer"])]
    ok(not bad, f"у каждого из {len(reg['tests'])} тестов слой верной формы" + (f"; без слоя: {'; '.join(bad[:5])}" if bad else ""))
    nofile = [f for f in sorted(os.listdir(os.path.join(ROOT, "tests"))) if re.match(r"api-.+\.js$", f) and not reg["files"].get(f)]
    ok(not nofile, "у каждого файла api-*.js задан слой" + (f"; без слоя: {', '.join(nofile)}" if nofile else ""))

    def layers_of(file, prefix=None):
        return {t["layer"] for t in reg["tests"] if t["file"] == file and (prefix is None or t["name"].startswith(prefix))}
    samples = [("api-view", "Реле: команда output", {"mechanism"}), ("api-devices", "Поддетектор: под трекером", {"profile:vms.subdetector/1"}),
               ("api-domains", "Папка: создать", {"mechanism"}), ("api-domains", "Домен: переименовать", {"mechanism"}), ("api-domains", "Домен: задать лицензию", {"profile:vms.domain/1"}), ("api-export", None, {"video"}), ("api-units", None, {"mechanism"})]
    for file, prefix, want in samples:
        got = layers_of(file, prefix)
        ok(got == want, f"образец раскладки: {file}{' «' + prefix + '…»' if prefix else ''} → {sorted(got)}")


GUARD_FILE = """(() => {
  ApiTest.fileLayer("mechanism");
  ApiTest.test("защита: необъявленная операция", async () => {
    const env = await ApiTest.makeEnv();
    await env.ok("GET", "/licenses");
  });
  ApiTest.test("защита: адрес вне контракта", async () => {
    const env = await ApiTest.makeEnv();
    const res = await env.call("GET", "/no-such-thing");
    if (res.status !== 404 || res.body.code !== "NO_ROUTE") throw new Error("ждали 404 NO_ROUTE, пришло " + res.status);
  });
  ApiTest.loaded("api-zz-guard.js");
})();
"""


def guard_copy(minimal):
    copy = tempfile.mkdtemp(prefix=".tests-guard-", dir=ROOT)
    for name in os.listdir(os.path.join(ROOT, "tests")):
        src = os.path.join(ROOT, "tests", name)
        if os.path.isfile(src):
            shutil.copy(src, copy)
    with open(os.path.join(copy, "api-zz-guard.js"), "w", encoding="utf-8") as f:
        f.write(GUARD_FILE)
    page = os.path.join(copy, "api.html")
    text = open(page, encoding="utf-8").read()
    if minimal:  # только механизм и защита: прогон на стенде короткий, и его отчёт виден целиком
        text = re.sub(r'    <script src="api-(?!zz)[a-z]+\.js"></script>\n', "", text)
    text = text.replace("<script>\n      ApiTest.run();", '<script src="api-zz-guard.js"></script>\n    <script>\n      ApiTest.run();', 1)
    open(page, "w", encoding="utf-8").write(text)
    return copy


def run_tool(args):
    res = subprocess.run([sys.executable, os.path.join(ROOT, "tools", args[0])] + args[1:], capture_output=True, text=True, timeout=600, cwd=ROOT)
    return res.stdout


def check_undeclared():
    print("-- Необъявленная операция")
    msg = "защита: необъявленная операция — тест вызвал операцию listLicenses, которую система не объявила; назвать её в needs"
    only = ["--fixture", "one-domain", "--only"]
    copy = guard_copy(False)
    try:
        out = run_tool(["run_api_tests.py", "--tests", copy] + only + ["защита: необъявленная операция"])
        ok(any(l.startswith("FAIL  ") and msg in l for l in out.splitlines()) and "RESULT fail" in out,
           "встроенный сервер: FAIL «тест вызвал операцию listLicenses, которую система не объявила»: " + repr((out.strip().splitlines() or [""])[-3:]))
        out = run_tool(["run_api_tests.py", "--tests", copy] + only + ["защита: адрес вне контракта"])
        ok(any(l.startswith("PASS  [механизм] защита: адрес вне контракта") for l in out.splitlines()) and "RESULT pass" in out,
           "адрес вне контракта по-прежнему отвечает 404 NO_ROUTE: " + repr((out.strip().splitlines() or [""])[-3:]))
    finally:
        shutil.rmtree(copy, ignore_errors=True)
    copy = guard_copy(True)
    try:
        out = run_tool(["check_stand.py", "--tests", copy, "--fixture", "one-domain", "--clock", "real"])
        want = "SKIP  [механизм] защита: необъявленная операция — система не объявила операцию listLicenses; тест не назвал её в needs"
        ok(want in out, "стенд бэкенда: SKIP «система не объявила операцию listLicenses»" + ("" if want in out else f": {out[-600:]!r}"))
        ok("FAIL  [механизм] защита" not in out and "Unhandled" not in out, "стенд бэкенда: тестов защиты без FAIL")
    finally:
        shutil.rmtree(copy, ignore_errors=True)


def test_lines(out):
    """Строки тестов отчёта: PASS/FAIL/SKIP без сквозных проверок."""
    return [l for l in out.splitlines() if re.match(r"(PASS|FAIL|SKIP)  ", l) and not any(l[6:].startswith(c) for c in CROSS)]


def check_totals(out, what):
    """Итог «все N прошли, пропущено K» сходится со строками PASS и SKIP отчёта (с отбором слоёв — тоже)."""
    lines = [l for l in out.splitlines() if re.match(r"(PASS|FAIL|SKIP)  ", l)]
    passed = sum(1 for l in lines if l.startswith("PASS"))
    skipped = sum(1 for l in lines if l.startswith("SKIP"))
    m = re.search(r"Тесты API: все (\d+) прошли(?:, пропущено (\d+))?", out)
    ok(bool(m) and int(m.group(1)) == passed and int(m.group(2) or 0) == skipped,
       f"{what}: итог сходится со строками (PASS {passed}, SKIP {skipped}): {m.group(0) if m else 'нет итога'}")


def check_report():
    print("-- Отчёт")
    reg, err = registry()
    ok(reg is not None, "Реестр tests/ печатается" + (f": {err}" if err else ""))
    if reg is None:
        return
    count = {}
    for t in reg["tests"]:
        count[t["layer"]] = count.get(t["layer"], 0) + 1
    # 1. Профиль, которого нет в наборе: все его тесты пропущены, строка LAYER называет число
    out = run_tool(["run_api_tests.py", "--fixture", "one-domain", "--layer", "profile:vms.edge/1"])
    own = test_lines(out)
    n = count["profile:vms.edge/1"]
    ok("RESULT pass" in out and len(own) == n and all(l.startswith("SKIP  [vms.edge/1] ") and l.endswith("— профиль vms.edge/1 не объявлен") for l in own),
       f"--layer profile:vms.edge/1 на one-domain: {len(own)} из {n} тестов пропущены с причиной «не объявлен»")
    ok(f"LAYER vms.edge/1 — не объявлен, пропущено {n}" in out.splitlines(), "строка «LAYER vms.edge/1 — не объявлен, пропущено N»")
    ok("INFO  Покрытие операций проверяется только при полном прогоне" in out.splitlines(), "при отборе слоёв покрытие не проверяется, вместо него INFO")
    check_totals(out, "--layer profile:vms.edge/1")
    # 2-3. Неверный слой
    out = run_tool(["run_api_tests.py", "--layer", "profile:vms.nosuch/1"])
    ok("RESULT fail" in out and "FAIL  Отбор слоёв — нет тестов слоя profile:vms.nosuch/1" in out.splitlines(), "--layer без тестов у слоя: FAIL «нет тестов слоя»")
    out = run_tool(["run_api_tests.py", "--layer", "Mechanism"])
    ok("RESULT fail" in out and "FAIL  Отбор слоёв — неизвестный слой «Mechanism»" in out.splitlines(), "--layer Mechanism: FAIL «неизвестный слой»")
    # 4. Отбор слоя вместе с отбором теста: строки LAYER печатаются и при only
    name = "Чтение: каждая коллекция отдаёт столько записей, сколько в эталонном наборе"
    out = run_tool(["run_api_tests.py", "--layer", "mechanism", "--only", name])
    ls = out.splitlines()
    ok(any(l.startswith("PASS  [механизм] " + name) for l in ls) and "LAYER механизм — прошли 1, не прошли 0, пропущено 0" in ls and "RESULT pass" in ls,
       "--layer mechanism --only «…»: PASS с меткой, LAYER механизм — прошли 1")
    out = run_tool(["run_api_tests.py", "--only", name])
    ok("LAYER механизм — прошли 1, не прошли 0, пропущено 0" in out.splitlines(), "--only без --layer тоже печатает строки LAYER")
    # 5. Отбор слоя: только его тесты и верный итог
    out = run_tool(["run_api_tests.py", "--layer", "mechanism"])
    own = test_lines(out)
    ok("RESULT pass" in out and len(own) == count["mechanism"] and all(l[6:].startswith("[механизм] ") for l in own),
       f"--layer mechanism: только тесты механизма, {len(own)} из {count['mechanism']}")
    check_totals(out, "--layer mechanism")
    out = run_tool(["run_api_tests.py", "--layer", "profile:vms.camera/1,video"])
    own = test_lines(out)
    ok("RESULT pass" in out and len(own) == count["profile:vms.camera/1"] + count["video"] and {l[6:].split("]")[0] for l in own} == {"[vms.camera/1", "[API видео"},
       f"--layer profile:vms.camera/1,video: тесты двух слоёв, {len(own)}")
    check_totals(out, "--layer profile:vms.camera/1,video")
    # 6. Полный прогон: строки LAYER у механизма, профилей и API видео, итог тот же
    out = run_tool(["run_api_tests.py"])
    ls = [l for l in out.splitlines() if l.startswith("LAYER ")]
    profiles = sorted(k for k in count if k.startswith("profile:"))
    want = ["LAYER механизм "] + [f"LAYER {k[8:]} " for k in profiles] + ["LAYER API видео "]
    ok(len(ls) == len(want) and all(a.startswith(b) for a, b in zip(ls, want)), f"полный прогон: строки LAYER в порядке механизм, профили по id, API видео ({len(ls)} из {len(want)})")
    ok(not any("не объявлен" in l for l in ls), "на demo ни один слой не «не объявлен»")
    # Версия в строке LAYER — младшая версия файла профиля (api/profiles/*.json), а не зашитая 1.0: профиль растёт
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    import profile_files
    versions = {d["id"]: d["version"] for d in profile_files.load_profiles(os.path.join(ROOT, "api"))}
    rows = [re.fullmatch(r"LAYER ([^ ]+) (\d+\.\d+) — прошли \d+, не прошли 0, пропущено 0", l) for l in ls[1:-1]]
    bad = [l for l, m in zip(ls[1:-1], rows) if not m or versions.get(m.group(1)) != m.group(2)]
    ok(not bad, "профили: версия из файла профиля и счётчики" + (": " + "; ".join(bad) if bad else ""))
    check_totals(out, "полный прогон demo")
    out = run_tool(["run_api_tests.py", "--fixture", "one-domain"])
    ls = out.splitlines()
    ok(all(any(l.startswith(f"LAYER {p} — не объявлен, пропущено ") for l in ls) for p in ("vms.edge/1", "vms.subdetector/1")), "one-domain: «не объявлен» у vms.edge/1 и vms.subdetector/1")
    check_totals(out, "полный прогон one-domain")
    # 7. Защита задачи 4 стоит в слое механизма, слои на стенде отбираются
    copy = guard_copy(True)
    try:
        out = run_tool(["run_api_tests.py", "--tests", copy, "--fixture", "one-domain", "--layer", "mechanism"])
        ok(any(l.startswith("FAIL  [механизм] защита:") for l in out.splitlines()), "встроенный сервер: FAIL с меткой «[механизм] защита:»")
        out = run_tool(["check_stand.py", "--tests", copy, "--fixture", "one-domain", "--clock", "real", "--layer", "mechanism"])
        ok("RESULT pass" in out and "LAYER механизм" in out and "Макет ?selftest" not in out, "check_stand.py принимает --layer: отбор дошёл до страницы, строка LAYER в отчёте")
    finally:
        shutil.rmtree(copy, ignore_errors=True)


class Collect:
    """Report для check_api.check_test_layers: собирает строки, а не печатает."""

    def __init__(self):
        self.lines = []

    def ok(self, name, note=""):
        self.lines.append(("PASS", name, note))

    def fail(self, name, problems):
        self.lines.append(("FAIL", name, "\n".join(problems)))

    def info(self, text):
        self.lines.append(("INFO", text, ""))

    def check(self, name, problems, note=""):
        self.fail(name, problems) if problems else self.ok(name, note)


def sub_file(copy, name, old, new):
    path = os.path.join(copy, name)
    text = open(path, encoding="utf-8").read()
    assert old in text, f"{name}: нет текста для порчи: {old}"
    open(path, "w", encoding="utf-8").write(text.replace(old, new, 1))


def add_file(copy, body):
    with open(os.path.join(copy, "api-zz-spoil.js"), "w", encoding="utf-8") as f:
        f.write("(() => {\n" + body + '\n  ApiTest.loaded("api-zz-spoil.js");\n})();\n')
    sub_file(copy, "api.html", "<script>\n      ApiTest.run();", '<script src="api-zz-spoil.js"></script>\n    <script>\n      ApiTest.run();')


def spoil_zz(layer, since):
    return (f'  ApiTest.test("порча: слой {layer} since {since}", async () => {{}}, {{ layer: "{layer}", since: "{since}" }});')


# Порча копии tests/: (что портим, правка копии, слова в отказе)
SPOILS = [
    ("убран fileLayer из api-bulk.js", lambda c: sub_file(c, "api-bulk.js", 'ApiTest.fileLayer("mechanism");', ""), ("без слоя", "api-bulk.js")),
    ("layer: Mechanism у теста api-view.js", lambda c: sub_file(c, "api-view.js", '["Реле: команда output", "mechanism"]', '["Реле: команда output", "Mechanism"]'), ("неизвестный слой",)),
    ("профиль без файла", lambda c: sub_file(c, "api-export.js", 'ApiTest.fileLayer("video");', 'ApiTest.fileLayer("profile:vms.nosuch/1");'),
     ("нет файла профиля api/profiles/vms.nosuch.json",)),
    ("since у слоя механизма", lambda c: add_file(c, spoil_zz("mechanism", "1.0")), ("since — только у теста профиля",)),
    ("since не вида M.m", lambda c: add_file(c, spoil_zz("profile:vms.camera/1", "1.x")), ("since — вида M.m",)),
    ("since старше версии профиля", lambda c: add_file(c, spoil_zz("profile:vms.camera/1", "99.0")), ("старше версии профиля",)),
    ("старшая цифра since не совпадает", lambda c: add_file(c, spoil_zz("profile:vms.camera/1", "2.0")), ("старшая версия since не совпадает с /1",)),
]


def check_spoiled():
    print("-- Порча")
    import check_api
    rep = Collect()
    check_api.check_test_layers(rep)
    mine = [l for l in rep.lines if l[1] == "Слой у каждого теста API"]
    ok(len(mine) == 1 and mine[0][0] == "PASS", f"настоящая папка tests/: PASS Слой у каждого теста API — {mine}")
    for what, spoil, words in SPOILS:
        copy = tempfile.mkdtemp(prefix=".tests-spoil-", dir=ROOT)
        try:
            for name in os.listdir(os.path.join(ROOT, "tests")):
                src = os.path.join(ROOT, "tests", name)
                if os.path.isfile(src):
                    shutil.copy(src, copy)
            spoil(copy)
            rep = Collect()
            check_api.check_test_layers(rep, tests=copy)
            mine = [l for l in rep.lines if l[1] == "Слой у каждого теста API"]
            text = mine[0][2] if mine else ""
            ok(bool(mine) and mine[0][0] == "FAIL" and all(w in text for w in words), f"порча «{what}» → FAIL со словами {list(words)}" + ("" if mine and mine[0][0] == "FAIL" else f"; получено {mine}"))
        finally:
            shutil.rmtree(copy, ignore_errors=True)


PREFIX_FILE = """(() => {
  ApiTest.fileLayer("profile:vms.camera/1");
  const test = ApiTest.prefixLayers([["пф: ", "video"]]);
  test("пф: по префиксу", async () => {});
  test("пф: тот же слой явно", async () => {}, { layer: "video" });
  test("другой: свой слой", async () => {}, { layer: "mechanism" });
  test("другой: слой файла", async () => {});
  ApiTest.loaded("api-zz-prefix.js");
})();
"""
CONFLICT_FILE = """(() => {
  ApiTest.fileLayer("mechanism");
  const test = ApiTest.prefixLayers([["пф: ", "video"]]);
  test("пф: конфликт слоёв", async () => {}, { layer: "mechanism" });
  ApiTest.loaded("api-zz-prefix.js");
})();
"""
SINCE_FILE = """(() => {
  ApiTest.fileLayer("profile:vms.camera/1");
  ApiTest.test("слой: версия выше объявленной", async () => {}, { since: "1.99" });
  ApiTest.loaded("api-zz-since.js");
})();
"""


def zz_copy(name, body):
    copy = tempfile.mkdtemp(prefix=".tests-zz-", dir=ROOT)
    for f in os.listdir(os.path.join(ROOT, "tests")):
        src = os.path.join(ROOT, "tests", f)
        if os.path.isfile(src):
            shutil.copy(src, copy)
    with open(os.path.join(copy, name), "w", encoding="utf-8") as f:
        f.write(body)
    sub_file(copy, "api.html", "<script>\n      ApiTest.run();", f'<script src="{name}"></script>\n    <script>\n      ApiTest.run();')
    return copy


def check_fixwave():
    print("-- Таблица префиксов, строки LAYER, итог отбора")
    copy = zz_copy("api-zz-prefix.js", PREFIX_FILE)
    try:
        reg, err = registry(copy)
        ok(reg is not None, "prefixLayers: файл с таблицей префиксов загрузился" + (f": {err}" if err else ""))
        if reg:
            by = {t["name"]: t["layer"] for t in reg["tests"]}
            want = {"пф: по префиксу": "video", "пф: тот же слой явно": "video", "другой: свой слой": "mechanism", "другой: слой файла": "profile:vms.camera/1"}
            ok({k: by.get(k) for k in want} == want, f"prefixLayers: префикс, явный слой и слой файла: {({k: by.get(k) for k in want})}")
    finally:
        shutil.rmtree(copy, ignore_errors=True)
    copy = zz_copy("api-zz-prefix.js", CONFLICT_FILE)
    try:
        reg, err = registry(copy)
        ok(reg is None and "пф: конфликт слоёв" in (err or ""), f"prefixLayers: явный слой против префикса — ошибка загрузки с именем теста: {err}")
    finally:
        shutil.rmtree(copy, ignore_errors=True)
    # Профиль объявлен, но тесты пропущены по since: строка LAYER — не «не объявлен»
    copy = zz_copy("api-zz-since.js", SINCE_FILE)
    try:
        out = run_tool(["run_api_tests.py", "--tests", copy, "--layer", "profile:vms.camera/1", "--only", "слой: версия выше объявленной"])
        ls = [l for l in out.splitlines() if l.startswith("LAYER vms.camera/1")]
        ok(len(ls) == 1 and "не объявлен" not in ls[0] and "пропущено 1" in ls[0], f"профиль объявлен, тест пропущен по since: строка LAYER без «не объявлен»: {ls}")
    finally:
        shutil.rmtree(copy, ignore_errors=True)
    # Итог отбора: неизвестный слой и слой без тестов называются по-разному
    out = run_tool(["run_api_tests.py", "--layer", "profile:vms.nosuch/1"])
    ok("Тесты API не запущены: слой без тестов" in out.splitlines(), "--layer без тестов у слоя: итог «слой без тестов»")
    out = run_tool(["run_api_tests.py", "--layer", "Mechanism"])
    ok("Тесты API не запущены: неизвестный слой" in out.splitlines(), "--layer Mechanism: итог «неизвестный слой»")


def main():
    check_functions()
    check_registry()
    check_registry_count()
    check_marking()
    check_undeclared()
    check_report()
    check_fixwave()
    check_spoiled()
    print("RESULT " + ("fail" if failed else "pass"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
