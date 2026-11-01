/* Сценарии интерфейса: ассистент. Запуск — tools/check_ui.py. */
UiCheck(async ({ ok, until }) => {
  ok(getComputedStyle(document.getElementById("hdAssist")).display !== "none", "кнопка ассистента видна");
  const camId = (await API.get("/devices")).items.find((d) => d.type === "camera" && d.name.includes("Главный вход")).id;
  const before = (await API.get(`/devices/${camId}`)).recordMode;
  const say = (t) => { asst.text = t; document.getElementById("asstSend").click(); };
  const body = () => document.getElementById("bmBody").textContent;

  // Вопрос и ответ
  asstOpen();
  ok(document.getElementById("bmodal").classList.contains("open"), "окно ассистента открыто");
  say("выключи запись");
  ok(await until(() => document.getElementById("asstAsk")), "ассистент спросил");
  // Ответ строит план, без «Применить» ничего не записано
  say("Главный вход");
  ok(await until(() => document.getElementById("asstApply")), "план показан");
  ok(/Камеры: \d+/.test(body()) && body().includes("recordMode"), "кого выбрали и что меняется");
  ok((await API.get(`/devices/${camId}`)).recordMode === before, "без «Применить» ничего не записано");
  // Применить, итог по устройствам, отменить
  document.getElementById("asstApply").click();
  ok(await until(() => /применено/.test(body())), "итог по устройствам");
  ok((await API.get(`/devices/${camId}`)).recordMode === "none", "записано на сервере");
  ok(await until(() => find(camId)?.n.rec === "none"), "дерево обновилось потоком");
  document.getElementById("asstUndo").click();
  ok(await until(() => !document.getElementById("asstUndo")), "отмена выполнена");
  ok(await until(() => find(camId)?.n.rec === before), "значение вернулось");

  // Отказ: без плана
  say("поменяй маску сети");
  ok(await until(() => document.getElementById("asstRefused")), "отказ показан");
  ok(!document.getElementById("asstApply"), "плана нет");
  // Устаревший план: строка failed и «Спросить заново»
  closeBulkModal();
  asstOpen();
  say("выключи запись Главный вход");
  ok(await until(() => document.getElementById("asstApply")), "новый план");
  const d = await API.get(`/devices/${camId}`);
  await API.patch(`/devices/${camId}`, { name: d.name + " 2" }, d.version);
  document.getElementById("asstApply").click();
  ok(await until(() => document.getElementById("asstAgain")), "устройство изменилось — предложено спросить заново");
  // Закрыть окно — отменить ход
  closeBulkModal();
  ok(asst === null, "разговор закрыт, секреты забыты");
});
