/* Сценарии интерфейса: опции, лицензии, журнал. Запуск — tools/check_ui.py. */
UiCheck(async ({ ok, until }) => {
  // Опции: значение сохраняется при смене
  goApp("sys");
  sys = "ntp";
  paint();
  settingSet("ntp.server", "time.local");
  ok(await until(() => SETTINGS.find((s) => s.id === "ntp.server").value === "time.local"), "сервер времени изменён");
  settingSet("sec.2fa", "Обязательно админам");
  ok(await until(() => SETTINGS.find((s) => s.id === "sec.2fa").value === "Обязательно админам"), "2FA изменена");
  const st = await API.get("/settings");
  ok(st.values["ntp.server"] === "time.local" && st.values["sec.2fa"] === "admins", "на сервере — кодом: " + st.values["sec.2fa"]);
  sys = "lic";
  paint();
  ok(/48\/64/.test(document.body.textContent), "лицензии с сервера");
  // Журнал
  goApp("log");
  ok(LOG_ROWS.length === 25 && /^\d\d:\d\d$/.test(LOG_ROWS[0][0]), "журнал с сервера: " + LOG_ROWS.length + ", первое в " + LOG_ROWS[0][0]);
  ok(LOG_BY_CAT.alarm.length > 0 && LOG_BY_CAT.alarm.every((x) => x[1] === "Тревога"), "по категориям");
  // Хранение: сроки событий и тревог; ключа нет у сервера — поля нет
  sys = "keep";
  goApp("sys");
  ok(!!document.querySelector('[data-set="events.retentionDays"]') && !!document.querySelector('[data-set="alarms.retentionDays"]'), "страница «Хранение»");
  settingSet("events.retentionDays", "30");
  ok(await until(() => SETTINGS.find((x) => x.id === "events.retentionDays").value === "30"), "значение пришло с сервера");
  ok((await API.get("/settings")).values["events.retentionDays"] === 30, "на сервере — число");
  const al = SETTINGS.find((x) => x.id === "alarms.retentionDays"), keep = al.value;
  al.value = undefined;
  sysUI();
  ok(!document.querySelector('[data-set="alarms.retentionDays"]'), "ключа нет у сервера — поля нет");
  al.value = keep;
});
