/* Сценарии интерфейса: запуск без необязательных операций и создание архива. Запуск — tools/check_ui.py. */
UiCheck(async ({ ok, until }) => {
  // Система объявила только часть контракта: форма поднимается, разделов без операций нет
  const stand = new URLSearchParams(location.search).get("api") || document.querySelector('meta[name="consolem-api"]');
  if (!stand) {
    const drop = ["getSettings", "listRules", "listSchedules", "listDayGroups", "getModes", "getModeCurrent", "listMaintenanceWindows", "getAccess", "listJournal"];
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;width:1200px;height:800px;left:-3000px";
    f.src = new URL(`index.html?drop=${drop.join(",")}`, document.baseURI).href;
    document.body.appendChild(f);
    ok(await until(() => f.contentWindow?.appReady && f.contentDocument?.querySelector("#tree .n")), "форма поднялась без настроек, автоматизации, прав и журнала");
    const names = [...f.contentDocument.querySelectorAll(".rail *")].map((e) => e.textContent).join(" ");
    ok(names.includes("Оборудование") && !/Автоматизация|Права|Журнал/.test(names), "разделов без операций нет: " + names.slice(0, 80));
    const fail = f.contentDocument.querySelector(".bk-warn");
    ok(!fail, "нет ошибки запуска" + (fail ? ": " + fail.textContent : ""));
    f.remove();
  }

  // Права закрыты человеку: 403 на снимок — раздела нет, форма работает
  const get = API.get;
  API.get = (p, ...a) => (p === "/access" ? Promise.reject({ status: 403 }) : get(p, ...a));
  await appLoad();
  ok(accDenied && !appsShown().some((a) => a.id === "acc"), "403 на права скрывает раздел, запуск не падает");
  API.get = get;
  accDenied = false;
  await appLoad();

  // Снимок прав не пришёл (5xx, нет связи с доменом): запуск идёт, раздел говорит словами и спрашивает снова
  API.get = (p, ...a) => (p === "/access" ? Promise.reject({ status: 503 }) : get(p, ...a));
  let startErr = null;
  await appLoad().catch((e) => (startErr = e));
  ok(!startErr && accDown && !accDenied && appsShown().some((a) => a.id === "hw"), "503 на права не роняет запуск");
  goApp("acc");
  ok(!!document.querySelector("[data-acc-down]"), "в разделе — «Права сейчас недоступны»");
  await until(() => !accRetrying);
  goApp("hw");
  API.get = get;
  goApp("acc");
  ok(await until(() => !accDown && !document.querySelector("[data-acc-down]") && app === "acc"), "новый заход повторил запрос, раздел открылся");
  goApp("hw");

  // Удалённое хранилище — на весь домен, без сервера
  const before = (await API.get("/archives")).items.length;
  const dom = domains[0];
  addArchive(dom.id);
  anSet("kind", "network");
  anSet("name", "Бакет домена", true);
  ok(!an.server && !/Выберите сервер/.test(anBlock() || ""), "удалённому хранилищу сервер не нужен");
  ok(/Весь домен/.test(document.getElementById("bmBody").textContent), "вариант «Весь домен»");
  const spec = anArchive();
  ok(spec && spec.serverId === null && spec.domainId === dom.id, "хранилище домена: владелец — домен");
  closeBulkModal();
  ok((await API.get("/archives")).items.length === before, "без «Создать» ничего не записано");
  // Типы хранения — из справочника
  refStorage = ["block"];
  addArchive(servers[0].id);
  ok(an.storage === "block" && !/Объектное/.test(document.getElementById("bmBody").textContent), "тип хранения из справочника");
  closeBulkModal();
});
