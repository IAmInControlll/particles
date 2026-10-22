import { createServer } from "http";
import { createHash } from "crypto";

const PORT = 8322;
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const rooms = new Map();
let nextId = 1;

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("telepresence relay");
    return;
  }
  res.writeHead(404);
  res.end();
});

server.on("upgrade", (req, sock, head) => {
  const fail = status => {
    sock.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    sock.destroy();
  };
  if (req.method !== "GET") return fail("405 Method Not Allowed");
  if ((req.headers.upgrade || "").toLowerCase() !== "websocket") return fail("400 Bad Request");
  const key = req.headers["sec-websocket-key"];
  if (!key) return fail("400 Bad Request");
  const accept = createHash("sha1").update(key + GUID).digest("base64");
  sock.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  const room = new URL(req.url, "http://x").searchParams.get("room") || "lobby";
  join(sock, room, head);
});

function sendFrame(sock, op, payload) {
  const n = payload.length;
  let head;
  if (n < 126) {
    head = Buffer.from([0x80 | op, n]);
  } else if (n < 65536) {
    head = Buffer.alloc(4);
    head.writeUInt16BE(n, 2);
  } else {
    head = Buffer.alloc(10);
    head.writeBigUInt64BE(BigInt(n), 2);
  }
  head[0] = 0x80 | op;
  if (n >= 126) head[1] = n < 65536 ? 126 : 127;
  sock.write(Buffer.concat([head, payload]));
}

function send(c, str) {
  try {
    if (c.dead || !c.sock.writable) return;
    sendFrame(c.sock, 0x1, Buffer.from(str, "utf8"));
  } catch {}
}

function broadcast(room, from, str) {
  const set = rooms.get(room);
  if (!set) return;
  for (const c of set) if (c !== from) send(c, str);
}

function join(sock, room, head) {
  const c = { id: nextId++, sock, room, buf: Buffer.alloc(0), msg: null, dead: false };
  let set = rooms.get(room);
  if (!set) rooms.set(room, (set = new Set()));
  const peers = [...set].map(m => m.id);
  set.add(c);
  send(c, JSON.stringify({ t: "welcome", id: c.id, peers }));
  broadcast(room, c, JSON.stringify({ t: "join", id: c.id }));
  console.log(`join id=${c.id} room=${room} (${set.size - 1} peers)`);
  sock.setNoDelay(true);
  sock.on("data", chunk => feed(c, chunk));
  sock.on("end", () => sock.destroy());
  sock.on("error", () => sock.destroy());
  sock.on("close", () => drop(c));
  if (head && head.length) feed(c, head);
}

function feed(c, chunk) {
  if (c.dead) return;
  c.buf = Buffer.concat([c.buf, chunk]);
  try {
    drain(c);
  } catch {
    kill(c);
  }
}

function drain(c) {
  for (;;) {
    const b = c.buf;
    if (b.length < 2) return;
    const b0 = b[0];
    const b1 = b[1];
    // client frames must be masked, and RSV bits are only legal with negotiated extensions
    if (b0 & 0x70 || !(b1 & 0x80)) return kill(c);
    const fin = b0 & 0x80;
    const op = b0 & 0x0f;
    let len = b1 & 0x7f;
    let off = 2;
    if (len === 126) {
      if (b.length < 4) return;
      len = b.readUInt16BE(2);
      off = 4;
    } else if (len === 127) {
      if (b.length < 10) return;
      len = Number(b.readBigUInt64BE(2));
      off = 10;
    }
    if (b.length < off + 4 + len) return;
    const mask = b.subarray(off, off + 4);
    off += 4;
    const payload = Buffer.alloc(len);
    for (let i = 0; i < len; i++) payload[i] = b[off + i] ^ mask[i & 3];
    c.buf = b.subarray(off + len);
    if (onFrame(c, fin, op, payload)) return;
  }
}

function onFrame(c, fin, op, payload) {
  if (op >= 0x8 && (!fin || payload.length > 125)) return kill(c), true;
  if (op === 0x8) {
    try {
      sendFrame(c.sock, 0x8, payload);
    } catch {}
    c.sock.destroy();
    return true;
  }
  if (op === 0x9) {
    try {
      sendFrame(c.sock, 0xa, payload);
    } catch {}
    return false;
  }
  if (op === 0xa) return false;
  if (op === 0x1 || op === 0x0) {
    if (op === 0x1 ? c.msg : !c.msg) return kill(c), true;
    if (c.msg) c.msg.push(payload);
    else c.msg = [payload];
    if (fin) {
      const text = Buffer.concat(c.msg).toString("utf8");
      c.msg = null;
      broadcast(c.room, c, text);
    }
    return false;
  }
  kill(c);
  return true;
}

function kill(c) {
  try {
    c.sock.destroy();
  } catch {}
  drop(c);
}

function drop(c) {
  if (c.dead) return;
  c.dead = true;
  const set = rooms.get(c.room);
  if (set) {
    set.delete(c);
    for (const m of set) send(m, JSON.stringify({ t: "leave", id: c.id }));
    if (!set.size) rooms.delete(c.room);
  }
  console.log(`leave id=${c.id} room=${c.room} (${set ? set.size : 0} peers)`);
}

server.listen(PORT, () => console.log(`relay listening on :${PORT}`));
