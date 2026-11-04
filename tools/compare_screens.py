#!/usr/bin/env python3
"""Внешний вид не изменился: макет через API (index.html) рисует то же, что последний макет на константах.

Макет на константах — index.html до того, как основным стал макет через API; берётся из истории git
(extract_fixture.BASELINE). После намеренных правок вида index.html расхождения ожидаемы: сравнение
подтверждает перевод на API, а не каждую правку. Оба макета открываются в headless Chrome с остановленными часами (как при сборке набора), проходят
одни и те же экраны — разделы, срезы, карточки с вкладками, светлая и тёмная тема, RU и EN — и после
каждого шага снимается разметка страницы. В разметке прототипа API UUID заменяются старыми id
макета (по выгрузке tools/extract_fixture.py), затем снимки сравниваются построчно.

Запуск из корня репозитория:
  python3 tools/compare_screens.py              ОСТАРЕЛО: сверка с макетом на константах (BASELINE) даёт FAIL на всех экранах,
                                                index.html с тех пор намеренно менялся; для сверки используйте --against
  python3 tools/compare_screens.py --diff DIR   ещё и снимки обоих прототипов в DIR
  python3 tools/compare_screens.py --page index_generic.html --api api-generic --against index.html [--with-extras]
      обе страницы — через свой API (index.html над api/, --page над --api), одни id и одни экраны;
      разметка сравнивается как есть. Ожидаемые отличия (EXPECTED_AGAINST) выводятся как EXPECT, не FAIL.
Код выхода 1, если хоть один экран отличается.
"""
import difflib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Chrome — в часовом поясе системы: в нём сервер считает расписания и время, в нём же макет на константах
TZ = "Europe/Moscow"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cli_paths  # noqa: E402
import extract_fixture  # noqa: E402
from fixture_normalize import normalize  # noqa: E402

# Известные расхождения: строка разметки, которая может отличаться, и почему. Всё остальное — ошибка
KNOWN = [
    (r'data-orig="(AxxonNet|Облачный AxxonNet)"|<option value="Облачный AxxonNet"( selected="")?>',
     "режим email-оповещателя: в данных 09 записано «AxxonNet», которого нет в списке; в 10 — код axxonnet, "
     "показан пунктом «Облачный AxxonNet». Внешне то же: браузер и в 09 показывал первый пункт"),
    (r'<span class="sub">идёт поиск в сети \d+%</span>',
     "поиск в сети, который карточка запускает сама: в 09 первая находка появлялась в тот же миг, в 10 — с ответом "
     "сервера, через мгновение; снимок снят до ответа"),
    (r'^<input type="text" value="[^"]*" oninput="setD\(true\)"( onchange="settingSet\(\'[\w.]+\',this\.value\)")?>$|'
     r'^<select onchange="(setD\(true\)|settingSet\(\'[\w.]+\',this\.value\))">$|^<option( value="[^"]*")?( selected="")?>[^<]*</option>$',
     "опции: поле сохраняется на сервер при смене (раньше только помечало «есть изменения»), у списка отмечен вариант, "
     "который хранит сервер; внешне то же"),
]

AFTER = cli_paths.opt("page", "index.html")  # --page FILE: другая страница вместо index.html
API = cli_paths.opt("api", "api")  # --api DIR: страница сама подключает свой каталог; main() проверяет, что это он
AGAINST = cli_paths.opt("against", "")  # --against FILE: сравнить с другой страницей через API, а не с макетом на константах
BEFORE = AGAINST or extract_fixture.BASELINE

# Объекты и виды, которых нет в базовом наборе: их добавляет tools/generic_fixture.py ради тестов видов
# (security_controller/*, test.*, w2c.example/*, domain.shared). Они меняют счётчики и состав дерева, колонки матрицы прав
# и списки событий и команд правил на каждом экране, поэтому в режиме --against убираются из набора сравниваемой
# страницы (--with-extras — оставить, тогда они видны как отличия); что убрано, печатается первой строкой прогона
EXTRA_KINDS = r"^(security_controller|test\.|w2c\.example|domain\.shared)"
PATCH_FIXTURE = """<script>(()=>{const re=new RegExp(%s),dropExtras=%s;
for(const f of Object.values(window.CONSOLEM_FIXTURES||{})){
  if(dropExtras&&Array.isArray(f.units)){
    const drop=new Set(f.units.filter(u=>re.test(u.kind)).map(u=>u.uid));
    let more=true;while(more){more=false;for(const u of f.units)if(!drop.has(u.uid)&&drop.has(u.parentId)){drop.add(u.uid);more=true}}
    f.units=f.units.filter(u=>!drop.has(u.uid));
    f.units.forEach(u=>{if(Array.isArray(u.folders)&&u.folders.some(x=>drop.has(x)))u.folders=u.folders.filter(x=>!drop.has(x))});
  }
  if(dropExtras&&Array.isArray(f.kinds))f.kinds=f.kinds.filter(k=>!re.test(k.kind));
}})();</script>"""

