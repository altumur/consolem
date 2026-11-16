/* Мета-детектор, стоп-кадр при рисовании зоны, несовместимые семейства детекторов лиц (пробелы C28,
   CX3, C29 против Axxon One). Окно мета-детектора: три запроса на любом языке, счётчик и предупреждение без запроса,
   границы полей, «Поиск по описаниям кадров»; у мета-детектора нет зон и стоп-кадра. Окно детектора движения:
   «Стоп-кадр» останавливает время превью, «Зоны» скрывает зоны, стоп-кадр не переходит в окно другого детектора.
   Детекторы лиц TV и VA: плашка о конфликте, переключатель и групповое «Включить» не включают детектор лиц TV.
   Мастер «Добавить детекторы»: виды аналитики, причина у недоступного семейства, «мешает» у камеры, стоп-кадр
   на шаге «Зоны» ставит видео на паузу, «Скрыть зону» недоступна во время рисования.
   Данные — заглушка (в контракте 0.13.0 видов meta, faceTV, faceVA нет; запрос api/requests/2026-11-16-142236Z-mockup-meta-detector-face-families-request.md).
   На странице без мета-детектора (старые копии) сценарий только отмечает, что проверять нечего.
   Запуск: python3 tools/check_ui.py tests/ui-meta-stopkadr-semeystva.js */
