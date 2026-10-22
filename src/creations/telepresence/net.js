// net.js - room relay websocket. welcome/join/leave route to onRoster,
// everything else to onMsg. Reconnects every 2s until close().
export function createNet({ host, room, onMsg, onRoster, onState }) {
  const url = `ws://${host}/?room=${encodeURIComponent(room)}`;
  let ws = null, id = 0, state = "", dead = false, timer = 0;

  function setState(s) {
    if (s === state) return;
    state = s;
    onState && onState(s);
  }

  function connect() {
    setState("connecting");
    ws = new WebSocket(url);
    ws.onopen = () => setState("live");
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (!m || typeof m !== "object") return;
      if (m.t === "welcome") id = m.id;
      if (m.t === "welcome" || m.t === "join" || m.t === "leave") {
        onRoster && onRoster(m);
      } else onMsg && onMsg(m);
    };
    ws.onclose = () => {
      id = 0;
      setState("offline");
      if (!dead) timer = setTimeout(connect, 2000);
    };
    ws.onerror = () => {}; // close follows; the retry loop owns recovery
  }

  connect();

  return {
    send(obj) {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
    },
    id: () => id,
    state: () => state,
    close() {
      dead = true;
      clearTimeout(timer);
      if (ws) ws.close();
    },
  };
}
