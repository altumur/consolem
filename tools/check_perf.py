#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Скорость в настоящем времени: стенд large, 250 000 камер, 500 серверов, 300 папок на встроенном сервере.

check_ui.py и check_scale.py идут в виртуальном времени и секунд не видят. Здесь index.html?fixture=large открывается в
headless Chrome по CDP без виртуального времени (tools/check_perf.mjs): шаги — те же функции страницы, что в сценариях,
ввод — настоящими клавишами. На каждый шаг — время до «тихо» (нет запросов и долгих задач 1 с, затем кадр), самая длинная
задача главного потока; для ввода время — результат (от последней клавиши), и отдельно отклик буквы (от клавиши до кадра,
где она видна в поле). Пределы — вверху check_perf.mjs, умноженные на множитель машины (калибровка в начале). Каждый шаг — медиана 3 прогонов, сторож на шаг 20 с.

Запуск из корня репозитория:
  python3 tools/check_perf.py                      основной макет, 3 прогона
  python3 tools/check_perf.py --quick              1 прогон
  python3 tools/check_perf.py --page FILE.html     прототип
  python3 tools/check_perf.py --steps a,b          выборочно (остальные шаги — без замера, чтобы дойти до нужного состояния)
  python3 tools/check_perf.py --fixture "" --quick --behavior   проверки поведения ввода (пауза в наборе, Enter, Esc…) на demo
  python3 tools/check_perf.py --json FILE          сырые числа — сравнить до и после
  python3 tools/check_perf.py --fixture ""         набор demo: быстрая самопроверка инструмента
  python3 tools/check_perf.py --fixture xl         стенд xl: 1 000 000 камер, 2 000 серверов, 1 200 папок в 4 доменах (шаги — по первому)
  python3 tools/check_perf.py --runs N --timeout С --cpu N   прогонов, сторож на шаг, замедление ЦП (проверка калибровки)
Код выхода 1, если хоть один шаг за пределом или не выполнен. Нужны Node.js 22 и Google Chrome.
"""
import os
import shutil
import signal
import subprocess
import sys

import cli_paths

PAGE = cli_paths.opt("page", "index.html")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    chrome = shutil.which("google-chrome") or shutil.which("chromium") or "google-chrome"
    node = shutil.which("node")
    if not node:
        print("FAIL  нет Node.js (node) в PATH")
        print("RESULT fail")
        return 1
    cmd = [node, os.path.join(ROOT, "tools", "check_perf.mjs"), "--chrome", chrome, "--root", ROOT, "--page", PAGE] + sys.argv[1:]
    # Вывод — сразу на экран построчно: прогон идёт минуты, ход шагов node печатает в stderr
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, text=True, bufsize=1)

    # Сигнал обёртке — node: он закрывает свой Chrome (его группа процессов) и выходит
    def forward(sig, _frame):
        if proc.poll() is None:
            proc.send_signal(signal.SIGTERM)

    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, forward)
    result = False
    for line in proc.stdout:
        sys.stdout.write(line)
        sys.stdout.flush()
        result = result or line.startswith("RESULT ")
    rc = proc.wait()
    # node упал сам (память, kill) и итога не напечатал — итог за него
    if not result:
        print(f"FAIL  check_perf.mjs завершился без итога, код {rc}")
        print("RESULT fail")
    return rc or (0 if result else 1)


if __name__ == "__main__":
    sys.exit(main())
