#!/usr/bin/env python3
"""Проверка проверки слоёв тестов API: чистые функции tests/layers.js.

Запуск из корня репозитория:
  python3 tools/check_test_layers.py
Код выхода 1, если хоть одна проверка не прошла. Нужен node.
"""
import json
import os
import subprocess
import sys

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


def main():
    check_functions()
    print("RESULT " + ("fail" if failed else "pass"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
