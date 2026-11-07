/* Сценарий интерфейса: закладка «Просмотр», работа с живым и архивом. PTZ, лента и титры из потока, разговор, реле, шкала по окнам,
   куски по 60 с, переход к моменту, недоступное словами, удержания, отметки, «Закрепить». Куски подставные: события элемента видео
   задаёт сценарий, в виртуальном времени файл не играет. Настоящей мышью и с кадрами — tools/check_live.py. */
UiCheck(async ({ ok, until, sleep, confirmWith }) => {
  const stub = window.ConsolemWhepStub;
  const q = (s) => document.getElementById("main").querySelector(s);
  const text = (s) => q(s)?.textContent || "";
  const state = () => text("[data-live-state]");
  const cams = devicePool.filter((n) => n.type === "camera");
  const cam = devicePool.find((n) => n.type === "camera" && n.online !== false && (n.devices || []).some((d) => d.type === "relay"));
  const open = async (n, t) => {
    pick(n.id, { force: true });
    await until(() => !n._row && sel === n.id);
    goTab(t);
  };
  const conn = (pc, st) => {
    Object.defineProperty(pc, "connectionState", { configurable: true, get: () => st });
    pc.dispatchEvent(new Event("connectionstatechange"));
  };
  const reads = [], extra = [];
  const get0 = API.get;
  API.get = async (p, b) => {
    reads.push(p);
    const r = await get0(p, b);
    if (p !== "/journal") return r;
    const more = extra.filter((e) => (!b.source || e.source === b.source) && (!b.from || Date.parse(e.occurredAt) >= Date.parse(b.from)));
    return Object.assign({}, r, { items: more.concat(r.items) });
  };
  // Событие журнала: на стенде — POST /test/events; на встроенном сервере служебных операций нет, запись и сообщение потока подставляются
  async function emit(deviceId, event) {
    if ((await API.raw("POST", "/test/events", { type: "journal.event", deviceId, event })).status === 200) return;
    const at = new Date().toISOString(), e = Object.assign({ id: `x${extra.length}`, at, occurredAt: at, category: "info", deviceId, cameraId: cam.id }, event);
    extra.push(e);
    apiOnEvent({ type: "journal.event", entityId: deviceId, payload: e });
  }
  await open(cam, "view");
  ok(await until(() => lv.tl && !lv.tl.busy && lv.tl.spans.length), "шкала прочитана при открытии");
  ok(q("[data-tl-win='1h']").classList.contains("pri"), "окно по умолчанию — час");

  // PTZ: аренда, пока кнопка нажата
  const puts = [];
  const put0 = API.put;
  API.put = (p, b, v) => (/\/ptz$/.test(p) && puts.push(b), put0(p, b, v));
  const ptzCam = cams.find((n) => n.ptz && n.online !== false);
  if (ptzCam) {
    const c0 = lv;
    await open(ptzCam, "view");
    ok(!!q("[data-ptz='0']"), "кнопки движения на закладке");
    ok(!/Запомнить/.test(document.getElementById("main").textContent), "задания пресетов здесь нет");
    q("[data-ptz='0']").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    ok(await until(() => puts.length >= 1), "движение: аренда");
    await sleep(1700);
    ok(puts.length >= 2 && puts[0].ttlSec === PTZ_TTL, "продление раньше срока");
    window.dispatchEvent(new MouseEvent("mouseup"));
    ok(!ptzMove, "отпустили — стоп");
    ptzCam.direct = false;
    ok(/disabled/.test(ptzPadHtml(ptzCam).split('data-ptz="0"')[1].slice(0, 120)), "за NAT движения нет");
    delete ptzCam.direct;
    await open(cam, "view");
    await until(() => lv.tl && !lv.tl.busy);
  } else ok(true, "у набора нет PTZ-камеры на связи");
  API.put = put0;

  // Лента и титры: журнал при старте, дальше поток
  await emit(cam.id, { text: "Старое событие", source: "det", kind: "motion" });
  liveStart();
  ok(await until(() => lv.sess, 60000), "живое");
  conn(lv.pc, "connected");
  ok(await until(() => /Старое событие/.test(text("[data-feed]"))), "лента: журнал с начала показа");
  const fed = reads.filter((p) => p === "/journal").length;
  await emit(cam.id, { text: "Новое из потока", source: "det", kind: "motion" });
  ok(await until(() => /Новое из потока/.test(text("[data-feed]"))), "лента: новое из потока");
  ok(reads.filter((p) => p === "/journal").length === fed, "без чтения по таймеру");
  const pos = devicePool.find((n) => n.type === "eventsrc");
  await uiPatch(pos.id, { cameraId: cam.id, overlayDelayMs: 0, overlayDurationSec: 2 }, hwVer.get(pos.id));
  await emit(pos.id, { text: "Чек", source: "pos", kind: "text", fields: { lines: ["Молоко 100", "<b>ИТОГО</b>"], word: "ОТМЕНА" } });
  ok(await until(() => /ИТОГО/.test(text("[data-live-titles]"))), "титр поверх видео");
  const tt = q("[data-live-titles]");
  ok(tt.querySelectorAll("b").length === 0 && tt.children.length === 2, "титр текстом, не разметкой");
  ok(tt.style.color !== "", "цвет по слову источника");
  await sleep(2500);
  ok(await until(() => q("[data-live-titles]").hidden), "снят по сроку");
  await emit(pos.id, { text: "Без строк", source: "pos", kind: "text", fields: {} });
  await sleep(200);
  ok(q("[data-live-titles]").hidden, "строка без lines: титра нет");
  liveStop();
  ok(/Лента идёт|Лента обновляется/.test(text("[data-feed]")), "после остановки лента снята");

  // Разговор
  const gum = navigator.mediaDevices?.getUserMedia;
  const mic = () => new AudioContext().createMediaStreamDestination().stream;
  navigator.mediaDevices.getUserMedia = async () => mic();
  const spkOwner = devicePool.find((n) => n.type === "camera" && (n.devices || []).some((d) => d.type === "spk"));
  await open(spkOwner, "view");
  ok(await until(() => q("[data-talk]") && !q("[data-talk]").hidden), "кнопка «Говорить»: у камеры есть динамик");
  q("[data-talk]").click();
  ok(await until(() => talk?.sess, 60000), "разговор: 201");
  const t1 = stub.log.filter((x) => /\/talk\//.test(x.url)).at(-1);
  ok(t1.method === "POST" && /^Bearer stub-/.test(t1.auth), "офер на url с токеном");
  ok(/a=sendonly/.test(t1.sdp), "только отправка");
  ok(q("[data-talk]").textContent === "Закончить разговор", "кнопка конца");
  const pcT = talk.pc, micT = talk.mic;
  q("[data-talk]").click();
  ok(await until(() => stub.log.at(-1).method === "DELETE"), "конец: DELETE");
  ok(!talk && micT.getTracks().every((x) => x.readyState === "ended") && pcT.signalingState === "closed", "микрофон закрыт");
  stub.busy = true;
  q("[data-talk]").click();
  ok(await until(() => /Динамик занят/.test(text("[data-talk-state]")), 60000), "второму: динамик занят, словами");
  stub.busy = false;
  stub.script.push({ status: 404, body: { error: "not yet" } }, { status: 500, body: { error: "answer failed" } });
  const posts = [];
  const post0 = API.post;
  API.post = (p, b, h) => (/\/talk$/.test(p) && posts.push(p), post0(p, b, h));
  q("[data-talk]").click();
  ok(await until(() => talk?.sess, 60000), "повторы: 404, 500, затем 201");
  ok(posts.length === 2, "после 500 просьба снова");
  API.post = post0;
  const mic2 = talk.mic;
  goTab("gen");
  ok(!talk && mic2.getTracks().every((x) => x.readyState === "ended"), "уход с закладки кончает разговор, микрофон закрыт");
  await open(spkOwner, "view");
  await until(() => !q("[data-talk]").hidden);
  navigator.mediaDevices.getUserMedia = async () => { throw new Error("no"); };
  q("[data-talk]").click();
  ok(await until(() => /Микрофон не дан/.test(text("[data-talk-state]"))), "микрофон не дан: слова");
  navigator.mediaDevices.getUserMedia = gum;

  // Реле
  await open(cam, "view");
  await until(() => lv.tl && !lv.tl.busy && q("[data-relay] button"));
  const relay = q("[data-relay] button");
  const op = [];
  API.post = (p, b, h) => (/actions\/output$/.test(p) && op.push(b.params), post0(p, b, h));
  relay.click();
  ok(await until(() => op.length === 1 && op[0].state === true), "реле: замкнуть");
  q("[data-relay] button:nth-of-type(3)").click();
  ok(await until(() => op.length === 2 && op[1].pulseMs === 1000), "реле: импульс");
  API.post = post0;

  // Окна: только по кнопке, таймера нет
  const tlReads = () => reads.filter((p) => /\/timeline$/.test(p)).length;
  const r0 = tlReads();
  await sleep(5000);
  ok(tlReads() === r0, "таймера шкалы нет");
  q("[data-tl-win='24h']").click();
  ok(await until(() => lv.tl.win === "24h" && !lv.tl.busy && lv.tl.spans.length > 3), "окно сутки");
  ok(tlReads() === r0 + 1, "одно чтение на окно");
  ok(q("[data-tl-win='24h']").classList.contains("pri"), "окно подсвечено");
  ok(q("[data-tl-bar] .tl-s.fen") && q("[data-tl-bar] .tl-s:not(.fen)"), "отсечённый спан виден");
  ["6h", "all"].forEach((w) => ok(!!q(`[data-tl-win='${w}']`), "окно " + w));
  q("[data-tl-win='all']").click();
  ok(await until(() => lv.tl.win === "all" && !lv.tl.busy && lv.tl.from > 0 && lv.tl.spans.length > 20), "окно всё: края по спанам");

  // Проигрывание: кусок, сдвиг, следующий от конца поставленного
  const t = lv.tl, plain = t.spans.filter((s) => !s.fenced && !s.backupOnly && s.source === "live").at(-3);
  const at = plain.startMs + 90000;
  pbPlay(lv, at, plain.spanId, plain);
  ok(await until(() => lv.pb?.piece), "кусок получен");
  const p1 = lv.pb.piece;
  ok(p1.to - p1.from === 60000 && p1.from === plain.startMs + 60000, "кусок 60 с, в нём момент");
  ok(/assets\/stub-piece\.mp4/.test(liveEl.src), "элемент играет кусок");
  ok(/настоящей записи на стенде нет|На стенде нет настоящей записи/.test(text(".live-note")), "подпись: кусок подставной: " + text(".live-note"));
  ok(/Запись/.test(state()) && /эпоха 2/.test(state()), "подпись: интервал, эпоха: " + state());
  liveEl.dispatchEvent(new Event("ended"));
  ok(await until(() => lv.pb.piece !== p1), "следующий кусок по окончании");
  ok(lv.pb.piece.from === p1.to, "от конца поставленного");

  // Каждый момент один раз: две эпохи над одним отрезком
  const fen = t.spans.find((s) => s.fenced), twin = t.spans.find((s) => !s.fenced && s.startMs === fen.startMs);
  ok(pbNextSpan({ tl: t, pb: { chosen: null } }, fen.startMs + 1000).span === twin, "над моментом неотсечённая эпоха");
  ok(pbNextSpan({ tl: t, pb: { chosen: fen } }, fen.startMs + 1000).span === fen, "выбранный сам — играет отсечённый");
  const gapAt = twin.endMs + 1000;
  const after = pbNextSpan({ tl: t, pb: { chosen: null } }, gapAt);
  ok(after && after.at >= gapAt, "зазор: следующий спан");

  // Кусок не отдан: один повтор через 5 с с новым адресом, затем дальше
  stub.pieceFail = 2;
  const made = stub.pieces.length, p2 = lv.pb.piece;
  liveEl.dispatchEvent(new Event("ended"));
  ok(await until(() => stub.pieces.length === made + 1), "кусок не отдан: запрошен");
  ok(await until(() => /[пП]овтор через 5 с|повторит запрос через 5 с/.test(state())), "подпись о повторе: " + state());
  ok(await until(() => stub.pieces.length >= made + 2), "повтор с новым адресом");
  ok(stub.pieces[made] !== stub.pieces[made + 1], "адрес новый");
  ok(await until(() => stub.pieces.length >= made + 3), "не вышло — дальше");
  ok(Date.parse(lv.pb.piece.from ? new Date(lv.pb.piece.from) : 0) > p2.to, "очередь ушла вперёд");

  // Переход к моменту по событию и мимо записи
  await emit(cam.id, { text: "Сработка на шкале", source: "det", kind: "motion", occurredAt: new Date(plain.startMs + 600000).toISOString() });
  // Вариант «pos» в выборе есть, только если такое событие попало в окно: на стенде часы идут, набор журнала в окно может не попасть
  await emit(cam.id, { text: "Чек на шкале", source: "pos", kind: "text", occurredAt: new Date(plain.startMs + 660000).toISOString() });
  q("[data-tl-win='all']").click();
  ok(await until(() => !lv.tl.busy && /Сработка на шкале/.test(text("[data-tl]"))), "событие на шкале");
  ok(await until(() => ["det", "pos"].every((v) => [...document.querySelectorAll("[data-tl-source] option")].some((o) => o.value === v))), "фильтр по подсистеме");
  const sel1 = q("[data-tl-source]");
  sel1.value = "pos";
  sel1.dispatchEvent(new Event("change", { bubbles: true }));
  ok(sel1.value === "pos", "выбрана подсистема pos");
  ok(await until(() => !/Сработка на шкале/.test(text("[data-tl]")) && /Чек на шкале/.test(text("[data-tl]"))), "отбор по подсистеме");
  // Чтения внахлёст: поздний ответ без отбора отбор не затирает
  const jget = API.get;
  let late = null;
  API.get = (p, o) => { if (p === "/journal" && !o.source && !late) return new Promise((res, rej) => { late = () => jget(p, o).then(res, rej); }); return jget(p, o); };
  lv.tl.source = "";
  tlEvents(lv);
  ok(await until(() => late), "чтение без отбора задержано");
  tlSource("pos");
  ok(await until(() => !/Сработка на шкале/.test(text("[data-tl]"))), "отбор показан");
  late();
  API.get = jget;
  await sleep(100);
  ok(!/Сработка на шкале/.test(text("[data-tl]")), "поздний ответ без отбора отбор не затёр");
  const sel2 = q("[data-tl-source]");
  sel2.value = "";
  sel2.dispatchEvent(new Event("change", { bubbles: true }));
  ok(await until(() => /Сработка на шкале/.test(text("[data-tl]"))), "снова все");
  [...document.querySelectorAll("[data-tl] .tl-go")].find((x) => /Сработка/.test(x.textContent)).click();
  ok(await until(() => lv.pb?.piece?.from === plain.startMs + 600000), "переход к моменту события");
  pbPlay(lv, Date.now() + 864e5);
  ok(await until(() => /Записи на этот момент нет/.test(state())), "записи нет: слова");

  // Живое снимает архив, стоп снимает всё
  liveStart();
  ok(await until(() => lv.sess, 60000) && !lv.pb && !liveEl.hasAttribute("src"), "живое снимает кусок");
  liveStop();

  // Недоступное словами
  const gone = lv.tl.gone;
  lv.tl.gone = [{ what: "volume", id: "t7@s2", reason: "том без держателя" }];
  viewFill();
  ok(/Том «t7@s2»: том без держателя/.test(text("[data-tl-gone]")), "недоступное названо");
  lv.tl.gone = gone;
  viewFill();

  // Закрепить: минуты только в резервном
  const fix = q("[data-tl-fix]");
  ok(!!fix, "кнопка «Закрепить»");
  fix.click();
  ok(await until(() => /Подано просьб: 1/.test(document.body.textContent)), "подано словами");

  // Отметка
  const mk = q("[data-mark-note]");
  mk.value = "Подозрительно";
  q("[data-mark-add]").click();
  ok(await until(() => /Подозрительно/.test(text("[data-marks]"))), "отметка на месте");
  ok(!!q("[data-tl-bar] .tl-m"), "отметка на шкале");
  pbPlay(lv, plain.startMs + 120000, plain.spanId, plain);
  await until(() => lv.pb?.piece);
  const mk2 = q("[data-mark-note]");
  mk2.value = "На прошлом моменте";
  q("[data-mark-add]").click();
  ok(await until(() => lv.marks.some((m) => m.note === "На прошлом моменте" && Date.parse(m.occurred) >= plain.startMs + 120000 && Date.parse(m.occurred) < plain.startMs + 180000)), "отметка на моменте просмотра");
  liveStop();

  // Удержание: окно, заметка, записи; то же окно — объединение; снять с числом
  q("[data-hold-add]").click();
  ok(await until(() => document.getElementById("holdFrom")), "окно удержания");
  ok(document.getElementById("holdFrom").value && document.getElementById("holdNote"), "окно по показанному");
  document.getElementById("holdNote").value = "Инцидент 1";
  const first = document.querySelector(".hold-rec");
  ok(!!first, "записи камеры на выбор");
  // Сняты все галочки: пустой список значил бы все записи камеры, поэтому запроса нет. Настоящей мышью
  const clickEl = (e) => ["mousedown", "mouseup", "click"].forEach((type) => e.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })));
  const okBtn = document.getElementById("confirmOk"), holdPosts = [], postWas = API.post;
  API.post = (p, ...r) => { if (/\/holds$/.test(p)) holdPosts.push(r[0]); return postWas(p, ...r); };
  document.querySelectorAll(".hold-rec").forEach(clickEl);
  ok(!document.querySelector(".hold-rec:checked") && okBtn.disabled, "галочки сняты: «Удержать» недоступна");
  ok(/пустой список значит все записи камеры|Пустой список означает все записи камеры/.test(okBtn.title), "подсказка почему: " + okBtn.title);
  clickEl(okBtn);
  ok(!holdPosts.length && document.getElementById("holdFrom"), "запроса нет, окно на месте");
  document.querySelectorAll(".hold-rec").forEach(clickEl);
  ok(!okBtn.disabled && !okBtn.title, "галочки вернулись: кнопка доступна");
  API.post = postWas;
  const fromV = document.getElementById("holdFrom").value, toV = document.getElementById("holdTo").value;
  await confirmWith(null);
  ok(await until(() => lv.holds?.length === 1), "удержание в списке");
  ok(/Инцидент 1/.test(text("[data-holds]")) && /держится здесь/.test(text("[data-holds]")), "заметка, состояние словами");
  const hold = lv.holds[0];
  ok(hold.id.startsWith(cam.id) && hold.by, "ключ, кто поставил");
  q("[data-hold-add]").click();
  await until(() => document.getElementById("holdFrom"));
  document.getElementById("holdFrom").value = fromV;
  document.getElementById("holdTo").value = toV;
  document.getElementById("holdNote").value = "Другая";
  await confirmWith(null);
  await sleep(300);
  ok(await until(() => lv.holds.length === 1 && lv.holds[0].note === "Инцидент 1"), "то же окно: заметка цела");
  q("[data-hold-verify]").click();
  ok(await until(() => /цело/.test(text("[data-hold-result]"))), "«Проверить» словами");
  q("[data-hold-del]").click();
  ok(await until(() => document.getElementById("confirmCountInp")), "снять: ввод числа");
  ok(/срок/.test(document.getElementById("confirmMsg").textContent), "предупреждение о сроке");
  await confirmWith(1);
  ok(await until(() => lv.holds.length === 0), "снято");

  // Предупреждение о томе incidents
  const v = lv;
  await until(() => v.noHolder === false || v.noHolder === true);
  ok(v.noHolder === false && !q("[data-hold-warn]"), "держатель есть: предупреждения нет");
  // Первая страница отбора пустая при живом nextCursor (ограниченный проход большого домена): держатель всё равно найден
  const realGet = API.get;
  API.get = function (path, params) {
    const archQ = path === "/units" && params && (params.implements === "vms.archive/1" || /archive\.incidents/.test(params.kind || ""));
    if (archQ && !params.cursor) return Promise.resolve({ items: [], nextCursor: "ui-view-empty" });
    if (archQ && params.cursor === "ui-view-empty") { const p = Object.assign({}, params); delete p.cursor; return realGet.call(this, path, p); }
    return realGet.call(this, path, params);
  };
  try {
    v.noHolder = undefined;
    await holdsHolder(v);
    ok(v.noHolder === false, "держатель найден, хотя первая страница пустая с nextCursor");
  } finally { API.get = realGet; }
  v.noHolder = true;
  viewFill();
  ok(/только пока его хранит архив записи|только пока архив записи хранит видео/.test(text("[data-hold-warn]")), "нет держателя: предупреждение");
  // Потеря удержанного не молчит, под угрозой — слабее
  const incVols = (await Promise.all((await API.get("/units", { implements: "vms.archive/1", limit: 1000 })).items.filter((a) => archHoldKinds().includes(a.kind)).slice(0, 5).map((a) => uiRecs({ kind: "volume", parentId: a.uid })))).flat();
  if (incVols.some((x) => x.incidentsLost)) {
    ok(/потерял удержанное: 1 удержание, 7 мин записи перезаписано кольцом/.test(text("[data-hold-lost]")), "потеря: " + text("[data-hold-lost]"));
    ok(q("[data-hold-lost]").classList.contains("nt") && /Под угрозой на томе инцидентов: 1 удержание/.test(text("[data-hold-risk]")), "под угрозой: " + text("[data-hold-risk]"));
    ok(!q("[data-hold-risk]").classList.contains("nt"), "под угрозой слабее потери");
  }
  v.holdLost = null;
  v.holdRisk = 0;
  viewFill();
  ok(!q("[data-hold-lost]") && !q("[data-hold-risk]"), "потерь нет: слов нет");

  // Камера другого кластера: чтение есть, запись — отказ словами. Уход закрывает всё
  API.get = get0;
  goTab("gen");
  ok(!lv, "уход с закладки");
});
