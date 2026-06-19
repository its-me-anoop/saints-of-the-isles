/*
 * Sync layer shared by both screens. Picks a transport automatically:
 *
 *   • WebSocket  — when a relay server is present (local `npm start`); full
 *                  cross-device sync, no pairing code needed.
 *   • MQTT room  — when there is no server (static host such as Vercel). The big
 *                  screen shows a short pairing CODE; the tablet enters it, and
 *                  both subscribe to a topic named after that code on a public
 *                  MQTT broker (secure WebSocket). Messages relay through the
 *                  broker, so it works across ANY network and on iOS Safari —
 *                  no TURN, no NAT/firewall traversal, no accounts.
 *
 * API:  createConnection(role, onMessage, opts) -> { send, pair, repair }
 *   opts.onMode(mode)        'ws' | 'rtc'   ('rtc' = "needs pairing")
 *   opts.onStatus(state)     'connecting' | 'online' | 'offline'
 *   opts.onCode(code)        (display) the pairing code to show
 *   opts.onPaired(code)      the other screen connected
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

  const MQTT_SRC = 'https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js';
  // Public brokers (secure WebSocket). Tried in order; first to connect wins.
  const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
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

  // ================================================================ MQTT room
  let client = null;
  let room = null;        // current topic
  let myCode = null;      // pairing code (display) / joined code (tablet)
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

  function publish(obj) {
    if (client && client.connected && room) {
      try { client.publish(room, JSON.stringify({ ...obj, __from: myId, __role: role })); } catch { /* noop */ }
    }
  }

  function markOnline() {
    if (!peerSeen) { peerSeen = true; if (joinTimer) { clearTimeout(joinTimer); joinTimer = null; } cb.onPaired(room); }
    setStatus('online');
  }

  function handleMessage(_topic, payload) {
    let m;
    try { m = JSON.parse(payload.toString()); } catch { return; }
    if (!m || m.__from === myId) return;          // ignore our own echoes
    if (m.type === '__hello') {                   // a peer (re)joined — ALWAYS acknowledge
      markOnline();
      publish({ type: '__hi' });                  // so every joiner gets a reply, not just the first
      if (role === 'display') publish({ type: 'requestState' }); // pull the tablet's current state
      return;
    }
    if (m.type === '__hi') { markOnline(); return; } // ack — do not reply (prevents hello loops)
    markOnline();                                  // any real traffic means the peer is present
    deliver(m);
  }

  function subscribeRoom() {
    if (!client || !room) return;
    client.subscribe(room, { qos: 0 }, () => { publish({ type: '__hello' }); });
  }

  let brokerIdx = 0;
  function connectBroker(onReady) {
    if (client) { onReady(); return; }
    const tryBroker = () => {
      const url = BROKERS[brokerIdx % BROKERS.length];
      diag.broker = url;
      let connectedOnce = false;
      const c = window.mqtt.connect(url, {
        clientId: 'saints-' + myId + '-' + Math.random().toString(36).slice(2, 6),
        clean: true, keepalive: 30, connectTimeout: 8000, reconnectPeriod: 3000,
      });
      const failover = setTimeout(() => {
        if (!connectedOnce) { try { c.end(true); } catch { /* noop */ } brokerIdx += 1; if (brokerIdx < BROKERS.length) tryBroker(); else setStatus('offline'); }
      }, 9000);
      c.on('connect', () => {
        connectedOnce = true; clearTimeout(failover);
        client = c; diag.mqtt = 'connected';
        setStatus(peerSeen ? 'online' : 'connecting');
        subscribeRoom();
        onReady();
      });
      c.on('reconnect', () => { diag.mqtt = 'reconnect'; if (!peerSeen) setStatus('connecting'); });
      c.on('message', handleMessage);
      c.on('close', () => { diag.mqtt = 'close'; if (!closedByUs && !peerSeen) setStatus('connecting'); });
      c.on('error', () => { /* reconnects automatically */ });
    };
    tryBroker();
  }

  async function startRoom() {
    if (mode === 'rtc') return;
    mode = 'rtc'; cb.onMode('rtc'); setStatus('connecting');
    try { await loadMqtt(); } catch { setStatus('offline'); cb.onPairError('Could not load the pairing library.'); return; }
    if (role === 'display') hostRoom();
    else autoJoin();
  }

  function hostRoom() {
    myCode = (localStorage.getItem('saints-host-code') || genCode()).toUpperCase();
    localStorage.setItem('saints-host-code', myCode);
    room = TOPIC(myCode);
    cb.onCode(myCode);
    connectBroker(() => { /* subscribed in connect handler */ });
  }

  function doJoin(code, silent) {
    code = (code || '').toUpperCase();
    if (code.length < 4) { cb.onPairError('Enter the 4-character code.'); return; }
    const newRoom = TOPIC(code);
    const switchRoom = () => {
      if (client && room && room !== newRoom) { try { client.unsubscribe(room); } catch { /* noop */ } }
      room = newRoom; myCode = code; peerSeen = false;
      subscribeRoom();
      if (joinTimer) clearTimeout(joinTimer);
      if (!silent) {
        joinTimer = setTimeout(() => {
          if (!peerSeen) cb.onPairError(`No big screen found for code ${code}. Check the code on the big screen.`);
        }, 12000);
      }
    };
    connectBroker(() => { if (client.connected) switchRoom(); else client.once('connect', switchRoom); });
  }

  function autoJoin() {
    const stored = localStorage.getItem('saints-paired-code') || localStorage.getItem('saints-host-code');
    if (stored) doJoin(stored, true);
    else connectBroker(() => {}); // pre-connect so manual pairing is instant
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
    close() { closedByUs = true; try { ws && ws.close(); } catch { /* noop */ } try { client && client.end(true); } catch { /* noop */ } },
  };
};
