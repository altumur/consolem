/* Сценарий интерфейса: закладка «Топология» у домена и сервера. Домен, кластер, сервер, устройств нет. */
UiCheck(async ({ ok, until }) => {
  const d = domains[0];
  goApp("hw");
  pick(d.id, { force: true });
  goTab("topo");
  ok(tabsFor(d).some(([id]) => id === "topo"), "закладка у домена");
  ok(!!document.getElementById("g7c"), "холст есть");
  ok(await until(() => G7.relays.get(d.id)?.size > 0), "ретрансляторы прочитаны");
  ok(await until(() => G7.g?.nodes.some((n) => n.kind === "cluster")), "граф построен");
  const kinds = () => new Set(G7.g.nodes.map((n) => n.kind));
  ok(G7.g.nodes.every((n) => ["domain", "cluster", "server"].includes(n.kind)), "только домен, кластер, сервер");
  // Уровень 1: кластеры напрямую, без Парка и Логистики за Периметром и без серверов
  const names = () => G7.g.nodes.map((n) => n.name);
  ok(!kinds().has("server") && !names().includes("Парк") && names().includes("Периметр"), "уровень 1: кластеры напрямую: " + names().join(", "));
  const info = () => document.getElementById("g7Info").textContent;
  ok(new RegExp(`^${G7.g.nodes.length} .*${G7.g.edges.length}`).test(info()), "узлы и связи посчитаны: " + info());
  g7SetLevel(2);
  ok(kinds().has("server") && names().includes("Парк") && names().includes("Логистика"), "уровень 2: серверы кластеров напрямую и кластеры за ретранслятором");
  const behind = d.servers.filter((s) => ["Парк", "Логистика"].includes(g7ClusterOf(s)));
  ok(!behind.some((s) => G7.g.nodes.some((n) => n.id === s.id)), "серверов за ретранслятором нет");
  g7SetLevel(3);
  ok(behind.every((s) => G7.g.nodes.some((n) => n.id === s.id)), "уровень 3: серверы за ретранслятором");
  const at = (n) => G7.g.nodes.findIndex((x) => x.name === n);
  ok(G7.g.edges.some(([a, b]) => (a === at("Периметр") && b === at("Парк")) || (b === at("Периметр") && a === at("Парк"))), "Парк висит на ретрансляторе");
  ok(!names().includes("cam-gate-1"), "камера в составе ретранслятора не рисуется");
  ok(G7.g.nodes.filter((n) => n.kind === "server").length === d.servers.length, "уровень 3: все серверы домена");
  ok(!G7.g.nodes.some((n) => /Камера/.test(n.name)), "устройств нет");
  ok(G7.raf > 0, "цикл идёт");
  // Выделение: как в образце
  ok(g7R(G7.g.nodes[0]) === 9 && G7.sel === d.id, "домен выделен: радиус 9");
  // Клик по серверу: дерево, карточка сервера, та же закладка, положения те же
  const s = d.servers[1];
  G7.g.nodes.forEach((n) => G7.pos.set(n.id, { x: n.x, y: n.y }));
  const before = JSON.stringify(G7.pos.get(s.id));
  g7Stop();
  const posNow = JSON.stringify(G7.pos.get(s.id));
  g7Click(s.id);
  ok(sel === s.id && tab === "topo", "клик: карточка сервера на той же закладке");
  ok(/Топология/.test(document.querySelector(".hd .tabs .tab.on")?.textContent || ""), "закладка та же");
  ok(!!document.querySelector(`#tree .n[data-pick="${s.id}"]`), "дерево показывает сервер");
  ok(G7.sel === s.id && G7.g.nodes.find((n) => n.id === s.id).id === s.id, "выделен новый узел");
  ok(Math.abs(JSON.parse(posNow).x - G7.pos.get(s.id).x) < 1e-6 || G7.g.nodes.find((n) => n.id === s.id).x === JSON.parse(posNow).x, "положение то же: " + before.slice(0, 30));
  ok(G7.g.nodes.some((n) => n.id === d.id) && G7.g.nodes.filter((n) => n.kind === "server").length === d.servers.length, "граф тот же: уровень перешёл с узла");
  // Умолчания: сервер напрямую — 2, за ретранслятором — 3
  G7.chosen.clear();
  ok(g7Level(d) === 1 && g7Level(s) === 2 && g7Level(behind[0]) === 3, "умолчания: домен 1, сервер напрямую 2, за ретранслятором 3");
  // Уровень ниже: узла нет, выделение на родителе, карточка та же
  g7SetLevel(1);
  ok(sel === s.id && G7.sel === g7ClusterId(d.id, g7ClusterOf(s)), "уровень 1: выделен кластер, карточка сервера на месте");
  g7SetLevel(3);
  // Клик по кластеру: записи нет, карточка не меняется
  const cl = G7.g.nodes.find((n) => n.kind === "cluster");
  const was = sel;
  g7Click(cl.id);
  ok(sel === was && G7.sel === cl.id, "кластер только выделен");
  // Статус из потока: граф не пересобирается
  const g0 = G7.g;
  s.online = false;
  ok(g7Bad(g0.nodes.find((n) => n.id === s.id)) === true && G7.g === g0, "статус без пересборки");
  s.online = true;
  // Клавиатура: список тех же узлов
  ok(document.querySelectorAll("#g7List [data-g7]").length === G7.g.nodes.length, "список узлов для клавиатуры");
  // Уход останавливает цикл
  goTab("gen");
  ok(await until(() => G7.raf === 0), "уход с закладки останавливает цикл");
  // У камеры закладки нет
  const cam = devicePool.find((n) => n.type === "camera");
  ok(!tabsFor(cam).some(([id]) => id === "topo"), "у камеры закладки нет");
  // Нераспределённый сервер: один узел и слова
  const u = d.unallocServers[0];
  pick(u.id, { force: true });
  goTab("topo");
  ok(G7.g.nodes.length === 1 && G7.sel === u.id && !!document.getElementById("g7Empty"), "нераспределённый: один узел, пояснение");
  // Домен с одним кластером: уровня кластера нет
  const single = domains.find((x) => x.servers.length && new Set(x.servers.map(g7ClusterOf)).size < 2);
  pick(single.id, { force: true });
  goTab("topo");
  ok(!G7.g.nodes.some((n) => n.kind === "cluster") && G7.g.nodes.some((n) => n.kind === "server"), "один кластер — уровня нет, серверы на домене");
  goTab("gen");
});
