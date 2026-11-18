/* 정답 질주 섬 — 실시간 방 서버 (Cloudflare Workers + Durable Objects)
 *
 * 방 하나 = Durable Object 하나. 브라우저는 /room/<방 이름> 으로 WebSocket 을 연다.
 * 서버는 각자의 presence(내 상태 한 덩어리)를 기억했다가 같은 방 사람들에게 그대로 전한다.
 * 경기 규칙은 모르는 단순한 중계기다 — 경기 진행은 방장 브라우저가 맡는다.
 *
 * 주고받는 말:
 *   서버 → 나   {t:'hello', peer, peers:[{peer, d}]}   들어오자마자 지금 방 사람들
 *   나 → 서버   {t:'p', d}                              내 presence 전체 (4 KiB 까지)
 *   서버 → 남   {t:'p', peer, d}                        누군가의 presence 가 바뀜
 *   서버 → 남   {t:'l', peer}                           누군가 나감
 *   서버 → 나   {t:'full'}                              방이 꽉 참
 *   'ping' → 'pong'                                     연결 유지 (방을 깨우지 않음)
 */
import { DurableObject } from 'cloudflare:workers';

const NAME_RE = /^[a-z0-9_][a-z0-9_.-]{0,47}$/;
const PEER_RE = /^[a-z0-9]{6,24}$/;
const MAX_PEERS = 60;          /* 방 하나에 들어올 수 있는 창 수 */
const MAX_BYTES = 4096;        /* presence 한 덩어리 크기 */
const MAX_PER_SEC = 40;        /* 한 사람이 1초에 보낼 수 있는 메시지 수 */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/room\/([^/]+)$/);
    if (!m) return new Response('Not found', { status: 404 });
    let name;
    try { name = decodeURIComponent(m[1]); } catch (e) { return new Response('bad room', { status: 400 }); }
    if (!NAME_RE.test(name)) return new Response('bad room', { status: 400 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = req.headers.get('Origin') || '';
    if (allowed.length && origin !== url.origin && !allowed.includes(origin)) return new Response('forbidden', { status: 403 });
    return env.ROOMS.get(env.ROOMS.idFromName(name)).fetch(req);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    /* presence 는 메모리에만 둔다. 방이 잠들었다 깨면 비지만, 브라우저가 몇 초마다 다시 보내 준다. */
    this.pres = new Map();
    this.rate = new Map();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req) {
    const url = new URL(req.url);
    let peer = url.searchParams.get('peer') || '';
    if (!PEER_RE.test(peer)) peer = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    /* 같은 창이 다시 연결하면 예전 연결은 닫는다 */
    for (const old of this.ctx.getWebSockets(peer)) { try { old.close(4000, 'replaced'); } catch (e) {} }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [peer]);
    server.serializeAttachment({ peer });
    const live = this.ctx.getWebSockets().filter((ws) => this.peerOf(ws) && this.peerOf(ws) !== peer);
    if (live.length >= MAX_PEERS) {
      server.send(JSON.stringify({ t: 'full' }));
      server.close(4001, 'full');
      return new Response(null, { status: 101, webSocket: client });
    }
    const peers = [];
    const seen = new Set();
    for (const ws of live) {
      const p = this.peerOf(ws);
      if (seen.has(p)) continue;
      seen.add(p);
      peers.push({ peer: p, d: this.pres.get(p) || {} });
    }
    server.send(JSON.stringify({ t: 'hello', peer, peers }));
    return new Response(null, { status: 101, webSocket: client });
  }

  peerOf(ws) {
    try { const a = ws.deserializeAttachment(); return a && a.peer; } catch (e) { return null; }
  }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > MAX_BYTES * 2) return;
    const peer = this.peerOf(ws);
    if (!peer) return;
    const now = Date.now();
    let r = this.rate.get(peer);
    if (!r || now - r.t >= 1000) { r = { t: now, n: 0 }; this.rate.set(peer, r); }
    if (++r.n > MAX_PER_SEC) return;
    let m;
    try { m = JSON.parse(msg); } catch (e) { return; }
    if (!m || m.t !== 'p' || !m.d || typeof m.d !== 'object' || Array.isArray(m.d)) return;
    const text = JSON.stringify(m.d);
    if (new TextEncoder().encode(text).length > MAX_BYTES) return;
    this.pres.set(peer, m.d);
    const out = '{"t":"p","peer":' + JSON.stringify(peer) + ',"d":' + text + '}';
    for (const o of this.ctx.getWebSockets()) {
      if (o === ws) continue;
      try { o.send(out); } catch (e) {}
    }
  }

  async webSocketClose(ws, code, reason) {
    this.gone(ws);
    try { ws.close(code === 1005 ? 1000 : code, reason); } catch (e) {}
  }

  async webSocketError(ws) {
    this.gone(ws);
  }

  gone(ws) {
    const peer = this.peerOf(ws);
    if (!peer) return;
    const still = this.ctx.getWebSockets(peer).some((o) => o !== ws && o.readyState === WebSocket.OPEN);
    if (still) return;
    this.pres.delete(peer);
    this.rate.delete(peer);
    const out = JSON.stringify({ t: 'l', peer });
    for (const o of this.ctx.getWebSockets()) {
      if (o === ws) continue;
      try { o.send(out); } catch (e) {}
    }
  }
}
