/* Склад объектов (Unit) встроенного сервера (api/server.js): один склад на все виды, с индексами — чтобы отборы по родителю,
   папке, ссылке, домену и виду не проходили склад целиком (на стенде large 250 000 камер).
   ConsolemUnits.create({ refs }) — refs(unit) → uid, на которые объект ссылается (свойства с x-ref; ConsolemKinds.refsOf).
   Индексы: parentId (корни — по домену: byParent(null, domainId)), kind, domainId, папки (Unit.folders), ссылки.
   Объект меняют на месте те, кто его держит; после правки индексируемого (parentId, domainId, kind, folders, ссылок)
   зовут reindex(uid). put нового объекта с тем же uid заменяет прежний. stamp() растёт, когда меняется состав склада:
   по нему сервер пересобирает свои кэши (разделы перечня). Порядок byX — порядок, в котором объекты попали в индекс. */
(() => {
  const ROOT = "\u0000";
  function create(opts) {
    const refsOf = (opts && opts.refs) || (() => []);
    let all = new Map();
    let idx = null;
    const keys = new Map();
    let stamp = 0;
    const reset = () => {
      all = new Map();
      keys.clear();
      idx = { parent: new Map(), kind: new Map(), domain: new Map(), folder: new Map(), ref: new Map() };
      stamp++;
    };
    reset();
    const add = (map, key, uid) => {
      let s = map.get(key);
      if (!s) map.set(key, (s = new Set()));
      s.add(uid);
    };
    const del = (map, key, uid) => {
      const s = map.get(key);
      if (!s) return;
      s.delete(uid);
      if (!s.size) map.delete(key);
    };
    const parentKey = (parentId, domainId) => (parentId == null ? ROOT + (domainId == null ? "" : domainId) : parentId);
    function index(u) {
      const k = {
        parent: parentKey(u.parentId, u.domainId),
        kind: u.kind,
        domain: u.domainId == null ? null : u.domainId,
        folders: [...new Set(u.folders || [])],
        refs: [...new Set(refsOf(u))],
      };
      add(idx.parent, k.parent, u.uid);
      add(idx.kind, k.kind, u.uid);
      if (k.domain != null) add(idx.domain, k.domain, u.uid);
      k.folders.forEach((f) => add(idx.folder, f, u.uid));
      k.refs.forEach((r) => add(idx.ref, r, u.uid));
      keys.set(u.uid, k);
    }
    function unindex(uid) {
      const k = keys.get(uid);
      if (!k) return;
      del(idx.parent, k.parent, uid);
      del(idx.kind, k.kind, uid);
      if (k.domain != null) del(idx.domain, k.domain, uid);
      k.folders.forEach((f) => del(idx.folder, f, uid));
      k.refs.forEach((r) => del(idx.ref, r, uid));
      keys.delete(uid);
    }
    function put(u) {
      const was = all.get(u.uid);
      if (was) unindex(u.uid);
      if (was !== u) stamp++;
      all.set(u.uid, u);
      index(u);
      return u;
    }
    function reindex(uid) {
      const u = all.get(uid);
      if (!u) return;
      unindex(uid);
      index(u);
    }
    // Объект уходит со склада. Папка — вместе со своим составом: у объектов, что в ней лежали, её больше нет
    function remove(uid) {
      const u = all.get(uid);
      if (!u) return null;
      unindex(uid);
      all.delete(uid);
      stamp++;
      [...(idx.folder.get(uid) || [])].forEach((m) => {
        const x = all.get(m);
        x.folders = (x.folders || []).filter((f) => f !== uid);
        if (!x.folders.length) delete x.folders;
        reindex(m);
      });
      return u;
    }
    const list = (set) => (set ? [...set].map((uid) => all.get(uid)) : []);
    // Корни (parentId null) — только по домену: без домена — все корни склада
    function byParent(parentId, domainId) {
      if (parentId != null || domainId !== undefined) return list(idx.parent.get(parentKey(parentId, domainId)));
      const out = [];
      idx.parent.forEach((set, key) => key.startsWith(ROOT) && out.push(...list(set)));
      return out;
    }
    const count = (map, key) => (map.get(key) || { size: 0 }).size;
    // Страница по ключу: курсор — ключ последней строки; вставка и снятие других строк страницы не сдвигают
    function page(rows, cursor, limit, key) {
      const keyOf = key || ((u) => u.uid);
      const sorted = rows.map((u) => [keyOf(u), u]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      const from = cursor == null ? 0 : sorted.findIndex((x) => x[0] > cursor);
      const start = from < 0 ? sorted.length : from;
      const chunk = sorted.slice(start, start + limit);
      return { items: chunk.map((x) => x[1]), next: start + limit < sorted.length ? chunk[chunk.length - 1][0] : null };
    }
    return {
      load(units) {
        reset();
        (units || []).forEach(put);
      },
      get: (uid) => all.get(uid) || null,
      has: (uid) => all.has(uid),
      put,
      remove,
      reindex,
      byParent,
      byKind: (kind) => list(idx.kind.get(kind)),
      byDomain: (domainId) => list(idx.domain.get(domainId)),
      byRef: (uid) => list(idx.ref.get(uid)),
      byFolder: (folderId) => list(idx.folder.get(folderId)),
      // Сколько детей — без сборки списка (hasChildren узла дерева)
      childCount: (parentId, domainId) => count(idx.parent, parentKey(parentId, domainId)),
      page,
      all: () => all.values(),
      size: () => all.size,
      stamp: () => stamp,
    };
  }

  const api = { create };
  if (typeof window !== "undefined") window.ConsolemUnits = api;
  if (typeof module !== "undefined") module.exports = api;
})();
