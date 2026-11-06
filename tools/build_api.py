#!/usr/bin/env python3
"""Собрать api/openapi.js и api/fixture.js из api/openapi.json и наборов api/fixtures/*.json.

Страница прототипа и тесты открываются и с диска (file://), а там fetch JSON не
работает. Поэтому контракт и наборы подключаются обычным <script>: window.CONSOLEM_OPENAPI,
window.CONSOLEM_FIXTURES (набор по имени) и window.CONSOLEM_FIXTURE (эталонный demo).
Собранные файлы руками не правят.

Запуск из корня репозитория:
  python3 tools/build_api.py          собрать
  python3 tools/build_api.py --check  собранное не отстало от JSON (код выхода 1, если отстало)
  --api DIR                           папка API вместо api (копия папки API)
"""
import json
import os
import sys

import cli_paths

API = cli_paths.opt("api", "api")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES = ["demo", "one-domain", "large"]
# Наборы-наложения: в файле "$base" (имя целого набора) и поля поверх него. В fixture.js — Object.assign поверх базы,
# а не вторая копия: xl — тот же large с другими числами stand.large (tools/profile_fixture.py)
OVERLAYS = ["xl"]


def compact(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return json.dumps(json.load(f), ensure_ascii=False, separators=(",", ":"))


def render_openapi():
    return f"/* Собрано tools/build_api.py из {API}/openapi.json — руками не править */\nwindow.CONSOLEM_OPENAPI={compact(f'{API}/openapi.json')};\n"


def deep_merge(base, over):
    """Поля наложения поверх базы: объекты сливаются по ключам (новый ключ базы не теряется), остальное заменяется."""
    if not isinstance(base, dict) or not isinstance(over, dict):
        return over
    return {**base, **{k: deep_merge(base.get(k), v) for k, v in over.items()}}


def render_overlay(name):
    with open(os.path.join(ROOT, f"{API}/fixtures/{name}.json"), encoding="utf-8") as f:
        over = json.load(f)
    base = over.pop("$base")
    if base not in FIXTURES:
        raise SystemExit(f"{API}/fixtures/{name}.json: $base {base} — не целый набор ({', '.join(FIXTURES)})")
    with open(os.path.join(ROOT, f"{API}/fixtures/{base}.json"), encoding="utf-8") as f:
        whole = json.load(f)
    # В fixture.js — только поля наложения, уже слитые с базой (stand базы с новым ключом остаётся): копии базы нет
    text = json.dumps({k: deep_merge(whole.get(k), v) for k, v in over.items()}, ensure_ascii=False, separators=(",", ":"))
    return f"window.CONSOLEM_FIXTURES[{json.dumps(name)}]=Object.assign({{}},window.CONSOLEM_FIXTURES[{json.dumps(base)}],{text});\n"


def render_fixtures():
    body = ",".join(f"{json.dumps(n)}:{compact(f'{API}/fixtures/{n}.json')}" for n in FIXTURES)
    return (f"/* Собрано tools/build_api.py из {API}/fixtures/{{{','.join(FIXTURES + OVERLAYS)}}}.json — руками не править */\n"
            f"window.CONSOLEM_FIXTURES={{{body}}};\n" + "".join(render_overlay(n) for n in OVERLAYS)
            + "window.CONSOLEM_FIXTURE=window.CONSOLEM_FIXTURES.demo;\n")


TARGETS = [(f"{API}/openapi.json", f"{API}/openapi.js", render_openapi), (f"{API}/fixtures/*.json", f"{API}/fixture.js", render_fixtures)]


def main():
    check = "--check" in sys.argv[1:]
    stale = []
    for src, dst, render in TARGETS:
        text = render()
        path = os.path.join(ROOT, dst)
        if check:
            try:
                with open(path, encoding="utf-8") as f:
                    if f.read() == text:
                        continue
            except FileNotFoundError:
                pass
            stale.append(f"{dst} отстал от {src}")
        else:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            print(f"{dst} ← {src}")
    if stale:
        print("\n".join(stale) + "\nСоберите: python3 tools/build_api.py")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
