#!/usr/bin/env python3
"""Живое видео настоящими событиями мыши, в настоящем времени.

check_ui.py идёт в виртуальном времени: часы страницы обгоняют ICE, кадров там нет. Здесь index.html открывается в headless Chrome
по CDP, сценарий жмёт мышью по экрану (Input.dispatchMouseEvent), а не зовёт функции. tools/check_live.mjs говорит, что сделал.

Запуск из корня репозитория: python3 tools/check_live.py
Код выхода 1, если что-то не прошло. Нужны Node.js и Google Chrome.
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    chrome = shutil.which("google-chrome") or shutil.which("chromium") or "google-chrome"
    res = subprocess.run(["node", os.path.join(ROOT, "tools", "check_live.mjs"), chrome, ROOT], capture_output=True, text=True, timeout=400)
    print(res.stdout.rstrip())
    if res.stderr.strip():
        print(res.stderr.rstrip()[-2000:])
    bad = res.returncode or "FAIL" in res.stdout
    print(f"RESULT {'fail' if bad else 'pass'}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
