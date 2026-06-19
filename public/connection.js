/*
 * Sync layer shared by both screens. Picks a transport automatically:
 *
 *   • WebSocket  — when a relay server is present (local `npm start`); full
 *                  cross-device sync, no pairing code needed.
 *   • MQTT rooms — when there is no server (static host such as Vercel). The big
 *                  screen shows a short pairing CODE; the tablet enters it, and
 *                  both subscribe to a topic named after that code. We connect to
 *                  SEVERAL public MQTT brokers AT ONCE (secure WebSocket) and
 *                  relay the tiny sync messages through all of them — so the two
 *                  devices always share at least one broker, it survives a broker
 *                  being down or a port being blocked, and it works on iOS Safari
 *                  and across any network with no TURN/NAT traversal and no setup.
 *
 * API:  createConnection(role, onMessage, opts) -> { send, pair, repair }
 *   opts.onMode(mode)    'ws' | 'rtc'  ('rtc' = "needs pairing")
 *   opts.onStatus(state) 'connecting' | 'online' | 'offline'
 *   opts.onCode(code)    (display) the pairing code to show
 *   opts.onPaired(code)  the other screen connected
 *   opts.onPairError(msg) pairing attempt failed (msg may be null = silent)
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

  const MQTT_SRC = '/mqtt.min.js'; // bundled locally (no CDN dependency)
  // Public brokers, all secure WebSocket. We connect to ALL of them at once.
  const BROKERS = (window.SAINTS_BROKERS) || [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
  ];
  const TOPIC = (code) => `saints-of-the-isles/v1/${code.toUpperCase()}`;
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  const genCode = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
  const myId = role + '-' + Math.random().toString(36).slice(2, 9);

  let mode = null;
  let closedByUs = false;
  const diag = (window.__saints = window.__saints || {});
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
      if (!wsOpen && !settled) { settled = true; try { ws && ws.close(); } catch { /* noop */ } startRoom(); }
    }, 1500);
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}`);
    } catch { clearTimeout(giveUp); startRoom(); return; }
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
      else if (!settled) { settled = true; clearTimeout(giveUp); startRoom(); }
    });
    ws.addEventListener('error', () => { try { ws.close(); } catch { /* noop */ } });
  }

  // ================================================================ MQTT rooms
  let clients = [];       // one mqtt client per broker
  let room = null;        // current topic
  let myCode = null;      // pairing code
  let peerSeen = false;
  let joinTimer = null;

  function loadMqtt() {
    return new Promise((res, rej) => {
      if (window.mqtt) return res();
      const s = document.createElement('script');
      s.src = MQTT_SRC; s.onload = () => res(); s.onerror = () => rej(new Error('mqtt load failed'));
      document.head.appendChild(s);
    });
  }

  function publishOn(c, obj) {
    if (c && c.connected && room) { try { c.publish(room, JSON.stringify({ ...obj, __from: myId, __role: role })); } catch { /* noop */ } }
  }
  function publish(obj) { clients.forEach((c) => publishOn(c, obj)); }

  function refreshStatus() {
    if (peerSeen) { setStatus('online'); return; }
    setStatus(clients.some((c) => c && c.connected) ? 'connecting' : 'connecting');
  }

  function markOnline() {
    if (!peerSeen) { peerSeen = true; if (joinTimer) { clearTimeout(joinTimer); joinTimer = null; } cb.onPaired(room); }
    setStatus('online');
  }

  function handleMessage(_topic, payloadBuf) {
    let m;
    try { m = JSON.parse(payloadBuf.toString()); } catch { return; }
    if (!m || m.__from === myId) return;        // ignore our own echoes
    if (m.type === '__hello') {                 // a peer (re)joined — ALWAYS acknowledge
      markOnline();
      publish({ type: '__hi' });
      if (role === 'display') publish({ type: 'requestState' });
      return;
    }
    if (m.type === '__hi') { markOnline(); return; } // ack — no reply (avoids loops)
    markOnline();                                // any real traffic implies the peer is present
    deliver(m);
  }

  function teardown() {
    clients.forEach((c) => { try { c.end(true); } catch { /* noop */ } });
    clients = [];
  }

  // Connect to every broker at once for the current `room`. Idempotent messages
  // mean duplicates across brokers are harmless.
  function connectAll() {
    teardown();
    clients = BROKERS.map((url, i) => {
      let c;
      try {
        c = window.mqtt.connect(url, {
          clientId: 'saints-' + myId + '-' + i + '-' + Math.random().toString(36).slice(2, 6),
          clean: true, keepalive: 30, connectTimeout: 9000, reconnectPeriod: 4000,
        });
      } catch { return null; }
      c.on('connect', () => {
        diag['b' + i] = 'connected';
        c.subscribe(room, { qos: 0 }, () => publishOn(c, { type: '__hello' }));
        refreshStatus();
      });
      c.on('message', handleMessage);
      c.on('reconnect', () => { diag['b' + i] = 'reconnect'; refreshStatus(); });
      c.on('close', () => { diag['b' + i] = 'close'; refreshStatus(); });
      c.on('error', () => { /* mqtt.js auto-reconnects */ });
      return c;
    }).filter(Boolean);
    refreshStatus();
  }

  async function startRoom() {
    if (mode === 'rtc') return;
    mode = 'rtc'; cb.onMode('rtc'); setStatus('connecting');
    try { await loadMqtt(); } catch { setStatus('offline'); cb.onPairError('Could not load the pairing library.'); return; }
    if (role === 'display') hostRoom();
    else autoJoin();
    // iOS Safari can freeze the socket on screen-lock; re-announce on wake.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && room) {
        clients.forEach((c) => { try { if (c && !c.connected) c.reconnect(); } catch { /* noop */ } });
        publish({ type: '__hello' });
      }
    });
  }

  function hostRoom() {
    myCode = (localStorage.getItem('saints-host-code') || genCode()).toUpperCase();
    localStorage.setItem('saints-host-code', myCode);
    room = TOPIC(myCode);
    cb.onCode(myCode);
    connectAll();
  }

  function doJoin(code, silent) {
    code = (code || '').toUpperCase();
    if (code.length < 4) { cb.onPairError('Enter the 4-character code.'); return; }
    myCode = code;
    room = TOPIC(code);
    peerSeen = false;
    connectAll();
    if (joinTimer) clearTimeout(joinTimer);
    if (!silent) {
      joinTimer = setTimeout(() => {
        if (!peerSeen) cb.onPairError(`Couldn’t reach the big screen for code ${code}. Check the code, make sure the big screen is open, then tap Connect again.`);
      }, 18000);
    }
  }

  function autoJoin() {
    const stored = localStorage.getItem('saints-paired-code') || localStorage.getItem('saints-host-code');
    if (stored) doJoin(stored, true);
    // else wait for a manual pair() — no pre-connect (a room is required first).
  }

  // ===================================================================== send
  function send(obj) {
    if (mode === 'ws' && wsOpen) ws.send(JSON.stringify(obj));
    else if (mode === 'rtc') publish(obj);
  }

  // `?rtc` / `?pair` forces pairing mode even if a WS server exists (testing).
  if (/[?&](rtc|pair)(=|&|$)/.test(location.search)) startRoom();
  else connectWs();

  return {
    send,
    pair(code) { if (mode === 'rtc' && role !== 'display') { localStorage.setItem('saints-paired-code', code.toUpperCase()); doJoin(code, false); } },
    repair() { localStorage.removeItem('saints-paired-code'); peerSeen = false; },
    get mode() { return mode; },
    get code() { return myCode; },
    close() { closedByUs = true; try { ws && ws.close(); } catch { /* noop */ } teardown(); },
  };
};
