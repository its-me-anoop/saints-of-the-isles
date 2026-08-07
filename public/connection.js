/*
 * A tiny resilient connection shared by both screens.
 *
 * Preferred transport: the WebSocket relay served by server.js — it works
 * across devices on the same network and survives sleeps, reboots, and flaky
 * Wi-Fi via auto-reconnect.
 *
 * Serverless fallback (static hosting, e.g. the Vercel deployment): when no
 * relay answers, the screens talk over a BroadcastChannel instead. That works
 * whenever both pages share one browser — the classic one-computer exhibition
 * rig with the visitor map on one monitor and the display on the other.
 */
window.createConnection = function createConnection(role, onMessage) {
  let socket = null;
  let attempts = 0;
  let closedByUs = false;
  let relayFound = false; // a relay has answered at least once this session

  const channel = 'BroadcastChannel' in window
    ? new BroadcastChannel('saints-of-the-isles')
    : null;

  function setStatus(state) {
    document.querySelectorAll('[data-conn-status]').forEach((el) => { el.dataset.connState = state; });
  }

  // --- BroadcastChannel fallback (same browser, two windows) --------------
  if (channel) {
    channel.onmessage = (event) => {
      if (socket && socket.readyState === WebSocket.OPEN) return; // relay is authoritative
      setStatus('online'); // a peer window exists on this machine
      onMessage(event.data);
    };
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    try {
      socket = new WebSocket(`${proto}://${location.host}`);
    } catch {
      socket = null;
      return;
    }

    socket.addEventListener('open', () => {
      attempts = 0;
      relayFound = true;
      setStatus('online');
      send({ type: 'hello', role });
    });

    socket.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      onMessage(msg);
    });

    socket.addEventListener('close', () => {
      if (closedByUs) return;
      attempts += 1;
      if (relayFound) {
        // The relay existed and dropped: flag it and hurry back.
        setStatus('offline');
        setTimeout(connect, Math.min(4000, 400 * attempts));
      } else {
        // No relay ever answered (static hosting): rest on the
        // BroadcastChannel and probe again only occasionally, quietly.
        setTimeout(connect, 15000);
      }
    });

    socket.addEventListener('error', () => { try { socket.close(); } catch { /* noop */ } });
  }

  function send(obj) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(obj));
    } else if (channel) {
      channel.postMessage(obj);
    }
  }

  connect();

  return {
    send,
    close() {
      closedByUs = true;
      if (socket) socket.close();
      if (channel) channel.close();
    },
  };
};
