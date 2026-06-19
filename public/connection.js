/*
 * A resilient sync layer shared by both screens.
 *
 * Two transports, chosen automatically:
 *   • WebSocket  — when a relay server is present (local `npm start`); gives
 *                  full cross-device sync.
 *   • BroadcastChannel — fallback when there is no server (e.g. a static
 *                  Vercel deploy); syncs windows/tabs in the SAME browser, so
 *                  the "one computer, two displays" setup still works.
 *
 * The app sees one tiny API: createConnection(role, onMessage) -> { send }.
 */
window.createConnection = function createConnection(role, onMessage) {
  const bc = ('BroadcastChannel' in window) ? new BroadcastChannel('saints-of-the-isles') : null;
  let socket = null;
  let wsOpen = false;
  let attempts = 0;
  let closedByUs = false;

  function setStatus(state) {
    document.querySelectorAll('[data-conn-status]').forEach((el) => { el.dataset.connState = state; });
  }

  function deliver(msg) { try { onMessage(msg); } catch { /* ignore */ } }

  // BroadcastChannel only carries messages when the socket isn't doing it.
  if (bc) {
    bc.onmessage = (e) => {
      if (wsOpen) return;            // avoid double-delivery when WS is live
      if (e.data && e.data.__from === role) return; // ignore our own echoes
      deliver(e.data);
    };
  }

  function connectWs() {
    let url;
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      url = `${proto}://${location.host}`;
      socket = new WebSocket(url);
    } catch {
      fallback();
      return;
    }

    socket.addEventListener('open', () => {
      wsOpen = true;
      attempts = 0;
      setStatus('online');
      send({ type: 'hello', role });
    });
    socket.addEventListener('message', (ev) => {
      try { deliver(JSON.parse(ev.data)); } catch { /* ignore */ }
    });
    socket.addEventListener('close', () => {
      wsOpen = false;
      if (closedByUs) return;
      attempts += 1;
      if (attempts <= 3) {
        setStatus('offline');
        setTimeout(connectWs, 400 * attempts);
      } else {
        fallback(); // no server here — settle into BroadcastChannel mode
      }
    });
    socket.addEventListener('error', () => { try { socket.close(); } catch { /* noop */ } });
  }

  // Settle into BroadcastChannel-only mode (static hosting, no relay).
  function fallback() {
    if (bc) {
      setStatus('online');           // same-browser sync is available
      bc.postMessage({ type: 'hello', role, __from: role });
    } else {
      setStatus('offline');
    }
  }

  function send(obj) {
    if (wsOpen && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(obj));
    } else if (bc) {
      bc.postMessage({ ...obj, __from: role });
    }
  }

  connectWs();

  return {
    send,
    close() {
      closedByUs = true;
      if (socket) socket.close();
      if (bc) bc.close();
    },
  };
};