# Ожидаемые отличия режима --against: строка разметки и почему она отличается
EXPECTED_AGAINST = [
    (r'^<button class="tab ?(on)?">(Дополнительно|Additional)</button>$',
     "вкладка «Дополнительно»: свойства вида сверх профиля (у камеры configMode, templateId); в базе такой вкладки нет"),
]
# Отличия набора данных, а не страницы: за них отвечает tools/generic_fixture.py (api-generic/fixtures/demo.json). Выводятся
# отдельной меткой FIXTURE, код выхода от них не зависит; ушли из набора — строки пропадут сами
FIXTURE_AGAINST = [
    (r'^<option value="\d+">(Abandoned object|Removed object|Crowd|Оставленный предмет|Исчезновение предмета|Скопление людей)</option>$',
     "список событий правила: у вида camera в наборе объявлены события abandoned, disappeared, crowd, а в базовом "
     "reference.ruleTriggers их нет (страница строит пункты по описаниям видов, как и должна)"),
    (r'^<button type="button" class="pf-chip" data-chip="(other|lpr|silent|segment\.lost|abandoned|disappeared|crowd)">[^<]*</button>$',
     "«Что считать тревогой» (карточка камеры): список и порядок кодов из событий вида camera набора, в базе — из reference.eventKinds"),
]

# Экраны: [раздел, id объекта макета или null, вкладка или null, действия до показа]
SCREENS = [
    ["hw", None, None, []],
    ["hw", "d1", None, []],
    ["hw", "su1", None, []],
    ["hw", "s1", "gen", []], ["hw", "s1", "disk", []], ["hw", "s1", "net", []], ["hw", "s1", "svc", []],
    ["hw", "c1", "gen", []], ["hw", "c1", "vid", []], ["hw", "c1", "rec", []], ["hw", "c1", "det", []], ["hw", "c1", "io", []],
    ["hw", "c2r", "gen", []],
    ["hw", "ips1", "gen", []], ["hw", "nc3", "gen", []], ["hw", "ch1", "gen", []],
    ["hw", "a1", "gen", []], ["hw", "a11", "gen", []], ["hw", "a1:v1", "gen", []],
    ["hw", "f1", None, []], ["hw", "t1", None, []], ["hw", "acfa1", None, []], ["hw", "em1", None, []], ["hw", "pos1", None, []],
    ["hw", None, None, ["setSlice('cam')"]], ["hw", None, None, ["setSlice('acfa')"]], ["hw", None, None, ["setSlice('srv')"]],
    ["hw", None, None, ["setSlice('arch')"]], ["hw", None, None, ["setSlice('det')"]],
    ["hw", "c1", "gen", ["setTheme('light')"]],
    ["hw", "c1", "gen", ["setUiLang('en')"]],
    ["hw", "s1", "gen", ["setUiLang('en')", "setTheme('dark')"]],
    ["rules", None, None, []],
    ["rules", None, None, ["rule=id('r1')"]],
    ["rules", None, None, ["rule=id('r2')"]],
    ["rules", None, None, ["rule=id('r3')"]],
    ["rules", None, None, ["rule=id('r6')"]],
    ["rules", None, None, ["rule=id('r1')", "ruleTab='hist'"]],
    ["rules", None, None, ["rule='overview'"]],
    ["rules", None, None, ["rule='modes'"]],
    ["rules", None, None, ["rule='maint'"]],
    ["rules", None, None, ["rule='schdays'"]],
    ["rules", None, None, ["rule='sch:'+id('s_work')"]],
    ["sys", None, None, ["sys='ntp'"]],
    ["sys", None, None, ["sys='sec'"]],
    ["sys", None, None, ["sys='mail'"]],
    ["sys", None, None, ["sys='lic'"]],
    ["log", None, None, ["logFilt='all'"]],
    ["log", None, None, ["logFilt='alarm'"]],
    ["acc", None, None, []],
    ["acc", None, None, ["accGo('role:'+id('op'))"]],
    ["acc", None, None, ["accGo('role:'+id('gd'),'groups')"]],
    ["acc", None, None, ["accGo('users')"]],
    ["acc", None, None, ["accGo('user:'+id('u8'))"]],
    ["acc", None, None, ["accGo('ugroups')"]],
    ["acc", None, None, ["accGo('ug:'+id('ug1'))"]],
    ["acc", None, None, ["accGo('cat:'+id('corp'))"]],
    ["acc", None, None, ["accGo('check')"]],
    ["acc", None, None, ["accGo('history')"]],
    ["rules", None, None, ["setUiLang('en')"]],
    # Ключевые диалоги: подтверждение удаления, мастер добавления, новое хранилище, план изменений правила
    ["hw", None, None, ["setUiLang('ru')", "pick(id('c2r'))", "confirmDeleteNodes([id('c2r')])"]],
    ["hw", None, None, ["closeConfirm()", "pick(id('d1'))", "openW()"]],
    ["hw", None, None, ["closeWizard()", "addArchive(id('s1'))"]],
    ["rules", None, None, ["closeBulkModal()", "rule=id('r1')", "ruleEdit(x=>{x.name='Охрана входа — план'})", "rulePlan()"]],
]

