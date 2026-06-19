/*
 * A tiny resilient WebSocket wrapper shared by both screens.
 * Auto-reconnects with a gentle backoff so an exhibition can survive a
 * flaky network, a sleeping tablet, or a screen that reboots overnight.
 *
 * Both screens just connect to the Node server they were loaded from — no
 * pairing code needed.
 */
window.createConnection = function createConnection(role, onMessage) {
  let socket = null;
  let attempts = 0;
  let closedByUs = false;

  function setStatus(state) {
    document.querySelectorAll('[data-conn-status]').forEach((el) => { el.dataset.connState = state; });
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${proto}://${location.host}`);

    socket.addEventListener('open', () => {
      attempts = 0;
      setStatus('online');
      send({ type: 'hello', role });
    });

    socket.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      onMessage(msg);
    });

    socket.addEventListener('close', () => {
      setStatus('offline');
      if (closedByUs) return;
      attempts += 1;
      setTimeout(connect, Math.min(4000, 400 * attempts));
    });

    socket.addEventListener('error', () => { try { socket.close(); } catch { /* noop */ } });
  }

  function send(obj) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(obj));
    }
  }

  connect();

  return {
    send,
    close() { closedByUs = true; if (socket) socket.close(); },
  };
};