UiCheck(async ({ ok, until, sleep }) => {
  if (typeof metaPanelHtml !== "function") { ok(true, "мета-детектора на этой странице нет: проверять нечего"); return; }
  const META = "30000044-0072-4000-8000-000000000001"; // «Мета-детектор» на «16. Склад офиса»
  const VA = "30000013-0072-4000-8000-000000000002"; // «Лица VA» на «1. Главный вход»
  const TV = "30000043-0072-4000-8000-000000000003"; // «Лица TV» на «2с. Переговорная», выключен
  const MOTION = "30000016-0000-4000-8000-000000000000";
  const main = () => document.getElementById("main");
  const R = () => document.getElementById("dwRight");
  const show = async (id) => { goApp("hw"); await hwEnsure([id]); pick(id); return await until(() => main().querySelector(`[data-dw="${id}"]`)); };
  const input = (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };

  // ── Мета-детектор ──
  ok(await show(META), "окно мета-детектора открыто");
  ok(dwKindOf(find(META).n) === "meta", "вид окна — meta");
  const qs = () => [...R().querySelectorAll(".mq-row input")];
  ok(qs().length === 3, "три поля запроса");
  ok(qs()[0].value === "Fallen human" && qs()[2].value === "", "запросы из объекта: два заполнены, третий пуст");
  ok(/2 из 3/.test(R().querySelector("[data-meta-n]").textContent), "счётчик «2 из 3»");
  ok(R().querySelector("[data-meta-none]").hidden, "с запросом предупреждения нет");
  ok(/на любом языке/.test(R().textContent), "подсказка: запрос на любом языке");
  qs().forEach((el) => input(el, ""));
  ok(!R().querySelector("[data-meta-none]").hidden && /0 из 3/.test(R().querySelector("[data-meta-n]").textContent), "без запроса — «0 из 3» и предупреждение");
  const q0 = qs()[0];
  input(q0, "Упавший человек у полки");
  ok(R().querySelector("[data-meta-none]").hidden && qs()[0] === q0, "запрос на русском принят, поле не перерисовано");
  ok(!R().querySelector(".mq-cyr, .mq-lang"), "нет ни метки EN, ни предупреждения о языке");
  // Границы полей
  metaSet(META, "metaFrames", "5");
  ok(META_DRAFT[META].metaFrames === 15, "5 кадров подряд вне границ 10–100: значение не меняется");
  const fr = [...R().querySelectorAll('input[type="number"]')][0];
  fr.value = "500"; fr.dispatchEvent(new Event("change", { bubbles: true }));
  ok(META_DRAFT[META].metaFrames === 100 && fr.value === "100", "при уходе из поля 500 становится 100");
  ok([...R().querySelectorAll('input[type="number"], input[type="range"]')].every((el) => el.checkValidity()), "значения по умолчанию проходят проверку полей");
  // Поиск по описаниям кадров
  ok(!!R().querySelector('[data-meta-out="metaDiff"]'), "сохранение описаний включено: порог отличия виден");
  metaSet(META, "metaSearch", "");
  await until(() => !R().querySelector('[data-meta-out="metaDiff"]'));
  ok(R().querySelector(".mq-sub.off"), "сохранение описаний выключено: вложенные настройки недоступны");
  ok(R().querySelector(".mq-row input").value === "Упавший человек у полки", "перерисовка окна сохранила запрос");
  metaSet(META, "metaSearch", "");
  // У мета-детектора нет зон и стоп-кадра
  ok(!main().querySelector(".dw-tools button") && !main().querySelector(".dw-frz"), "у мета-детектора нет кнопок зон и стоп-кадра");

  // ── Стоп-кадр в окне детектора ──
  ok(await show(MOTION), "окно детектора движения открыто");
  ok(!!main().querySelector(".dw-frz") && !dw.freeze, "есть кнопка «Стоп-кадр», видео идёт");
  dwFreeze();
  const t0 = dw.T; await sleep(400);
  ok(dw.T === t0 && /Стоп-кадр/.test(main().querySelector("[data-dw-tag]").textContent), "стоп-кадр: время превью стоит, метка «Стоп-кадр»");
  dwLay("geo");
  ok(main().querySelector(".dw-stage").classList.contains("geo-off") && getComputedStyle(main().querySelector("[data-dw-geo]")).display === "none", "«Зоны» скрывает зоны на кадре");
  dwTool("in");
  ok(!main().querySelector(".dw-stage").classList.contains("geo-off"), "во время рисования зоны видны");
  dwTool("in"); dwLay("geo");
  ok(await show(TV), "окно детектора лиц TV открыто");
  ok(!dw.freeze, "стоп-кадр не перешёл в окно другого детектора");

  // ── Несовместимые семейства ──
  ok(/Детектор нельзя включить/.test(R().querySelector(".fam-nt")?.textContent || ""), "лица TV: плашка «Детектор нельзя включить»");
  ok(/Лица VA/.test(R().querySelector(".fam-nt").textContent), "плашка ссылается на детектор лиц VA");
  detEnable(TV);
  ok(find(TV).n.enabled === false, "переключатель не включает детектор лиц TV");
  ok(await show(VA), "окно детектора лиц VA открыто");
  ok(/Второй детектор нельзя включить/.test(R().querySelector(".fam-nt")?.textContent || ""), "лица VA: плашка о выключенном детекторе лиц TV");
  // Групповое «Включить»
  bulkFamSkip = 0;
  ok(bulkChanges({ enabled: "on" }, [find(TV).n]).length === 0 && bulkFamSkip === 1, "групповое «Включить» пропускает детектор лиц TV");

  // ── Мастер «Добавить детекторы» ──
  goApp("hw"); detCreateOpen();
  ok(await until(() => dc && dc.ready), "мастер открыт");
  const box = () => document.querySelector("#bmodal.open .dc-box");
  const row = (re) => [...box().querySelectorAll(".cp-det")].find((l) => re.test(l.querySelector(".cp-det-nm")?.firstChild?.textContent || ""));
  ok(detAkOn("meta") && !detAkOn("нет-такого"), "вид аналитики есть, только если схема det его знает");
  ok(row(/^Мета-детектор$/) && !row(/^Мета-детектор$/).classList.contains("dc-off"), "вид «Мета-детектор» доступен");
  ok(row(/^Лица TV$/)?.classList.contains("dc-off") && /Нельзя вместе с «Лица VA»/.test(row(/^Лица TV$/).textContent), "«Лица TV» недоступен, причина видна в строке");
  const cam = detCams().find((c) => c.id === "30000013-0000-4000-8000-000000000000");
  ok(dcWhy(cam, "a:faceVA") === i18n("уже есть"), "у камеры с детектором лиц VA — «уже есть»");
  dcItemToggle("a:meta", true);
  dcCamToggle(cam.id, true);
  dcStepGo(dcSteps().findIndex((x) => x.k === "zones"));
  ok(await until(() => box()?.querySelector(".dc-z-frz")), "шаг «Зоны»: кнопки стоп-кадра");
  const hide = () => [...box().querySelectorAll(".dc-z-frz .btn")][1];
  if (zoneDraw) ok(hide().disabled, "во время рисования «Скрыть зону» недоступна");
  zoneDraw = null; renderDetCreate();
  ok(!hide().disabled, "без рисования «Скрыть зону» доступна");
  dcFrz();
  await sleep(600);
  const v = box().querySelector(".live-frame video");
  ok(!v || v.paused, "стоп-кадр ставит видео кадра на паузу, и видео, которое пришло позже, тоже стоит");
  ok(/Стоп-кадр/.test(box().querySelector(".lf-frz-tag")?.textContent || ""), "на кадре метка «Стоп-кадр»");
  dcFrz(); dcCancel?.();
});