# Случайность в разметке (разброс шагов очереди, подсказки) — одна и та же в обоих прототипах
RANDOM = "<script>Math.random=(()=>{let s=1;return()=>((s=s*16807%2147483647)-1)/2147483646})();</script>"

RUN = r"""<script>(()=>{
const IDS=__IDS__, SCREENS=__SCREENS__, SETTLE=__SETTLE__, out=[];
const id=(x)=>x==null?null:(IDS[x]||x);
const snap=()=>{const b=document.body.cloneNode(true);b.querySelectorAll("script").forEach(s=>s.remove());return b.innerHTML};
// Путь в шапке сворачивается по ширине: снимать — когда шрифты загружены, иначе ширина плавает
const ready=Promise.all([window.appReady||Promise.resolve(),document.fonts.ready]);
// Страницы через API читают карточку ответом сервера: до ответа в ней «Загрузка…». При SETTLE снимок — когда она прочитана
const settle=async()=>{for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,20));if(i>=2&&!document.body.innerHTML.includes("Загрузка…"))break}};
ready.then(async()=>{
  for(const [app,obj,tab,acts] of SCREENS){
    try{
      goApp(app);
      acts.forEach(a=>eval(a));
      if(acts.length)paint();
      if(obj)pick(id(obj));
      if(tab)goTab(tab);
      if(SETTLE)await settle();
      out.push(snap());
    }catch(e){out.push("ОШИБКА: "+e.message)}
  }
  const el=document.createElement("script");el.type="text/plain";el.id="__screens";
  el.textContent=JSON.stringify(out).replace(/</g,"\\u003c");document.body.appendChild(el);
});
})();</script>"""


def capture(page_name, ids, patch=None, settle=False):
    page = extract_fixture.read_source(page_name)
    if patch:  # убрать лишние виды и объекты — набор страницы правится до старта
        script = PATCH_FIXTURE % (json.dumps(EXTRA_KINDS), json.dumps(patch))
        page = re.sub(r'(<script src="[^"]*fixture\.js"></script>)', lambda m: m.group(1) + script, page, count=1)
    run = RUN.replace("__IDS__", json.dumps(ids)).replace("__SCREENS__", json.dumps(SCREENS)).replace("__SETTLE__", "true" if settle else "false")
    page = page.replace("<head>", '<head><base href="file://%s/">' % ROOT + extract_fixture.FREEZE + RANDOM, 1)
    page = page.replace("</body>", run + "</body>", 1)
    tmp = tempfile.mkdtemp(prefix="consolem-screens-")
    try:
        path = os.path.join(tmp, "page.html")
        with open(path, "w", encoding="utf-8") as f:
            f.write(page)
        chrome = shutil.which("google-chrome") or shutil.which("chromium") or "google-chrome"
        res = subprocess.run(
            [chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", "--allow-file-access-from-files",
             f"--user-data-dir={tmp}/profile", "--window-size=1600,1000", "--virtual-time-budget=%d" % (240000 if settle else 20000), "--dump-dom", "file://" + path],
            capture_output=True, text=True, timeout=300, env=dict(os.environ, TZ=TZ))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    m = re.search(r'<script type="text/plain" id="__screens">(.*?)</script>', res.stdout, re.S)
    if not m:
        sys.exit(f"{page_name}: снимки не получены\n" + res.stderr[-1500:])
    return json.loads(m.group(1))


def lines(markup):
    # Разметка по тегам — так расхождение видно строкой, а не одной длинной строкой страницы.
    # data-needs — пометка «нужна возможность системы» (capabilities): на эталонном наборе, где система
    # умеет всё, она ничего не прячет, поэтому не отличие
    markup = re.sub(r' data-needs="[^"]*"', "", markup)
    return [x for x in re.sub(r">\s*<", ">\n<", markup).split("\n") if x.strip()]


def check_api_dir():
    """--api: страница должна подключать скрипты именно этого каталога (иначе сверка идёт над чужим API)."""
    srcs = re.findall(r'<script src="([^"/]+)/[^"]*(?:server|fixture)\.js"', extract_fixture.read_source(AFTER))
    if not srcs or any(x != API for x in srcs):
        sys.exit(f"--api {API}: страница {AFTER} подключает {sorted(set(srcs)) or 'не api-каталог'}")


