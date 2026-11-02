/* Сценарий интерфейса: служба ассистента демо-страницы (?assist=URL, метка consolem-assist). Служба подставная:
   fetch страницы отвечает за неё заготовленными ответами, настоящей модели здесь нет. Метка ставится на время
   сценария: в index.html её нет. На стенде (?api=, сборка консоли) служба не работает, и это тоже проверяется.
   Запуск — tools/check_ui.py. */
UiCheck(async ({ ok, until }) => {
  const SVC = "https://assist.example.test", CODE = "k0d-DOSTUPA";
  const params = new URLSearchParams(location.search);
  const onStand = !!(params.get("api") || pageMeta("consolem-api"));
  const calls = [];
  let answer = null;
  const realFetch = window.fetch;
  window.fetch = (url, init) => {
    if (!String(url).startsWith("https://assist.")) return realFetch(url, init);
    calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    return answer(init);
  };
  const enc = new TextEncoder();
  const sseLine = (e) => `data: ${JSON.stringify(e)}\n\n`;
  const sse = (...events) => () => Promise.resolve(new Response(events.map(sseLine).join(""), { status: 200, headers: { "Content-Type": "text/event-stream" } }));
  const refuse = (status, body, headers) => () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: Object.assign({ "Content-Type": "application/json" }, headers || {}) }));
  // Поток, который стоит, пока его не оборвут
  let aborted = 0, feed = null, last = null;
  const hold = (...first) => (init) =>
    Promise.resolve(new Response(new ReadableStream({
      start(c) {
        feed = (e) => c.enqueue(enc.encode(sseLine(e)));
        last = (e) => { feed(e); c.close(); };
        first.forEach(feed);
        init.signal.addEventListener("abort", () => { aborted++; c.error(new DOMException("Aborted", "AbortError")); });
      },
    }), { status: 200, headers: { "Content-Type": "text/event-stream" } }));
  const el = (id) => document.getElementById(id);
  const text = () => el("gopop").textContent;
  const mode = () => el("asstSvc")?.dataset.asstMode;
  const close = () => goClose();
  const open = () => { close(); asstOpen(""); };
  const say = (t) => { asst.text = t; el("asstSend").click(); };
  const typeCode = (v) => { const i = el("asstCode"); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); };
  const meta = document.createElement("meta");
  meta.name = "consolem-assist";
  meta.content = SVC + "/";
  const search = (q) => history.replaceState(null, "", location.pathname + q);
  const q0 = location.search;
  asstCodeDrop();

  // Без адреса — прежняя панель: поля кода нет, ответ заглушки, наружу ничего
  open();
  ok(!el("asstSvc") && !el("asstCode"), "без адреса панель прежняя, поля кода нет");
  say("выключи запись Главный вход");
  ok(await until(() => el("asstApply")), "без адреса отвечает заглушка");
  ok(!calls.length, "без адреса служба не вызывается");
  ok(!document.querySelector('meta[name="consolem-assist"]'), "в странице метки нет");
  document.head.appendChild(meta);

  // Со стендом службы нет: только встроенный сервер
  if (onStand) {
    open();
    ok(asstMode(asst) === "off" && !el("asstCode"), "с бэкендом службы нет, поля кода нет");
    close();
    meta.remove();
    window.fetch = realFetch;
    return;
  }

  // Адрес есть, кода нет: поле, слова, заглушка
  open();
  ok(mode() === "nocode" && el("asstCode") && el("asstCode").type === "password", "адрес задан — поле кода");
  ok(/отвечает заглушка, не модель/.test(text()), "без кода видно словами, кто отвечает");
  say("выключи запись Главный вход");
  ok(await until(() => el("asstApply")), "без кода — заглушка");
  ok(!calls.length, "без кода служба не вызывается");

  // Код: Enter, память вкладки и sessionStorage, не localStorage, не адрес, не разметка
  open();
  el("asstCode").focus();
  typeCode(CODE);
  el("asstCode").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ok(mode() === "on" && !el("asstCode") && el("asstCodeForget"), "код принят");
  ok(/Отвечает модель/.test(text()), "видно, что отвечает модель");
  ok(!JSON.stringify(Object.assign({}, localStorage)).includes(CODE), "кода нет в localStorage");
  ok(!location.href.includes(CODE) && !el("gopop").innerHTML.includes(CODE), "кода нет в адресе и в разметке");
  ok((sessionStorage.getItem("consolem-assist-code") || "").includes(CODE), "код в sessionStorage");
  asstCodeNow = null;
  ok(asstMode(asst) === "on", "код читается из sessionStorage");

  // Ход: прямо в службу, с кодом и снимком, без куки. Ход ничего не пишет
  const camera = (await uiDevices()).find((d) => d.type === "camera" && d.name.includes("Главный вход"));
  const cam = await API.get(`/devices/${camera.id}`);
  answer = hold({ type: "progress", text: "в очереди: место 2" });
  say("выключи запись Главный вход");
  ok(await until(() => calls.length === 1), "запрос ушёл в службу");
  const call = calls[0], world = call.body.world;
  ok(call.url === SVC + "/assist/turns", "адрес хода: " + call.url);
  ok(call.init.headers["X-Assist-Code"] === CODE, "заголовок X-Assist-Code");
  ok(call.init.credentials === "omit", "куки не уходят");
  ok(!("secrets" in call.body) && !("kind" in call.body) && !("context" in call.body) && call.body.text === "выключи запись Главный вход", "тело без secrets, kind и context");
  ok(!call.url.includes(CODE) && !call.init.body.includes(CODE), "код только в заголовке");
  ok(await until(() => /в очереди: место 2/.test(el("asstLine")?.textContent || "")), "место в очереди показано");
  ok(el("asstSend").disabled && el("asstCancel"), "идёт ход: отправка заперта, отмена есть");
  feed({ type: "progress", text: "читаю устройства" });
  ok(await until(() => /читаю устройства/.test(el("asstLine")?.textContent || "")), "строка хода сменилась");
  last({ type: "plan", summary: "Камеры: 1", context: "b1:plan", items: [{ deviceId: cam.id, version: cam.version, set: { recordMode: "none" }, name: cam.name, changes: [{ field: "recordMode", before: cam.recordMode, after: "none", why: "просьба" }] }] });
  ok(await until(() => el("asstApply")), "план службы показан");
  ok(await until(() => !el("asstCancel")), "ход кончился, отмены нет");

  // Снимок: все ключи, полные записи, по контракту, паролей нет
  ok(["reference", "devices", "folders", "rules", "schedules", "modes", "maintenanceWindows", "me"].every((k) => k in world), "в снимке все ключи: " + Object.keys(world).join());
  ok(Object.keys(world).length === 8, "лишних ключей нет");
  let all = 0, cursor = null;
  do { const r = await API.get("/devices", { cursor, limit: 1000 }); all += r.items.length; cursor = r.nextCursor || null; } while (cursor);
  ok(world.devices.length === all && all > 100, "устройства целиком: " + world.devices.length);
  ok(JSON.stringify(world.devices.find((d) => d.id === cam.id)) === JSON.stringify(cam), "запись устройства полная, как GET /devices/{id}");
  ok(world.devices.some((d) => (d.folderIds || []).length), "состав папок — Device.folderIds");
  ok(world.devices.every((d) => typeof d.id === "string" && typeof d.type === "string" && typeof d.name === "string"), "у каждого устройства id, type, name: служба судит снимок по ним");
  ok(world.folders.length === (await API.get("/folders", { limit: 1000 })).items.length && world.rules.length === (await API.get("/rules")).items.length, "папки и правила целиком");
  ok(world.schedules.length && world.maintenanceWindows.length && world.modes.items && world.reference.capabilities && world.me.userId, "расписания, окна, режимы, справочник, сессия");
  ok(!/"password"\s*:/.test(call.init.body), "паролей в снимке нет");
  ok(call.init.body.length < 2 * 1024 * 1024, "снимок в пределе службы: " + call.init.body.length);
  ok(!ConsolemContract.requestProblems(window.CONSOLEM_OPENAPI, "POST", "/assist/turns", call.body).length, "тело по контракту: " + ConsolemContract.requestProblems(window.CONSOLEM_OPENAPI, "POST", "/assist/turns", call.body).slice(0, 2).join("; "));

  // «Применить» — за человеком: без него ничего не записано, запись — во встроенный сервер
  ok((await API.get(`/devices/${cam.id}`)).version === cam.version, "ход ничего не записал");
  el("asstApply").click();
  ok(await until(() => /применено/.test(text())), "итог по устройствам");
  const made = await API.get(`/devices/${cam.id}`);
  ok(made.recordMode === "none", "«Применить» записало во встроенный сервер");
  await API.patch(`/devices/${cam.id}`, { recordMode: cam.recordMode }, made.version);
  ok(calls.length === 1, "запись не ходит в службу");

  // context — как есть; вид хода — как в форме
  open();
  answer = sse({ type: "progress", text: "читаю систему" }, { type: "question", text: "На какой камере?", context: "b1:вопрос" });
  say("выключи запись");
  ok(await until(() => el("asstAsk")), "вопрос службы");
  answer = sse({ type: "refused", text: "Нельзя.", context: "b1:отказ", field: "netmask" });
  say("Главный вход");
  ok(await until(() => el("asstRefused")), "отказ службы");
  ok(calls[2].body.context === "b1:вопрос", "context возвращён как есть");
  close();
  goApp("rules");
  open();
  answer = sse({ type: "question", text: "Какое правило?", context: "c" });
  say("убери условие");
  ok(await until(() => el("asstAsk")), "ход о правилах");
  ok(calls[3].body.kind === "rules", "kind как у формы");
  close();
  goApp("hw");

  // Пароль наружу не уходит: ни полем, ни словами, ни ответом на вопрос
  const n0 = calls.length;
  open();
  ok(!/Секрет/.test(text()), "поля секрета при службе нет");
  asst.secrets = ["qwerty"];
  say("выключи запись Главный вход");
  ok(/в службу не ушла/.test(el("asstErr")?.textContent || "") && asst.secrets.length === 0, "заполненный секрет не отправлен, и это сказано");
  say("смени пароль Главный вход на qwerty");
  ok(/в службу не ушла/.test(el("asstErr")?.textContent || ""), "просьба о пароле не отправлена, и это сказано");
  ok(calls.length === n0, "наружу ничего не ушло");
  answer = sse({ type: "question", text: "Какой пароль поставить?", context: "b1:пароль" });
  say("настрой Главный вход");
  ok(await until(() => el("asstAsk")), "служба спросила пароль");
  say("qwerty");
  ok(/в службу не ушла/.test(el("asstErr")?.textContent || "") && calls.length === n0 + 1, "ответ на вопрос о пароле не отправлен");
  ok(!el("asstAsk") && asst.context === null && asst.text === "", "разговор о пароле закончен");
  ok(!calls.some((c) => "secrets" in c.body || c.init.body.includes("qwerty")), "secrets нет ни в одном теле");
  let sent = null;
  await ConsolemApi.assistTurn(SVC, CODE, { text: "x", secrets: ["s"] }, () => {}, { ends: asstEnds }).catch(() => {});
  sent = calls[calls.length - 1].body;
  ok(!("secrets" in sent), "клиент службы secrets срезает сам");

  // Отказы словами
  open();
  answer = refuse(429, { code: "BUSY", message: "Предел ходов в час с этого адреса исчерпан, повторите позже." }, { "Retry-After": "120" });
  say("выключи запись Главный вход");
  ok(await until(() => /через 2 мин/.test(el("asstErr")?.textContent || "")), "429: когда повторить");
  ok(mode() === "on", "429 код не сбрасывает");
  answer = refuse(429, { code: "BUSY", message: "x" }, { "Retry-After": "3720" });
  say("ещё раз");
  ok(await until(() => /через 1 ч 2 мин/.test(el("asstErr")?.textContent || "")), "429: часы");
  answer = refuse(429, { code: "BUSY", message: "Ассистент на сегодня исчерпал дневной предел, приходите завтра." });
  say("ещё раз");
  ok(await until(() => /приходите завтра/.test(el("asstErr")?.textContent || "")), "429 без заголовка: слово службы");
  answer = refuse(413, { code: "VALIDATION_FAILED", message: "тело больше 2 МБ" });
  say("ещё раз");
  ok(await until(() => /больше предела службы/.test(el("asstErr")?.textContent || "")), "413 словами");
  answer = refuse(422, { code: "VALIDATION_FAILED", message: "слишком длинно" });
  say("ещё раз");
  ok(await until(() => /слишком длинные/.test(el("asstErr")?.textContent || "")), "422 словами");
  answer = () => Promise.resolve(new Response("<html>413</html>", { status: 413 }));
  say("ещё раз");
  ok(await until(() => !asst.busy && /больше предела службы/.test(el("asstErr")?.textContent || "")), "отказ не JSON — те же слова");
  answer = sse({ type: "progress", text: "в очереди: место 5" }, { type: "error", code: "BUSY", message: "ассистент занят, повторите позже" });
  say("ещё раз");
  ok(await until(() => /ассистент занят/.test(el("asstErr")?.textContent || "")), "поток error BUSY: занято");
  ok(!/групповая операция/.test(text()) && !el("asstToStub"), "это не групповая операция и не обрыв");
  answer = sse({ type: "error", code: "BUSY" });
  say("ещё раз");
  ok(await until(() => /Ассистент занят/.test(el("asstErr")?.textContent || "")), "error BUSY без слов службы");

  // Нет соединения: служба недоступна, предложена заглушка
  answer = () => Promise.reject(new TypeError("Failed to fetch"));
  say("выключи запись Главный вход");
  ok(await until(() => el("asstToStub")), "нет соединения — предложена заглушка");
  ok(/Служба ассистента недоступна/.test(el("asstErr").textContent), "нет соединения — словами");
  const n1 = calls.length;
  el("asstToStub").click();
  ok(await until(() => el("asstApply")), "заглушка ответила на тот же вопрос");
  ok(calls.length === n1 && mode() === "stub" && /отвечает заглушка/.test(text()), "в службу не ходили, видно, кто отвечает");
  el("asstDecline").click();
  el("asstBack").click();
  ok(mode() === "on", "к службе можно вернуться");
  answer = sse({ type: "progress", text: "читаю систему" });
  say("выключи запись Главный вход");
  ok(await until(() => el("asstToStub")), "поток без конца — обрыв");
  answer = sse({ type: "error", code: "UPSTREAM_UNAVAILABLE", message: "модель не отвечает" });
  say("ещё раз");
  ok(await until(() => !asst.busy && el("asstToStub")), "модель не отвечает — тоже предложена заглушка");

  // Отмена: кнопкой и закрытием окна
  open();
  answer = hold({ type: "progress", text: "читаю систему" });
  say("выключи запись Главный вход");
  ok(await until(() => el("asstCancel") && /читаю систему/.test(el("asstLine")?.textContent || "")), "ход идёт");
  const a0 = aborted;
  el("asstCancel").click();
  ok(await until(() => aborted === a0 + 1 && !asst.busy), "«Отменить ход» обрывает запрос");
  ok(/Ход отменён/.test(text()) && !el("asstErr"), "отмена — не ошибка");
  say("выключи запись Главный вход");
  ok(await until(() => el("asstCancel") && /читаю систему/.test(el("asstLine")?.textContent || "")), "снова ход");
  close();
  ok(asst === null, "окно закрыто");
  ok(await until(() => aborted === a0 + 2), "закрытие окна обрывает запрос");
  open();
  say("выключи запись Главный вход");
  ok(await until(() => el("asstClose") && el("asstCancel") && /читаю систему/.test(el("asstLine")?.textContent || "")), "«Закрыть» есть и пока идёт ход");
  el("asstClose").click();
  ok(asst === null && !el("gopop").classList.contains("open"), "«Закрыть» закрыла окно");
  ok(await until(() => aborted === a0 + 3), "«Закрыть» снимает идущий ход");

  // Неверный код: 401 — не выход из системы, код сброшен, панель на заглушке
  const logged = apiLoggedOut;
  const toastSeen = () => /Сессия истекла/.test(el("tt")?.textContent || "");
  open();
  answer = refuse(401, { code: "UNAUTHORIZED", message: "нужен код доступа" });
  say("выключи запись Главный вход");
  ok(await until(() => /Неверный код доступа/.test(el("asstErr")?.textContent || "")), "401 — словами");
  ok(apiLoggedOut === logged && !logged && !toastSeen(), "401 службы не выход из системы");
  ok(!sessionStorage.getItem("consolem-assist-code") && mode() === "nocode" && el("asstCode"), "код сброшен, поле снова здесь");
  const n2 = calls.length;
  say("выключи запись Главный вход");
  ok(await until(() => el("asstApply")), "дальше отвечает заглушка");
  ok(calls.length === n2, "без кода в службу не ходим");

  // Забыть код; нерабочий код; пустой код
  open();
  typeCode("");
  el("asstCodeSet").click();
  ok(mode() === "nocode", "пустой код не принят");
  typeCode("код");
  el("asstCodeSet").click();
  ok(mode() === "nocode", "код кириллицей не принят: заголовок его не понесёт");
  typeCode(CODE);
  el("asstCodeSet").click();
  ok(mode() === "on", "код кнопкой");
  answer = hold({ type: "progress", text: "читаю систему" });
  say("выключи запись Главный вход");
  ok(await until(() => el("asstCancel") && /читаю систему/.test(el("asstLine")?.textContent || "")), "ход идёт");
  const n3 = aborted;
  el("asstCodeForget").click();
  ok(await until(() => aborted === n3 + 1 && !asst.busy), "«Забыть код» снимает ход");
  ok(mode() === "nocode" && !sessionStorage.getItem("consolem-assist-code") && asstCodeNow === null, "код забыт");

  // sessionStorage недоступен: код живёт в памяти вкладки
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = () => { throw new Error("запрещено"); };
  open();
  typeCode(CODE);
  el("asstCodeSet").click();
  Storage.prototype.setItem = setItem;
  ok(mode() === "on" && !sessionStorage.getItem("consolem-assist-code"), "без sessionStorage код в памяти");

  // Код привязан к адресу: чужая ссылка его не получит
  meta.content = "https://assist.other.test";
  open();
  ok(mode() === "nocode", "другой адрес — кода нет");
  meta.content = SVC;
  open();
  ok(mode() === "on", "свой адрес — код на месте");

  // ?assist=, неверный адрес, ?api=, набор не demo. Адрес страницы меняется на месте: читается при каждом ходе
  meta.remove();
  try {
    search(`?assist=${encodeURIComponent(SVC)}`);
    open();
    ok(mode() === "on", "?assist= задаёт адрес");
    search("?assist=javascript:alert(1)");
    open();
    ok(!el("asstSvc"), "адрес не http(s) не принят");
    search(`?assist=${encodeURIComponent(SVC)}&api=http://127.0.0.1:1`);
    ok(asstMode(null) === "off", "с ?api= службы нет");
    search(`?assist=${encodeURIComponent(SVC)}&fixture=large`);
    open();
    ok(mode() === "fixture" && !el("asstCode") && /только с демо-набором/.test(text()), "на fixture=large службы нет, это видно");
    const n4 = calls.length;
    say("выключи запись Главный вход");
    ok(await until(() => el("asstApply")), "на fixture=large отвечает заглушка");
    ok(calls.length === n4, "на fixture=large служба не вызывается");
  } finally {
    search(q0);
  }

  close();
  asstCodeDrop();
  window.fetch = realFetch;
});
