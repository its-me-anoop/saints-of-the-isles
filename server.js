'use strict';

/*
 * Saints of the Isles — exhibition relay server.
 *
 * Serves two synced clients on the same origin:
 *   /tablet   the touch map (the "controller")
 *   /display  the big screen (the "stage")
 *
 * A tap on the tablet sends a { type: 'select', id } message. The server
 * remembers the current selection and broadcasts it to every connected
 * screen, so a display that joins late immediately catches up.
 */

const path = require('path');
const http = require('http');
const os = require('os');
const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// Friendly default: visiting "/" lands on the launcher.
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// The single shared piece of exhibition state: what the big screen is showing,
// plus the sound setting (controlled from the tablet, obeyed by the display).
let currentState = { type: 'home' };
let muted = false;     // narration + chime ("Sound")
let musicOn = true;    // ambient background music

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(data);
    }
  }
}

wss.on('connection', (socket) => {
  let role = 'unknown';

  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed frames
    }

    switch (msg.type) {
      case 'hello':
        role = msg.role || 'unknown';
        // Sync a freshly-joined screen to the current selection + sound setting.
        socket.send(JSON.stringify(currentState));
        socket.send(JSON.stringify({ type: 'mute', muted }));
        socket.send(JSON.stringify({ type: 'music', on: musicOn }));
        break;

      case 'select':
      case 'home':
        currentState = msg.type === 'home' ? { type: 'home' } : { type: 'select', id: msg.id };
        broadcast(currentState);
        break;

      case 'mute':
        muted = !!msg.muted;
        broadcast({ type: 'mute', muted });
        break;

      case 'music':
        musicOn = !!msg.on;
        broadcast({ type: 'music', on: musicOn });
        break;

      case 'requestState':
        socket.send(JSON.stringify(currentState));
        break;

      default:
        // Pass-through for any future message types (e.g. ambient cues).
        broadcast(msg);
    }
  });
});

function localAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n  ⚠  Port ${PORT} is already in use.\n` +
      `     Something else (perhaps another copy of this app) is running there.\n` +
      `     Start on a different port instead, e.g.:  PORT=3001 npm start\n`
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  const lines = [
    '',
    '  ✠  Saints of the Isles  ✠',
    '  ─────────────────────────',
    `  Launcher   →  http://localhost:${PORT}/`,
    `  Tablet     →  http://localhost:${PORT}/tablet`,
    `  Big screen →  http://localhost:${PORT}/display`,
    '',
  ];
  const ips = localAddresses();
  if (ips.length) {
    lines.push('  On the same Wi-Fi, open these from another device:');
    for (const ip of ips) {
      lines.push(`    Tablet  →  http://${ip}:${PORT}/tablet`);
      lines.push(`    Screen  →  http://${ip}:${PORT}/display`);
    }
    lines.push('');
  }
  console.log(lines.join('\n'));
});