def extras_report():
    """Первая строка прогона: что убрано из набора сравниваемой страницы (список видов и число объектов)."""
    with open(os.path.join(ROOT, API, "fixtures", "demo.json"), encoding="utf-8") as f:
        fx = json.load(f)
    rx = re.compile(EXTRA_KINDS)
    kinds = [k["kind"] for k in fx.get("kinds", []) if rx.search(k["kind"])]
    drop = {u["uid"] for u in fx.get("units", []) if rx.search(u["kind"])}
    more = True
    while more:
        more = False
        for u in fx.get("units", []):
            if u["uid"] not in drop and u.get("parentId") in drop:
                drop.add(u["uid"])
                more = True
    print(f"убрано видов: {len(kinds)}, объектов: {len(drop)} (--with-extras — оставить): {', '.join(kinds)}")
    return kinds


def main():
    skipped = []
    if AGAINST:
        check_api_dir()
        skipped = extras_report() if "--with-extras" not in sys.argv else []
    out_dir = sys.argv[sys.argv.index("--diff") + 1] if "--diff" in sys.argv else None
    raw = extract_fixture.snapshot()
    normalize(raw, extract_fixture.CAPTURED_AT)
    ids = normalize.ids
    back = {uid: old for old, uid in ids.items()}
    uuid_re = re.compile(r"[0-9a-f]{8}-[0-9]{4}-4000-8000-000000000000")
    # Обработчики — не вид: в эталоне они в атрибутах onclick="…", в макете — data-on-… (onEv, под CSP)
    handlers = re.compile(r''' (?:on[a-z]+|data-on-[a-z]+)=(?:"[^"]*"|'[^']*')''')
    if AGAINST:
        # обе страницы работают с UUID: id подставляются в экраны одни и те же, обратная замена не нужна
        before = [handlers.sub("", s) for s in capture(BEFORE, ids, None, True)]
        after = [handlers.sub("", s) for s in capture(AFTER, ids, '--with-extras' not in sys.argv, True)]
    else:
        before = [handlers.sub("", s) for s in capture(BEFORE, {})]
        after = [handlers.sub("", uuid_re.sub(lambda m: back.get(m.group(0), m.group(0)), s)) for s in capture(AFTER, ids)]
    known = EXPECTED_AGAINST if AGAINST else KNOWN
    mark = "EXPECT" if AGAINST else "KNOWN"
    bad = fixture_only = 0
    for i, (screen, a, b) in enumerate(zip(SCREENS, before, after)):
        name = " · ".join(str(x) for x in screen[:3] if x) + (f" · {', '.join(screen[3])}" if screen[3] else "")
        if a == b:
            print(f"PASS  {name}")
            continue
        diff = list(difflib.unified_diff(lines(a), lines(b), "до", "после", n=0, lineterm=""))
        changed = [d[1:] for d in diff if d[:1] in "+-" and d[:3] not in ("+++", "---")]
        if not changed:  # расходятся только пробелы между тегами и data-needs (lines() их не учитывает)
            print(f"PASS  {name}" + (" (отличается только data-needs: ключи возможностей kind:…)" if AGAINST else ""))
            continue
        why = {note for pattern, note in known for d in changed if re.search(pattern, d)}
        if all(any(re.search(pattern, d) for pattern, _ in known) for d in changed):
            print(f"{mark:<6} {name} — {'; '.join(sorted(why))}")
            continue
        if AGAINST and all(any(re.search(pattern, d) for pattern, _ in known + FIXTURE_AGAINST) for d in changed):
            fixture_only += 1
            why = {note for pattern, note in FIXTURE_AGAINST for d in changed if re.search(pattern, d)}
            print(f"FIXTURE {name} — {'; '.join(sorted(why))}")
            continue
        bad += 1
        print(f"FAIL  {name} — {sum(1 for d in diff if d[:1] in '+-' and d[:3] not in ('+++', '---'))} строк отличается:")
        for d in diff[2:14]:
            print("      " + html.unescape(d)[:220])
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
            for side, s in (("before", a), ("after", b)):
                with open(os.path.join(out_dir, f"{i:02d}-{side}.html"), "w", encoding="utf-8") as f:
                    f.write("\n".join(lines(s)))
    if skipped:
        print(f"EXPECT не сравнивались: виды {', '.join(skipped)} и их объекты (нет в базе; --with-extras — сравнить)")
    extra = f", только набором данных (FIXTURE) {fixture_only}" if fixture_only else ""
    print(f"RESULT {'fail' if bad else 'pass'} — экранов {len(SCREENS)}, отличаются {bad}{extra}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
