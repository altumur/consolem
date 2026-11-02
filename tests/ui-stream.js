/* Сценарий интерфейса: поток при двух экземплярах консоли, ADR-0112 доп. (12) п. 2. PUT наблюдения пришёл не туда — 404:
   форма переоткрывает поток со списком в запросе и перечитывает кэш. На стенде второй экземпляр настоящий,
   POST /test/stream-elsewhere, на встроенном сервере служебных операций нет, 404 подставляется. Запуск — tools/check_ui.py. */
UiCheck(async ({ ok, until, sleep }) => {
  goApp("hw");
  ok(await until(() => streamClient), "поток открыт");
  const onStand = (await API.raw("POST", "/test/stream-elsewhere")).status === 204;
  const realPut = API.put;
  const puts = [];
  let refuse = onStand ? 0 : 404;
  API.put = (path, body, v) => {
    if (!/^\/stream\//.test(path)) return realPut(path, body, v);
    puts.push({ path, ids: body.ids });
    if (refuse) { const status = refuse; refuse = 0; return Promise.reject({ status, problem: { code: status === 404 ? "NOT_FOUND" : "UPSTREAM_UNAVAILABLE" } }); }
    return realPut(path, body, v);
  };
  let reopened = null;
  const realReopen = apiStream.reopen;
  apiStream.reopen = (ids) => { reopened = ids; realReopen(ids); };
  const cams = (await uiDevices()).filter((d) => d.type === "camera");
  const client0 = streamClient;

  // 404: новый поток со списком в запросе, кэш перечитан, полный перечень нет
  window.CONSOLEM_TRACE = [];
  pick(cams[0].id);
  watchLast = "";
  watchSoon();
  ok(await until(() => reopened), "404 — поток переоткрыт");
  ok(reopened.includes(cams[0].id) && reopened.length <= LIM.watchMax, "открытая карточка в списке запроса");
  ok(await until(() => streamClient && streamClient !== client0), "новый поток: новый clientId");
  ok(await until(() => CONSOLEM_TRACE.some((t) => /^\/devices\?ids=/.test(t.path))), "наблюдаемое перечитано");
  // Выборка автоматизации читает одну страницу вида: это не перечень
  ok(!CONSOLEM_TRACE.some((t) => t.method === "GET" && /^\/devices(\?|$)/.test(t.path) && (/cursor=/.test(t.path) || !/(ids|type|serverId|parentId|folderId)=/.test(t.path))), "полный перечень не читался");
  const n0 = puts.length;
  await sleep(200);
  ok(n0 === 1 && puts.length === 1, "новый поток список уже держит: нет лишнего PUT и круга");
  ok(find(cams[0].id), "карточка на месте");

  // Дальше список идёт PUT в новый поток
  pick(cams[1].id);
  watchSoon();
  ok(await until(() => puts.length === 2), "изменился список — PUT");
  ok(puts[1].path.includes(streamClient) && puts[1].ids.includes(cams[1].id), "PUT в новый поток");
  await sleep(100);
  ok(streamClient && reopened && puts.length === 2, "204: поток прежний");

  // Браузер переподключился по старому адресу: список в адресе старый, форма шлёт актуальный
  apiOnEvent({ type: "stream.hello", clientId: streamClient });
  ok(await until(() => puts.length === 3), "после hello разошедшийся список уходит PUT");

  // Другой отказ — не 404: поток не трогаем
  const client1 = streamClient;
  reopened = null;
  refuse = 503;
  pick(cams[2].id);
  watchSoon();
  ok(await until(() => puts.length === 4), "PUT ушёл");
  await sleep(100);
  ok(!reopened && streamClient === client1, "отказ не 404 поток не переоткрывает");

  API.put = realPut;
  apiStream.reopen = realReopen;
  delete window.CONSOLEM_TRACE;
});
