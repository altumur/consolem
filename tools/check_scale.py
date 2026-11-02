#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Форма на большом домене: стенд large, 250 000 камер и 500 серверов на заглушке.

Страница index.html?fixture=large открывается в headless Chrome, клиент API пишет каждый запрос в window.CONSOLEM_TRACE,
сценарий tests/scale-large.js сверяет пределы. Старт формы: не больше 15 запросов, ни одного ответа больше 1 МБ, ни один
перечень не прочитан до конца. Дальше — раскрытие, карточка, группы «Без записи» и «Без папки», поиск волнами, предел
выбора, «Права», перечитывание после потери потока.

Запуск из корня репозитория: python3 tools/check_scale.py
Код выхода 1, если что-то не прошло.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HELPERS = '<script src="tests/ui-harness.js"></script>'
TRACE = "<script>window.CONSOLEM_TRACE=[]</script>"


def main():
    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
        page = f.read()
    with open(os.path.join(ROOT, "tests", "scale-large.js"), encoding="utf-8") as f:
        code = f.read()
    page = page.replace("<head>", '<head><base href="file://%s/">%s' % (ROOT, TRACE), 1)
    page = page.replace("</body>", HELPERS + "<script>" + code + "</script></body>", 1)
    tmp = tempfile.mkdtemp(prefix="consolem-scale-")
    try:
        path = os.path.join(tmp, "page.html")
        with open(path, "w", encoding="utf-8") as f:
            f.write(page)
        chrome = shutil.which("google-chrome") or shutil.which("chromium") or "google-chrome"
        res = subprocess.run(
            [chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", "--allow-file-access-from-files",
             f"--user-data-dir={tmp}/profile", "--window-size=1600,1000", "--virtual-time-budget=600000", "--dump-dom", "file://" + path + "?fixture=large"],
            capture_output=True, text=True, timeout=540, env=dict(os.environ, TZ="Europe/Moscow"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    m = re.search(r'<script type="text/plain" id="__ui">(.*?)</script>', res.stdout, re.S)
    lines = json.loads(m.group(1)) if m else ["FAIL  сценарий не дошёл до конца"]
    for x in lines:
        print(x)
    bad = [x for x in lines if not x.startswith("PASS")]
    print(f"RESULT {'fail' if bad else 'pass'}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
