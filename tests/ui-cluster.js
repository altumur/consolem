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
  await API.put(`/devices/${cam.id}/recording-target`, { serverId: null, copies: 1 });
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
