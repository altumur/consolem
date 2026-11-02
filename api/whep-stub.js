/* Подставной WHEP стенда: настоящего видео нет ни у встроенного сервера, ни у стенда, а дверь шлюза не написать без WebRTC.
   Адрес stub:// выдаёт только POST /devices/{id}/live стенда. На него отвечает сама страница: второй RTCPeerConnection
   в этой же странице, тестовая картинка с canvas, без внешней сети. Ответы — настоящие Response, путь клиента тот же,
   что у настоящего шлюза (V/03.3): 201, ответ SDP, Location; DELETE на Location снимает сессию.

   script — что отвечать на следующие оферы вместо картинки, по одному элементу на офер: {status, body}; drop(), cut() —
   для сценариев. log — что пришло. Настоящий шлюз этот файл никогда не трогает: адрес у него https. */
(() => {
  const GATHER_MS = 3000;
  const W = 640, H = 360, FPS = 15;
  const sessions = new Map();
  let canvas = null, ticker = 0, frame = 0, seq = 0;

  function draw() {
    const g = canvas.getContext("2d");
    frame++;
    g.fillStyle = "#16202c";
    g.fillRect(0, 0, W, H);
    ["#c0392b", "#d68910", "#1e8449", "#2471a3", "#6c3483"].forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(i * (W / 5), 96, W / 5, 150);
    });
    g.fillStyle = "#fff";
    g.fillRect((frame * 6) % W, 96, 8, 150);
    g.font = "bold 24px sans-serif";
    g.textAlign = "center";
    g.fillText(say("ТЕСТОВАЯ КАРТИНКА"), W / 2, 62);
    g.font = "16px sans-serif";
    g.fillText(say("Это не камера: настоящего видео на стенде нет"), W / 2, 86);
    g.font = "20px monospace";
    g.fillText(new Date().toLocaleTimeString(), W / 2, 294);
  }
  const say = (s) => (typeof window.i18n === "function" ? window.i18n(s) : s);
  function picture() {
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      draw();
      Stub.track = canvas.captureStream(FPS).getVideoTracks()[0];
    }
    if (!ticker) ticker = setInterval(draw, 1000 / FPS);
    return Stub.track;
  }
  function done(peer) {
    return new Promise((resolve) => {
      if (peer.iceGatheringState === "complete") return resolve();
      const t = setTimeout(resolve, GATHER_MS);
      peer.addEventListener("icegatheringstatechange", () => {
        if (peer.iceGatheringState !== "complete") return;
        clearTimeout(t);
        resolve();
      });
    });
  }
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  // Ответ на офер: как шлюз, без trickle, все кандидаты в теле
  async function answer(sdp) {
    const peer = new RTCPeerConnection();
    await peer.setRemoteDescription({ type: "offer", sdp });
    const video = peer.getTransceivers().find((t) => t.receiver.track.kind === "video");
    if (!video) return peer.close(), json(400, { error: "bad offer" });
    video.direction = "sendonly";
    const track = picture();
    await video.sender.replaceTrack(track);
    video.sender.setStreams(new MediaStream([track]));
    await peer.setLocalDescription(await peer.createAnswer());
    await done(peer);
    const sid = `s${++seq}`;
    sessions.set(sid, peer);
    return new Response(peer.localDescription.sdp, { status: 201, headers: { "Content-Type": "application/sdp", Location: `/whep/session/${sid}?gateway=stub-gateway` } });
  }
  function close(sid) {
    const peer = sessions.get(sid);
    if (!peer) return false;
    peer.close();
    sessions.delete(sid);
    if (!sessions.size) (clearInterval(ticker), (ticker = 0));
    return true;
  }
  const Stub = {
    script: [],
    log: [],
    track: null,
    sessions,
    // Всё, что подано в script, отвечено; идущие сессии обрываются
    cut() {
      [...sessions.keys()].forEach(close);
    },
    async fetch(url, opts = {}) {
      const method = opts.method || "GET", auth = (opts.headers || {}).Authorization || "";
      Stub.log.push({ method, url, auth, sdp: opts.body || null, keepalive: !!opts.keepalive });
      if (!/^Bearer stub-/.test(auth)) return json(403, { error: "bad token" });
      const sid = url.match(/\/whep\/session\/([^?]+)/);
      if (sid) return method === "DELETE" && close(sid[1]) ? new Response(null, { status: 204 }) : json(404, { error: "no session" });
      const next = Stub.script.shift();
      if (next) return next.status === 201 ? new Response(next.body, { status: 201, headers: next.headers }) : json(next.status, next.body);
      return answer(opts.body);
    },
  };
  window.ConsolemWhepStub = Stub;
})();
