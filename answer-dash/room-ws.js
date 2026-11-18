/* 정답 질주 섬 — 실시간 서버 연결 (claude.ai 밖에서 열 때)
 * claude.ai 의 room 기능과 같은 모양(join · presence · peers · leave)을 WebSocket 서버로 만들어 준다.
 * 서버 코드는 answer-dash-server/ 에 있다. 기본 주소는 이 페이지와 같은 곳이고,
 * 다른 곳에 서버를 두었다면 이 파일보다 먼저 window.DASH_SERVER = 'https://...' 를 정한다. */
(function () {
  'use strict';
  const rid = () => Math.random().toString(36).slice(2, 10);
  const PEER = (rid() + rid()).replace(/[^a-z0-9]/g, '').slice(0, 14).padEnd(8, '0');
  const base = () => String(window.DASH_SERVER || location.origin).replace(/^http/, 'ws').replace(/\/$/, '');
  const enc = new TextEncoder();
  const rooms = new Map();

  function makeRoom(name) {
    const st = { name: name, mine: {}, mineAt: Date.now(), others: new Map(), snap: Object.freeze([]), dirty: true, hs: new Set(), cs: new Set(),
      ws: null, open: false, left: false, retry: 0, lastSend: 0, sendTimer: 0, notifyTimer: 0 };

    function rebuild() {
      const arr = [Object.freeze({ peer: PEER, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze(JSON.parse(JSON.stringify(st.mine))), updatedAt: st.mineAt })];
      for (const [p, v] of st.others) arr.push(Object.freeze({ peer: p, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: v.d, updatedAt: v.at }));
      st.snap = Object.freeze(arr); st.dirty = false;
    }
    function changed() {
      st.dirty = true;
      if (!st.hs.size || st.notifyTimer) return;
      st.notifyTimer = setTimeout(() => {
        st.notifyTimer = 0;
        const c = { peers: api.peers(), joined: [], left: [], updated: [] };
        st.hs.forEach((h) => { try { h(c); } catch (e) { console.error(e); } });
      }, 16);
    }
    function setConn(on) { if (st.open === on) return; st.open = on; st.cs.forEach((h) => { try { h(on); } catch (e) {} }); }
    function sendNow() {
      st.sendTimer = 0;
      if (!st.open || !st.ws) return;
      try { st.ws.send(JSON.stringify({ t: 'p', d: st.mine })); st.lastSend = Date.now(); } catch (e) {}
    }
    function queueSend() {
      if (st.sendTimer) return;
      const wait = Math.max(0, 34 - (Date.now() - st.lastSend));
      if (wait === 0) sendNow(); else st.sendTimer = setTimeout(sendNow, wait);
    }
    function connect() {
      return new Promise((resolve, reject) => {
        let settled = false;
        const done = (fn, v) => { if (settled) return; settled = true; clearTimeout(to); fn(v); };
        let ws;
        try { ws = new WebSocket(base() + '/room/' + encodeURIComponent(name) + '?peer=' + PEER); }
        catch (e) { reject({ code: 'upstream_error', message: String(e) }); return; }
        st.ws = ws;
        const to = setTimeout(() => { try { ws.close(); } catch (e) {} done(reject, { code: 'upstream_error', message: 'no answer in 10 s' }); }, 10000);
        ws.onmessage = (e) => {
          if (typeof e.data !== 'string' || e.data === 'pong') return;
          let m; try { m = JSON.parse(e.data); } catch (x) { return; }
          if (!m) return;
          if (m.t === 'hello') {
            st.others.clear();
            for (const p of m.peers || []) if (p && p.peer !== PEER) st.others.set(p.peer, { d: Object.freeze(p.d || {}), at: Date.now() });
            st.retry = 0; setConn(true); changed();
            if (Object.keys(st.mine).length) sendNow();
            done(resolve);
          } else if (m.t === 'p' && m.peer !== PEER) { st.others.set(m.peer, { d: Object.freeze(m.d || {}), at: Date.now() }); changed(); }
          else if (m.t === 'l') { st.others.delete(m.peer); changed(); }
          else if (m.t === 'full') { st.left = true; done(reject, { code: 'limit_reached', message: 'room is full' }); }
        };
        ws.onclose = (e) => {
          if (st.ws !== ws) return;
          setConn(false);
          if (!settled) { done(reject, { code: 'upstream_error', message: 'connection closed' }); return; }
          if (st.left || e.code === 4000 || e.code === 4001) return;
          const d = Math.min(8000, 500 * Math.pow(2, st.retry++));
          setTimeout(() => { if (!st.left) connect().catch(() => {}); }, d);
        };
        ws.onerror = () => {};
      });
    }
    /* 몇 초마다 내 상태를 다시 보내 서버가 잠들었다 깨어도 모두가 알게 하고, 연결도 살려 둔다 */
    const beat = setInterval(() => {
      if (st.left) { clearInterval(beat); return; }
      if (!st.open || !st.ws) return;
      const idle = Date.now() - st.lastSend;
      if (Object.keys(st.mine).length && idle > 3000) sendNow();
      else if (idle > 20000) { try { st.ws.send('ping'); st.lastSend = Date.now(); } catch (e) {} }
    }, 1000);

    const api = Object.freeze({
      name: name,
      presence(patch) {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return Promise.reject({ code: 'invalid_argument', message: 'patch must be an object' });
        const next = Object.assign({}, st.mine);
        for (const k in patch) { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; }
        let text;
        try { text = JSON.stringify(next); } catch (e) { return Promise.reject({ code: 'invalid_argument', message: 'not JSON' }); }
        if (enc.encode(text).length > 4096) return Promise.reject({ code: 'invalid_argument', message: 'presence over 4 KiB' });
        st.mine = JSON.parse(text); st.mineAt = Date.now(); changed(); queueSend();
        return Promise.resolve();
      },
      peers() { if (st.dirty) rebuild(); return st.snap; },
      onPeers(h) { st.hs.add(h); setTimeout(() => h({ peers: api.peers(), joined: api.peers(), left: [], updated: [] }), 0); return () => st.hs.delete(h); },
      emit() { return Promise.resolve(); },
      on() { return () => {}; },
      connected() { return st.open; },
      onConnection(h) { st.cs.add(h); setTimeout(() => h(st.open), 0); return () => st.cs.delete(h); },
      leave() {
        st.left = true; clearInterval(beat); rooms.delete(name);
        const ws = st.ws; st.ws = null; setConn(false);
        try { if (ws) ws.close(1000, 'leave'); } catch (e) {}
        return Promise.resolve();
      },
    });
    st.connect = connect;
    return { st: st, api: api };
  }

  function open(name) {
    const have = rooms.get(name);
    if (have) return have.ready.then(() => have.r.api);
    const r = makeRoom(name);
    const entry = { r: r, ready: r.st.connect() };
    rooms.set(name, entry);
    return entry.ready.then(() => r.api, (e) => { rooms.delete(name); r.api.leave(); throw e; });
  }

  window.DashRoom = {
    /* 처음 화면용 로비 방에 붙고, room 기능과 같은 모양의 객체를 돌려준다. 안 되면 null. */
    open() {
      return open('__lobby').then((lobby) => Object.freeze(Object.assign({}, lobby, {
        join(name) {
          if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(String(name))) return Promise.reject({ code: 'invalid_argument', message: 'bad room name' });
          return open(String(name));
        },
      })), () => null);
    },
  };
})();
