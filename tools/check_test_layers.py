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


def main():
    check_functions()
    check_registry()
    check_registry_count()
    check_marking()
    print("RESULT " + ("fail" if failed else "pass"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
