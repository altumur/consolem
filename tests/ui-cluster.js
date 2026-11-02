/* Сценарий интерфейса: домен шире кластера — приём с отпечатком, камера без закреплённого сервера, приёмник записи, камера за NAT, домен без серверов. */
UiCheck(async ({ ok, until, confirmWith }) => {
  const d = domains[0];
  goApp("hw");
  // Приём: сверка отпечатка до «Добавить»
  const knock = d.unallocServers.find((s) => s.fingerprint && s.cls !== "camera");
  const done = addToDomain(knock.id, d.id);
  ok(document.getElementById("fpShown")?.textContent === knock.fingerprint, "окно показывает отпечаток");
  ok(!d.servers.includes(knock), "до подтверждения не принят");
  await confirmWith(null);
  ok(await until(() => d.servers.some((s) => s.id === knock.id)), "принят после сверки");
  await done;
  ok((await API.get("/servers/" + knock.id)).allocated === true, "на сервере");
  // Камера: где serverId только для чтения, архив выбирается без оглядки на сервер, сервер не закрепляется
  const cam = devicePool.find((n) => n.type === "camera" && n.srvId && n.arch);
  ok(archReach(cam).length < arch.length, "сервер объявлен настройкой: выбор ограничен им");
  const was = cam.writableFields;
  cam.writableFields = (CAPS.writable.camera || []).filter((x) => x !== "serverId");
  ok(archReach(cam).length === arch.length, "serverId только для чтения: выбор зависит только от вида");
  const free = { type: "camera", id: "x", writableFields: cam.writableFields };
  pinCamServer(free);
  bindArchServer(free);
  ok(!free.srvId, "сервер не закреплён");
  // Приёмник записи — на вкладке «Архив»
  pick(cam.id, { force: true });
  goTab("rec");
  ok(!!document.getElementById("recTarget"), "выбор приёмника на вкладке «Архив»");
  const server = d.servers.find((s) => s.online !== false && s.id !== cam.srvId);
  recTargetSet(cam.id, server.id);
  ok(await until(() => cam.recordingTarget?.serverId === server.id), "назначение в кэше");
  ok((await API.get("/devices/" + cam.id)).recordingTarget.serverId === server.id, "на сервере");
  await API.put(`/devices/${cam.id}/recording-target`, { serverId: null, copies: [] });

  // Копии: выбираются серверами явно, мышью, поиском среди /servers; занятый кластер не предлагается, и это сказано
  const press = (e) => ["mousedown", "mouseup", "click"].forEach((type) => e.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })));
  const named = (name) => d.servers.find((s) => s.name === name);
  const office = named("Центр/Сервер — Офис"), hall = named("Центр/Сервер — Цех"), hangar = named("Склады/Сервер — Ангар"), gate = named("Склады/Сервер — КПП"), park = named("Периметр/Сервер — Парковка");
  const rec = () => API.get("/devices/" + cam.id).then((x) => x.recordingTarget);
  const typeQ = (v) => { const i = document.getElementById("recCopyQ"); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); };
  const pickBtn = (s) => document.querySelector(`[data-rec-pick="${s.id}"]`);
  const copyRows = () => [...document.querySelectorAll("[data-rec-copy]")].map((x) => x.dataset.recCopy);
  // Камера набора со своим сервером: запись с сервера вернула бы ей writableFields, а карточка приёмника — у камеры без него
  const pinned = window.serverPinned;
  window.serverPinned = () => false;
  await API.put(`/devices/${cam.id}/recording-target`, { serverId: null, copies: [] }).then((r) => { hwApplyDevice(r); gear(); });
  ok(!document.getElementById("recCopies"), "нет приёмника — копий нет");
  await recTargetSet(cam.id, office.id);
  ok(await until(() => document.getElementById("recCopyQ")), "приёмник назначен — выбор копий на месте");
  ok(document.getElementById("recNoCopies"), "копий нет — словами");
  ok(/кластер Центр/.test(document.getElementById("recTarget").selectedOptions[0].textContent), "кластер рядом с сервером: " + document.getElementById("recTarget").selectedOptions[0].textContent);
  ok(/Назначение держит кластер «Центр»/.test(document.getElementById("recCluster").textContent), "кто держит назначение, словами");
  ok(!pickBtn(hall) && !pickBtn(office), "свой кластер не предлагается");
  ok(/занятых кластеров: «Центр»/.test(document.getElementById("recCopyTaken").textContent), "словами: " + document.getElementById("recCopyTaken").textContent);
  const inputKept = document.getElementById("recCopyQ");
  typeQ("ангар");
  ok(document.getElementById("recCopyQ") === inputKept, "поиск не перерисовывает поле");
  ok(pickBtn(hangar) && !pickBtn(park), "поиск сужает список");
  press(pickBtn(hangar));
  ok(await until(() => copyRows().join() === hangar.id), "копия выбрана мышью");
  ok((await rec()).copies.join() === hangar.id, "на сервере");
  ok(document.getElementById("recCopyQ").value === "", "поиск очищен");
  ok(!pickBtn(gate), "второй сервер кластера копии не предлагается");
  ok(/«Склады»/.test(document.getElementById("recCopyTaken").textContent), "занятый копией кластер назван");
  ok(![...document.getElementById("recTarget").options].some((o) => o.value === gate.id), "в приёмнике сервер кластера копии не предлагается");
  ok(/занятых копиями: «Склады»/.test(document.getElementById("recMainTaken").textContent), "и это сказано");
  typeQ("парковка");
  press(pickBtn(park));
  ok(await until(() => copyRows().join() === [hangar.id, park.id].join()), "вторая копия");
  press(document.querySelector(`[data-rec-copy="${park.id}"] [data-rec-up]`));
  ok(await until(() => copyRows().join() === [park.id, hangar.id].join()), "порядок меняется");
  ok((await rec()).copies.join() === [park.id, hangar.id].join(), "порядок на сервере");
  // Смена приёмника копии не теряет
  await recTargetSet(cam.id, hall.id);
  ok(await until(() => cam.recordingTarget?.serverId === hall.id) && (await rec()).copies.length === 2, "смена приёмника копии сохранила");
  // Отказ сервера — тостом, копии как были. Форма занятого не предлагает, отказ — на случай чужой правки
  const put0 = API.put;
  API.put = () => Promise.reject({ status: 422, problem: { code: "VALIDATION_FAILED", field: "copies" } });
  await recCopyDrop(cam.id, 0);
  API.put = put0;
  ok(copyRows().length === 2, "отказ: копии как были");
  press(document.querySelector(`[data-rec-copy="${park.id}"] [data-rec-drop]`));
  ok(await until(() => copyRows().join() === hangar.id), "копия убрана");
  // На чтении вернулся другой сервер того же кластера: это не чужая правка
  const recBefore = await API.get("/devices/" + cam.id);
  hwApplyDevice(Object.assign({}, recBefore, { recordingTarget: { serverId: office.id, copies: [gate.id] } }));
  gear();
  ok(await until(() => document.getElementById("recTarget")?.value === office.id), "показан сервер, что вернулся");
  ok(!/изменил|Изменено другим/i.test(document.getElementById("tt")?.textContent || "") && !cardDraft, "чужой правкой не считается");
  ok(/кластер Склады/.test(document.querySelector(`[data-rec-copy="${gate.id}"]`).textContent), "у копии кластер рядом с сервером");
  await API.put(`/devices/${cam.id}/recording-target`, { serverId: null, copies: [] }).then((r) => { hwApplyDevice(r); gear(); });
  window.serverPinned = pinned;
  cam.writableFields = was;
  if (was === undefined) delete cam.writableFields;
  // Камера за NAT: кнопки движения выключены, пресет можно
  const ptz = devicePool.find((n) => n.type === "camera" && n.ptz && n.online !== false);
  ptz.direct = false;
  pick(ptz.id, { force: true });
  await until(() => !ptz._row);
  ptz.direct = false;
  ok(/disabled/.test(ptzCardHtml(ptz).split('data-ptz="0"')[1].slice(0, 200)), "движение выключено");
  delete ptz.direct;
  // Домен без серверов: конфигуратор на самой камере
  const list = d.servers, un = d.unallocServers;
  d.servers = [];
  d.unallocServers = [];
  pick(d.id, { force: true });
  goTab("topo");
  ok(G7.g.nodes.length === 1 && /нет серверов/.test(document.getElementById("g7Empty")?.textContent || ""), "домен без серверов: один узел и слова");
  renderTree();
  ok(!!document.querySelector(`#tree .n[data-pick="${d.id}"]`), "дерево выдержало");
  goTab("gen");
  d.servers = list;
  d.unallocServers = un;
  // Отказ словами
  ok(/другого кластера/.test(problemText({ problem: { code: "OTHER_CLUSTER", params: { url: "x" } } })), "другой кластер: словами");
  ok(/не отвечает/.test(problemText({ problem: { code: "DEVICE_OFFLINE" } })), "камера не отвечает, а не сервер");
});
