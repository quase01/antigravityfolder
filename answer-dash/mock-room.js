/* 로컬 시험용 가짜 room (같은 브라우저의 탭끼리 BroadcastChannel 로 이어 줌).
 * index.html?mock=1 로 열 때만 불러온다. 게시한 페이지에는 쓰이지 않는다. */
(function () {
  'use strict';
  const ch = new BroadcastChannel('answer-dash-mock-room');
  const me = 'p' + Math.random().toString(36).slice(2, 10);
  const rooms = new Map();
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function R(name) {
    let r = rooms.get(name);
    if (!r) { r = { name: name, peers: new Map(), hs: new Set(), mine: {}, mineAt: Date.now(), snap: Object.freeze([]), joined: false }; rooms.set(name, r); }
    return r;
  }
  function rebuild(r) {
    const arr = [];
    if (r.joined) arr.push(Object.freeze({ peer: me, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze(clone(r.mine)), updatedAt: r.mineAt }));
    for (const [p, v] of r.peers) arr.push(Object.freeze({ peer: p, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: v.presence, updatedAt: v.updatedAt }));
    r.snap = Object.freeze(arr);
    const change = { peers: r.snap, joined: [], left: [], updated: [] };
    r.hs.forEach((h) => { try { h(change); } catch (e) { console.error(e); } });
  }
  function send(r) { if (r.joined) ch.postMessage({ t: 'p', room: r.name, peer: me, presence: r.mine }); }
  ch.onmessage = (e) => {
    const m = e.data, r = R(m.room);
    if (m.t === 'p') { r.peers.set(m.peer, { presence: Object.freeze(m.presence), updatedAt: Date.now(), seen: Date.now() }); rebuild(r); }
    else if (m.t === 'l') { r.peers.delete(m.peer); rebuild(r); }
    else if (m.t === 'hello') send(r);
  };
  setInterval(() => {
    const now = Date.now();
    for (const r of rooms.values()) {
      send(r);
      let changed = false;
      for (const [p, v] of r.peers) if (now - v.seen > 4000) { r.peers.delete(p); changed = true; }
      if (changed) rebuild(r);
    }
  }, 1000);
  addEventListener('pagehide', () => { for (const r of rooms.values()) if (r.joined) ch.postMessage({ t: 'l', room: r.name, peer: me }); });
  function api(r) {
    return Object.freeze({
      name: r.name,
      presence(patch) {
        const s = JSON.stringify(Object.assign({}, r.mine, patch));
        if (new TextEncoder().encode(s).length > 4096) return Promise.reject({ code: 'invalid_argument', message: 'presence over 4 KiB: ' + s.length });
        for (const k in patch) { if (patch[k] === null) delete r.mine[k]; else r.mine[k] = clone(patch[k]); }
        r.mineAt = Date.now(); send(r); rebuild(r); return Promise.resolve();
      },
      peers() { return r.snap; },
      onPeers(h) { r.hs.add(h); setTimeout(() => h({ peers: r.snap, joined: r.snap, left: [], updated: [] }), 0); return () => r.hs.delete(h); },
      emit() { return Promise.resolve(); },
      on() { return () => {}; },
      connected() { return true; },
      onConnection(h) { setTimeout(() => h(true), 0); return () => {}; },
      leave() { r.joined = false; r.mine = {}; ch.postMessage({ t: 'l', room: r.name, peer: me }); r.peers.clear(); rebuild(r); return Promise.resolve(); },
    });
  }
  const lobby = R('__lobby'); lobby.joined = true;
  const lobbyApi = api(lobby);
  const ns = Object.freeze(Object.assign({}, lobbyApi, {
    join(name) { const r = R(name); r.joined = true; ch.postMessage({ t: 'hello', room: name }); send(r); rebuild(r); return Promise.resolve(api(r)); },
  }));
  ch.postMessage({ t: 'hello', room: '__lobby' });
  window.claude = { use(n) { return Promise.resolve(n === 'room' ? ns : null); } };
})();
