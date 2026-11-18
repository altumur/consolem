#!/usr/bin/env python3
"""Покрытие профилей: какие поля вида ручной экран показывает (часть 07 переделки по слоям).

Для каждого профиля страница (tools/profile_coverage.js, ?pcov=<профиль>) берёт виды профиля с ручным экраном и
несколько объектов каждого вида. У объекта она меняет одно поле в кэше (hwApplyUnit), перерисовывает вкладки его
карточки, карточки родителя и окна детектора и сравнивает разметку со снимком без правки. Поле «показано», если хоть
один снимок отличается. «Не показано» — повод проверить, а не приговор: поле может быть видно только при условии, в окне
или в режиме правки (api/TESTS.md, «12. Покрытие профилей»).

Запуск из корня репозитория:
  python3 tools/profile_coverage.py                         все профили набора, отчёт по видам
  python3 tools/profile_coverage.py --profile vms.camera/1  один профиль (можно несколько: --profile A B)
  python3 tools/profile_coverage.py --units 3               объектов на вид (по умолчанию 2)
  python3 tools/profile_coverage.py --fixture large         набор (по умолчанию demo)
  python3 tools/profile_coverage.py --json FILE             весь отчёт в JSON
  python3 tools/profile_coverage.py --debug                 в JSON — где снимки разошлись (diff у поля, unstable у вида)
  python3 tools/profile_coverage.py --check                 код 1, если у профиля есть remove, add или untested
  python3 tools/profile_coverage.py --selfcheck             самопроверка инструмента (?pcov=selfcheck)
  python3 tools/profile_coverage.py --page FILE.html        другой файл (прототип)
Исключения — tools/profile_coverage.allow.json: {"<профиль>": {"keep": {"<поле>": "почему остаётся"},
"extra": {"<поле>": "почему на экране, но не в профиле"}}}. Поле без причины — ошибка разбора.
Один запуск Chrome на профиль. Код выхода 1 — проверка не прошла, 2 — инструмент не может работать.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse

import check_ui  # разбирает --page, --tests, --api (cli_paths) при импорте
import profile_files

ROOT = check_ui.ROOT
SCRIPT = os.path.join(ROOT, "tools", "profile_coverage.js")
ALLOW = os.path.join(ROOT, "tools", "profile_coverage.allow.json")
# Функции страницы, без которых прогон невозможен (часть 07: index.html и прототипы, скопированные с него после переноса прототипа 78)
NEEDS = ("screenFor", "handScreenFields", "screenCoverage", "profileProps", "profileKinds", "hwApplyUnit")


UNITS_HINT = "прогон не уложился в срок, уменьшите --units или проверьте профили по одному (--profile)"


class Stop(Exception):
    """Инструмент не может работать: понятная причина вместо трассировки."""


def take_list(args, flag):
    """Значения «--flag A B …» до следующего параметра; флаг можно повторять."""
    out = []
    while flag in args:
        i = args.index(flag)
        j = i + 1
        while j < len(args) and not args[j].startswith("--"):
            j += 1
        if j == i + 1:
            raise Stop(f"{flag}: нет значения")
        out += args[i + 1:j]
        del args[i:j]
    return out


def take_one(args, flag, default):
    vals = take_list(args, flag)
    if len(vals) > 1:
        raise Stop(f"{flag}: одно значение, а не {len(vals)}")
    return vals[0] if vals else default


def load_allow():
    if not os.path.exists(ALLOW):
        return {}
    try:
        with open(ALLOW, encoding="utf-8") as f:
            data = json.load(f)
    except ValueError as e:
        raise Stop(f"{os.path.relpath(ALLOW, ROOT)}: не JSON ({e})")
    bad = []
    if not isinstance(data, dict):
        raise Stop(f"{os.path.relpath(ALLOW, ROOT)}: нужен объект {{профиль: {{keep, extra}}}}")
    for pid, rec in data.items():
        if not isinstance(rec, dict):
            bad.append(f"{pid}: нужен объект с keep и extra")
            continue
        for part, fields in rec.items():
            if part not in ("keep", "extra"):
                bad.append(f"{pid}: неизвестный раздел {part} (только keep и extra)")
            elif not isinstance(fields, dict):
                bad.append(f"{pid}.{part}: нужен объект {{поле: причина}}")
            else:
                bad += [f"{pid}.{part}.{name}: нет причины" for name, why in fields.items() if not isinstance(why, str) or not why.strip()]
    if bad:
        raise Stop(f"{os.path.relpath(ALLOW, ROOT)}: " + "; ".join(bad))
    return data


def fixture_profiles(fixture):
    path = os.path.join(ROOT, "api", "fixtures", fixture + ".json")
    if not os.path.exists(path):
        raise Stop(f"нет набора {os.path.relpath(path, ROOT)}")
    try:
        with open(path, encoding="utf-8") as f:
            return [p["id"] for p in json.load(f).get("profiles", []) if isinstance(p, dict) and "id" in p]
    except (OSError, ValueError, AttributeError) as e:
        raise Stop(f"{os.path.relpath(path, ROOT)}: не прочитать профили набора ({e})")


def status_schemas(pid):
    """Схемы полей состояния профиля — из файла профиля (GET /kinds отдаёт только имена)."""
    path = os.path.join(ROOT, "api", "profiles", profile_files.file_name(pid))
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            st = json.load(f).get("status") or {}
    except (OSError, ValueError, AttributeError) as e:
        raise Stop(f"{os.path.relpath(path, ROOT)}: не прочитать файл профиля ({e})")
    return {k: (v.get("schema") if isinstance(v, dict) else None) for k, v in st.items()} if isinstance(st, dict) else {}


def page_check():
    page = os.path.join(ROOT, check_ui.PAGE)
    if not os.path.exists(page):
        raise Stop(f"нет страницы {check_ui.PAGE}")
    with open(page, encoding="utf-8") as f:
        text = f.read()
    miss = [n for n in NEEDS if f"function {n}(" not in text]
    if miss:
        raise Stop(f"на странице {check_ui.PAGE} нет {', '.join(miss)}: инструмент работает на странице с экраном по профилю "
                   "(часть 07: index.html или прототип, скопированный с него после переноса)")
    if not os.path.exists(SCRIPT):
        raise Stop(f"нет {os.path.relpath(SCRIPT, ROOT)}")
    if not (shutil.which("google-chrome") or shutil.which("chromium")):
        raise Stop("нет Chrome (google-chrome или chromium в PATH): страница работает в headless Chrome, как у check_ui.py")


def run_page(query, data):
    """Сценарий страницы с данными инструмента (window.PCOV_DATA) — через check_ui.run. Возвращает строки PASS/FAIL."""
    with open(SCRIPT, encoding="utf-8") as f:
        code = f.read()
    tmp = tempfile.mkdtemp(prefix="consolem-pcov-")
    try:
        path = os.path.join(tmp, "pcov.js")
        with open(path, "w", encoding="utf-8") as f:
            f.write("window.PCOV_DATA=" + json.dumps(data, ensure_ascii=False).replace("</", "<\\/") + ";\n" + code)
        try:
            lines = check_ui.run(path, query)
        except subprocess.TimeoutExpired:
            return ["FAIL  страница не уложилась в срок check_ui.run (300 с): " + UNITS_HINT]
        except FileNotFoundError as e:
            raise Stop(f"не запустился Chrome: {e}")
        # Виртуальный срок Chrome кончился раньше сценария — та же причина, что и настоящий срок
        return [x + ": " + UNITS_HINT if x == "FAIL  сценарий не дошёл до конца" else x for x in lines]
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def kind_line(prof, k):
    """<вид> (<профиль>): свой экран: S полей из T · не показаны: a, b · сверх профиля на экране: c"""
    cov = k.get("coverage") or {}
    fields = k.get("fields", {})
    hidden = [f for f, r in fields.items() if r.get("inProfile") and r.get("tried") and not r.get("shown")]
    untried = [f for f, r in fields.items() if r.get("inProfile") and not r.get("tried") and not r.get("absent")]
    extra = [f for f, r in fields.items() if not r.get("inProfile") and r.get("shown") and not r.get("otherProfile")]
    s = f"{k['kind']} ({prof['id']}): свой экран: {len(cov.get('shown', []))} полей из {cov.get('total', 0)}"
    s += " · не показаны: " + (", ".join(hidden) or "—")
    s += " · сверх профиля на экране: " + (", ".join(extra) or "—")
    if untried:
        s += " · не проверены: " + ", ".join(f"{f} ({fields[f].get('why', '?')})" for f in untried)
    errs = [f"{f}: {r['error']}" for f, r in fields.items() if r.get("error")]
    if errs:
        s += " · ошибки: " + "; ".join(errs)
    if k.get("loadErrors"):
        s += " · не прочитано: " + "; ".join(k["loadErrors"])
    bad = [v for v in k.get("views", []) if " " in v]
    if bad:
        s += " · неустойчивые виды: " + ", ".join(bad)
    return s


def main():
    args = sys.argv[1:]
    try:
        fixture = take_one(args, "--fixture", "demo")
        units = take_one(args, "--units", "2")
        json_out = take_one(args, "--json", None)
        only = take_list(args, "--profile")
        check = "--check" in args
        selfcheck = "--selfcheck" in args
        debug = "--debug" in args
        args = [a for a in args if a not in ("--check", "--selfcheck", "--debug")]
        if args:
            raise Stop("непонятные параметры: " + " ".join(args))
        if not units.isdigit() or int(units) < 1:
            raise Stop("--units: целое число от 1")
        page_check()
        allow = load_allow()
        if json_out and not os.access(os.path.dirname(os.path.abspath(json_out)), os.W_OK):
            raise Stop(f"--json {json_out}: в папку {os.path.dirname(os.path.abspath(json_out))} нельзя писать")
        if selfcheck:
            lines = run_page(f"?pcov=selfcheck&fixture={fixture}" + ("&debug=1" if debug else ""), {"allow": {}, "status": {}})
            bad = [x for x in lines if not x.startswith("PASS")]
            print(f"== самопроверка {check_ui.PAGE}: {len(lines) - len(bad)} из {len(lines)}")
            for x in lines:
                print("   " + x)
            print(f"RESULT {'fail' if bad else 'pass'}")
            return 1 if bad else 0
        known = fixture_profiles(fixture)
        miss = [p for p in only if p not in known]
        if miss:
            raise Stop(f"нет в наборе {fixture}: {', '.join(miss)}")
        for pid in allow:
            if pid not in known:
                raise Stop(f"{os.path.relpath(ALLOW, ROOT)}: профиля {pid} нет в наборе {fixture}")
    except Stop as e:
        print(f"profile_coverage: {e}")
        print("RESULT fail")
        return 2
    report = {"page": check_ui.PAGE, "fixture": fixture, "profiles": []}
    failed = 0
    for pid in only or known:
        t0 = time.time()
        q = "?" + urllib.parse.urlencode(dict({"pcov": pid, "units": units, "fixture": fixture}, **({"debug": "1"} if debug else {})))
        try:
            lines = run_page(q, {"allow": allow.get(pid, {}), "status": status_schemas(pid)})
        except Stop as e:
            print(f"profile_coverage: {e}")
            print("RESULT fail")
            return 2
        rep = None
        for x in lines:
            if x.startswith("PASS  COVERAGE "):
                try:
                    rep = json.loads(x[len("PASS  COVERAGE "):])
                except ValueError as e:
                    lines.append(f"FAIL  отчёт страницы — не JSON ({e})")
        bad = [x for x in lines if not x.startswith("PASS")]
        print(f"== {pid} ({time.time() - t0:.0f} с)")
        for x in bad:
            print("   " + x)
        if rep is None or bad:
            failed += 1
            if rep is None:
                print("   страница не прислала отчёт")
                continue
        report["profiles"].append(rep)
        if not rep["kinds"]:
            print(f"   {rep.get('note') or 'нет видов с ручным экраном'}")
        for k in rep["kinds"]:
            print("   " + kind_line(rep, k))
        sm = rep["summary"]
        print("   итог: " + " · ".join(f"{n}: {', '.join(sm[n]) or '—'}" for n in ("keep", "remove", "add", "untested")))
        if check and (sm["remove"] or sm["add"] or sm["untested"]):
            failed += 1
    if json_out:
        try:
            with open(json_out, "w", encoding="utf-8") as f:
                json.dump(report, f, ensure_ascii=False, indent=1)
        except OSError as e:
            print(f"profile_coverage: --json {json_out}: не записать ({e})")
            print("RESULT fail")
            return 2
        print(f"отчёт: {json_out}")
    print(f"RESULT {'fail' if failed else 'pass'}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
