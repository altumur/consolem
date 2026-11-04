#!/usr/bin/env python3
"""Собрать api/openapi.js и api/fixture.js из api/openapi.json и наборов api/fixtures/*.json.

Страница прототипа и тесты открываются и с диска (file://), а там fetch JSON не
работает. Поэтому контракт и наборы подключаются обычным <script>: window.CONSOLEM_OPENAPI,
window.CONSOLEM_FIXTURES (набор по имени) и window.CONSOLEM_FIXTURE (эталонный demo).
Собранные файлы руками не правят.

Запуск из корня репозитория:
  python3 tools/build_api.py          собрать
  python3 tools/build_api.py --check  собранное не отстало от JSON (код выхода 1, если отстало)
  --api DIR                           папка API вместо api (например, api-generic)
"""
import json
import os
import sys

import cli_paths

API = cli_paths.opt("api", "api")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES = ["demo", "one-domain", "large"]


def compact(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return json.dumps(json.load(f), ensure_ascii=False, separators=(",", ":"))


def render_openapi():
    return f"/* Собрано tools/build_api.py из {API}/openapi.json — руками не править */\nwindow.CONSOLEM_OPENAPI={compact(f'{API}/openapi.json')};\n"


def render_fixtures():
    body = ",".join(f"{json.dumps(n)}:{compact(f'{API}/fixtures/{n}.json')}" for n in FIXTURES)
    return (f"/* Собрано tools/build_api.py из {API}/fixtures/{{{','.join(FIXTURES)}}}.json — руками не править */\n"
            f"window.CONSOLEM_FIXTURES={{{body}}};\nwindow.CONSOLEM_FIXTURE=window.CONSOLEM_FIXTURES.demo;\n")


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
