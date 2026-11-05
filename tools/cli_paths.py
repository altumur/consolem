"""Общие параметры путей для инструментов: --api DIR, --tests DIR, --page FILE.

Без параметров — основной макет: api, tests, index.html. Параметр вырезается из sys.argv,
поэтому остальной разбор аргументов в инструментах не меняется. Прототип проверяют так:
python3 tools/X.py --page index_NN_tema.html (API и сценарии у прототипа общие с index.html)
"""
import sys


def opt(name, default):
    """Значение параметра --name (в виде «--name V» или «--name=V»), убранного из sys.argv; иначе default."""
    flag = "--" + name
    value = default
    argv = sys.argv
    i = 1
    while i < len(argv):
        if argv[i] == flag and i + 1 < len(argv):
            value = argv[i + 1]
            del argv[i:i + 2]
            continue
        if argv[i].startswith(flag + "="):
            value = argv[i][len(flag) + 1:]
            del argv[i]
            continue
        i += 1
    return value.rstrip("/") or default


def passthrough(**values):
    """Те же параметры для дочернего процесса: только отличающиеся от умолчаний."""
    defaults = {"api": "api", "tests": "tests", "page": "index.html"}
    out = []
    for k, v in values.items():
        if v != defaults[k]:
            out += ["--" + k, v]
    return out
