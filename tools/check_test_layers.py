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
               ("api-domains", "Папка: создать", {"profile:vms.folder/1"}), ("api-export", None, {"video"}), ("api-units", None, {"mechanism"})]
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
    ok(all(re.fullmatch(r"LAYER [^ ]+ 1\.0 — прошли \d+, не прошли 0, пропущено 0", l) for l in ls[1:-1]), "профили: версия и счётчики")
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


def main():
    check_functions()
    check_registry()
    check_registry_count()
    check_marking()
    check_undeclared()
    check_report()
    print("RESULT " + ("fail" if failed else "pass"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
