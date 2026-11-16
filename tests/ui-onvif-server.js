/* Сценарии интерфейса: карточка «ONVIF-сервер» на вкладке «Веб, RTSP, ONVIF» сервера (пробел A21, из прототипа 75).
   Порт и флажок — заглушка в памяти страницы до ответа на запрос 2026-11-16-141022Z-mockup-onvif-server-request.md:
   на сервер они не уходят. Плитка на «Общих», адрес для другой VMS, порт с ошибками у поля и запрет плана, строка плана
   и слова предупреждения для нового порта и выключения, «Применить» и «Сбросить», неверный порт при выключенном
   ONVIF-сервере, камеры с MJPEG и переход к камере. Запуск — tools/check_ui.py */
UiCheck(async ({ ok, until }) => {
  const id = (n) => `${n}-0000-4000-8000-000000000000`;
  const S = id(20000002);
  const main = () => document.getElementById("main");
  const card = () => main().querySelector("[data-onvif-addr]")?.closest(".card");
  const err = () => main().querySelector('[data-web-err="onvif"]')?.textContent || "";
  const modal = () => document.getElementById("bmodal")?.classList.contains("open");
  const type = (v) => { const el = document.getElementById("web-onvif"); el.value = v; el.dispatchEvent(new Event("input")); el.dispatchEvent(new Event("change")); };
  const rows = () => cardDiff().map((r) => `${r.label}: ${r.fromT} → ${r.toT}`);
  const planNote = () => document.querySelector("#bmBody [data-plan-onvif]")?.textContent.replace(/\s+/g, " ").trim() || "";
  const apply = () => [...document.querySelectorAll("#bmFoot button")].find((b) => /Применить/.test(b.textContent)).click();

  goApp("hw");
  pick(S, { force: true });
  goTab("gen");
  ok(await until(() => main().querySelector("[data-web-tile]")), "плитка «Веб, RTSP, ONVIF» на «Общих»");
  ok(/Веб, RTSP, ONVIF/.test(main().querySelector("[data-web-tile]").textContent) && /ONVIF 8081/.test(main().querySelector("[data-web-tile]").textContent), "плитка: имя вкладки и порт ONVIF — " + main().querySelector("[data-web-tile]").textContent);
  main().querySelector("[data-web-tile]").click();
  ok(await until(() => tab === "web" && card()), "плитка открывает вкладку с карточкой «ONVIF-сервер»");
  ok(main().querySelector(".tab.on")?.textContent === "Веб, RTSP, ONVIF", "вкладка называется «Веб, RTSP, ONVIF»");
  ok(/10\.20\.2\.10:8081/.test(main().querySelector("[data-onvif-addr]").textContent), "адрес для другой VMS — IP:8081");
  ok(/Drivers Pack 3\.74 или новее/.test(card().textContent), "строка о Drivers Pack 3.74");
  ok(await until(() => /нет камер с кодеком MJPEG/.test(main().querySelector("[data-onvif-mjpeg]")?.textContent || "")), "камер с MJPEG нет — карточка так и говорит");

  // Камеры с MJPEG: кодек задан на вкладке «Видео» (заглушка cvCfg) — предупреждение и ссылка на камеру
  const cams = ONVIF_MJ.get(S)?.cams || [];
  ok(cams.length > 0, "консоль получила камеры сервера: " + cams.length);
  const cam = cams[0];
  cvCfg.set(cam.uid, { streams: { main: { codec: "MJPEG" } } });
  paint();
  ok(await until(() => /кодек MJPEG/.test(main().querySelector("[data-onvif-mjpeg]")?.textContent || "")), "предупреждение о камере с MJPEG");
  main().querySelector(".onvif-mj button").click();
  ok(await until(() => sel === cam.uid && tab === "vid"), "ссылка открывает камеру на вкладке «Видео»");
  cvCfg.delete(cam.uid);
  pick(S, { force: true });
  goTab("web");
  ok(await until(() => card()), "назад к карточке сервера");

  // Порт: повтор с RTSP — ошибка у поля, план не открывается
  type("554");
  ok(/уже занимает поле «Порт RTSP»/.test(err()), "порт как у RTSP — ошибка у поля: " + err());
  cardPlan();
  ok(!modal(), "с ошибкой план не открывается");
  type("70000");
  ok(/от 1 до 65535/.test(err()), "порт вне 1–65535 — ошибка: " + err());
  ok(/нет порта/.test(main().querySelector("[data-onvif-badge]").textContent), "неверный порт: в заголовке «нет порта», адреса нет");

  // Новый порт: строка плана, перезапуск и новый адрес, заглушка; «Применить» оставляет порт только в странице
  type("8090");
  ok(!err() && rows().length === 1 && /ONVIF-сервер: Порт: 8081 → 8090/.test(rows()[0]), "план: " + rows().join(", "));
  cardPlan();
  ok(await until(() => modal() && planNote()), "план открыт");
  ok(/перезапустит ONVIF-сервер/.test(planNote()) && /10\.20\.2\.10:8090/.test(planNote()), "предупреждение: перезапуск и новый адрес — " + planNote());
  ok(!!document.querySelector("#bmBody [data-plan-stub-onvif]"), "план говорит, что ONVIF-сервер — заглушка");
  apply();
  ok(await until(() => bq && bq.finished) && bq.fail === 0, "применено без отказов");
  closeBulkModal();
  ok(ONVIF_SRV.get(S)?.onvif === 8090, "после «Применить» порт 8090 остался в странице");
  ok(!("onvifPort" in ((await API.get(`/units/${S}`)).properties.webServer || {})), "на сервер порт не ушёл");
  pick(S, { force: true });
  goTab("web");
  ok(await until(() => document.getElementById("web-onvif")?.value === "8090"), "поле после «Применить» — 8090");

  // Выключение: свои слова в плане; «Сбросить» возвращает флажок и не трогает сохранённое
  webToggle(S, "onvifOn");
  ok(rows().length === 1 && /ONVIF-сервер: включён → выключен/.test(rows()[0]), "план: " + rows().join(", "));
  cardPlan();
  ok(await until(() => modal() && planNote()), "план открыт");
  ok(/выключит ONVIF-сервер/.test(planNote()) && !/Новый адрес/.test(planNote()), "предупреждение о выключении без нового адреса — " + planNote());
  closeBulkModal();
  cardReset();
  ok(await until(() => document.querySelector('[data-web-cb="onvifOn"]')?.checked === true), "«Сбросить»: флажок снова включён");
  ok(ONVIF_SRV.get(S)?.onvifOn === true && ONVIF_SRV.get(S)?.onvif === 8090, "«Сбросить» не меняет сохранённые значения");

  // Неверный порт при выключенном ONVIF-сервере в план не идёт
  type("99999");
  webToggle(S, "onvifOn");
  ok(rows().length === 1 && !rows().some((r) => /Порт/.test(r)), "выключен и порт неверный: в плане только выключение — " + rows().join(", "));
  cardReset();
  ONVIF_SRV.delete(S);
});
