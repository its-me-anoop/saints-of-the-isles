/*
 * Sync layer shared by both screens. Picks a transport automatically:
 *
 *   • WebSocket  — when a relay server is present (local `npm start`); full
 *                  cross-device sync, no pairing needed.
 *   • WebRTC     — when there is no server (static host such as Vercel). The
 *                  big screen hosts a peer under a short pairing CODE; the
 *                  tablet joins by entering that code. Signalling uses the free
 *                  public PeerJS broker only for the handshake — the live link
 *                  is a direct device-to-device DataChannel.
 *
 * API:  createConnection(role, onMessage, opts) -> { send, pair, repair }
 *   opts.onMode(mode)        'ws' | 'rtc'
 *   opts.onStatus(state)     'connecting' | 'online' | 'offline'
 *   opts.onCode(code)        (display) the pairing code to display
 *   opts.onPaired(code)      a peer link opened
 *   opts.onPairError(msg)    pairing attempt failed (msg may be null = silent)
 */
window.createConnection = function createConnection(role, onMessage, opts) {
  opts = opts || {};
  const cb = {
    onMode: opts.onMode || (() => {}),
    onStatus: opts.onStatus || (() => {}),
    onCode: opts.onCode || (() => {}),
    onPaired: opts.onPaired || (() => {}),
    onPairError: opts.onPairError || (() => {}),
  };

  const PEERJS_SRC = 'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js';
  const ID_PREFIX = 'saints-isles-v1-';
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  const hostId = (code) => ID_PREFIX + code.toUpperCase();
  const genCode = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

  let mode = null;
  let closedByUs = false;
  const deliver = (m) => { try { onMessage(m); } catch { /* ignore */ } };
  function lamp(state) {
    document.querySelectorAll('[data-conn-status]').forEach((el) => { el.dataset.connState = state; });
  }
  function setStatus(s) { cb.onStatus(s); lamp(s === 'online' ? 'online' : 'offline'); }

  // ===================================================================== WS
  let ws = null, wsOpen = false, wsRetries = 0;
  function connectWs() {
    let settled = false;
    const giveUp = setTimeout(() => {
      if (!wsOpen && !settled) { settled = true; try { ws && ws.close(); } catch { /* noop */ } startRtc(); }
    }, 1500);
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}`);
    } catch {
      clearTimeout(giveUp); startRtc(); return;
    }
    ws.addEventListener('open', () => {
      settled = true; clearTimeout(giveUp);
      mode = 'ws'; wsOpen = true; wsRetries = 0;
      cb.onMode('ws'); setStatus('online'); send({ type: 'hello', role });
    });
    ws.addEventListener('message', (e) => { try { deliver(JSON.parse(e.data)); } catch { /* ignore */ } });
    ws.addEventListener('close', () => {
      wsOpen = false;
      if (closedByUs) return;
      if (mode === 'ws') { setStatus('offline'); wsRetries += 1; setTimeout(connectWs, Math.min(3000, 500 * wsRetries)); }
      else if (!settled) { settled = true; clearTimeout(giveUp); startRtc(); }
    });
    ws.addEventListener('error', () => { try { ws.close(); } catch { /* noop */ } });
  }

  // =================================================================== WebRTC
  let peer = null;
  let myCode = null;
  const channels = new Set();

  function loadPeerJS() {
    return new Promise((res, rej) => {
      if (window.Peer) return res();
      const s = document.createElement('script');
      s.src = PEERJS_SRC; s.onload = () => res(); s.onerror = () => rej(new Error('peerjs load failed'));
      document.head.appendChild(s);
    });
  }

  function wire(conn) {
    conn.on('open', () => {
      channels.add(conn);
      setStatus('online');
      cb.onPaired(conn.peer);
      if (role === 'display') { try { conn.send({ type: 'requestState' }); } catch { /* noop */ } }
    });
    conn.on('data', (d) => { if (d && d.type) deliver(d); });
    conn.on('close', () => { channels.delete(conn); if (!channels.size) setStatus(role === 'display' ? 'connecting' : 'offline'); });
    conn.on('error', () => { channels.delete(conn); });
  }

  async function startRtc() {
    if (mode === 'rtc') return;
    mode = 'rtc'; cb.onMode('rtc'); setStatus('connecting');
    try { await loadPeerJS(); } catch { setStatus('offline'); cb.onPairError('Could not load the pairing library.'); return; }
    if (role === 'display') hostRtc();
    else autoJoin();
  }

  // ---- Display hosts under a stable code ----
  function hostRtc(code, attempt) {
    code = (code || localStorage.getItem('saints-host-code') || genCode()).toUpperCase();
    attempt = attempt || 0;
    try { peer = new window.Peer(hostId(code)); } catch { setStatus('offline'); return; }
    peer.on('open', () => {
      myCode = code;
      localStorage.setItem('saints-host-code', code);
      cb.onCode(code);
      if (!channels.size) setStatus('connecting');
    });
    peer.on('connection', wire);
    peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* noop */ } });
    peer.on('error', (e) => {
      if (e && e.type === 'unavailable-id') {
        try { peer.destroy(); } catch { /* noop */ }
        if (attempt < 4) setTimeout(() => hostRtc(code, attempt + 1), 1600); // our stale peer is freeing up
        else { const nc = genCode(); localStorage.setItem('saints-host-code', nc); hostRtc(nc, 0); }
      } else if (e && (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error')) {
        setStatus('offline');
        try { peer.destroy(); } catch { /* noop */ }
        setTimeout(() => hostRtc(code, attempt), 4000);
      }
    });
  }

  // ---- Tablet joins by code ----
  function ensurePeer() {
    if (!peer) { try { peer = new window.Peer(); } catch { /* noop */ } }
    return peer;
  }
  function doJoin(code, silent) {
    code = (code || '').toUpperCase();
    if (code.length < 4) { cb.onPairError('Enter the 4-character code.'); return; }
    ensurePeer();
    const go = () => {
      const conn = peer.connect(hostId(code), { reliable: true });
      // Attach listeners synchronously (before 'open' fires) — wire() handles
      // open/data/close/error and adds the channel.
      wire(conn);
      conn.on('open', () => { localStorage.setItem('saints-paired-code', code); });
      setTimeout(() => {
        if (!channels.has(conn) && !silent) cb.onPairError(`No big screen found for code ${code}.`);
      }, 8000);
    };
    if (peer.open) go(); else peer.on('open', go);
    peer.on('error', (e) => {
      if (e && e.type === 'peer-unavailable' && !silent) cb.onPairError(`No big screen found for code ${code}.`);
    });
  }
  function autoJoin() {
    // Same-browser convenience: reuse a stored / sibling-tab host code.
    const stored = localStorage.getItem('saints-paired-code') || localStorage.getItem('saints-host-code');
    if (stored) doJoin(stored, true);
  }

  // ===================================================================== send
  function send(obj) {
    if (mode === 'ws' && wsOpen) { ws.send(JSON.stringify(obj)); }
    else if (mode === 'rtc') { channels.forEach((c) => { try { c.send(obj); } catch { /* noop */ } }); }
  }

  // `?rtc` forces the WebRTC pairing transport even if a WS server exists
  // (handy for testing, and a manual override on the hosted build).
  if (/[?&](rtc|pair)(=|&|$)/.test(location.search)) startRtc();
  else connectWs();

  return {
    send,
    pair(code) { if (mode === 'rtc' && role !== 'display') doJoin(code, false); },
    repair() { localStorage.removeItem('saints-paired-code'); },
    get mode() { return mode; },
    get code() { return myCode; },
    close() { closedByUs = true; try { ws && ws.close(); } catch { /* noop */ } try { peer && peer.destroy(); } catch { /* noop */ } },
  };
};
