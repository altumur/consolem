/* Помощники сценариев интерфейса (tests/ui-*.js): ok, until, sleep, confirmWith и UiCheck(fn).
   Сценарий выполняется на загруженной странице прототипа после старта (appReady). Итог — строки PASS/FAIL:
   tools/check_ui.py читает их из <script id="__ui">, самопроверка прототипа (?selftest) получает их
   сообщением от страницы-сценария. */
(() => {
  const log = [];
  // Каждая проверка видна самопроверке сразу: сценарий, который не дошёл до конца, называет, где остановился
  const ok = (c, m) => {
    log.push((c ? "PASS  " : "FAIL  ") + m);
    if (window.parent !== window) window.parent.postMessage({ uiCheck: true, name: window.UI_CHECK_NAME || "", step: String(m).slice(0, 160) }, "*");
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Ждать условия: ответ сервера и событие потока приходят не сразу
  // Срок — числом ожиданий, а не часами: в самопроверке сценарии делят один поток, чужая долгая работа не должна съедать срок
  async function until(fn, ms = 20000) {
    for (let i = 0; i < ms / 25; i++) {
      try {
        if (fn()) return true;
      } catch (e) {}
      await sleep(25);
    }
    return false;
  }
  // Подтвердить диалог: ввести число удаляемых объектов (если спрашивают) и нажать кнопку
  async function confirmWith(n) {
    const inp = document.getElementById("confirmCountInp");
    if (inp && n != null) {
      inp.value = String(n);
      inp.dispatchEvent(new Event("input"));
    }
    document.getElementById("confirmOk").click();
  }
  // Разметка без кода в атрибутах: консоль VMS отдаёт страницу под CSP «script-src 'self'», где onclick="…"
  // не выполняется (index.html, onEv). Всё, что появилось за сценарий: ни одного on…, у data-on-… — JSON
  // со списком вызовов существующих функций. Строка в отчёте — только если что-то не так
  const cspBad = new Set();
  function cspCheck(el) {
    if (el.nodeType !== 1) return;
    for (const a of el.attributes) {
      if (/^on/.test(a.name)) cspBad.add(`<${el.tagName.toLowerCase()} ${a.name}>`);
      else if (a.name.startsWith("data-on-"))
        try {
          JSON.parse(a.value).forEach(([n]) => n[0] !== "." && typeof window[n] !== "function" && cspBad.add(`${a.name}: нет функции ${n}`));
        } catch (e) {
          cspBad.add(`${a.name}: не JSON`);
        }
    }
  }
  const cspScan = (root) => {
    cspCheck(root);
    if (root.querySelectorAll) root.querySelectorAll("*").forEach(cspCheck);
  };
  new MutationObserver((list) =>
    list.forEach((m) => (m.type === "attributes" ? cspCheck(m.target) : m.addedNodes.forEach(cspScan)))
  ).observe(document.documentElement, { subtree: true, childList: true, attributes: true });
  function report() {
    cspScan(document.documentElement);
    if (cspBad.size) ok(false, "разметка без кода в атрибутах: " + [...cspBad].slice(0, 6).join("; "));
    const el = document.createElement("script");
    el.type = "text/plain";
    el.id = "__ui";
    el.textContent = JSON.stringify(log).replace(/</g, "\\u003c");
    document.body.appendChild(el);
    if (window.parent !== window) window.parent.postMessage({ uiCheck: true, name: window.UI_CHECK_NAME || "", log }, "*");
  }
  window.UiCheck = (fn) =>
    (window.UI_CHECK_STARTED = true) && window.appReady
      .then(() => (window.UI_RAW_CACHE ? null : window.uiCacheAll()))
      // Черновики мастеров лежат в localStorage: чужой сценарий самопроверки не должен оставить свой этому
      .then(() => { if (typeof WZD !== "undefined") { Object.keys(WZD).forEach(wzDrop); dcDrop(); } })
      .then(() => fn({ ok, until, sleep, confirmWith }))
      .catch((e) => ok(false, "исключение: " + (e.message || JSON.stringify(e)) + " " + (e.stack || "").split("\n")[1]))
      .then(report);
})();
/* Кэш формы неполный (режим один на любом размере). Старые сценарии проверяют карточки, папки и правки на всём наборе:
   перед ними кэш дочитывается теми же дверями, что у формы, полными записями. Новое поведение — tests/ui-tree.js без этого шага. */
window.uiCacheAll = async () => {
  const ids = [];
  let cursor = null;
  do {
    const r = await API.get("/devices", { limit: 1000, cursor });
    r.items.forEach((d) => ids.push(d.id));
    cursor = r.nextCursor || null;
  } while (cursor);
  await hwEnsure(ids);
  await hwFullAll(ids);
  await Promise.all([accLoad(), autoFull(), journalLoad(), licLoad()]);
  renderTree();
};
// Полные записи всех устройств и права целиком — для сверки с сервером: тесту можно дочитать до конца
window.uiDevices = async () => {
  const rows = [];
  let cursor = null;
  do {
    const r = await API.get("/devices", { limit: 1000, cursor });
    rows.push(...r.items);
    cursor = r.nextCursor || null;
  } while (cursor);
  // Порядок перечня выбирает сервер, сценарию нужен постоянный
  return Promise.all(rows.map((d) => API.get(`/devices/${d.id}`))).then((l) => l.sort((a, b) => (a.id < b.id ? -1 : 1)));
};
window.uiAccess = async () => {
  const a = await API.get("/access");
  const [users, groups, history] = await Promise.all(["users", "groups", "history"].map((k) => API.get(`/access/${k}`, { limit: 1000 }).then((r) => r.items)));
  return Object.assign(a, { users, groups, history });
};
window.uiFolderIds = async (id) => (await API.get("/devices", { folderId: id, limit: 1000 })).items.map((d) => d.id);
