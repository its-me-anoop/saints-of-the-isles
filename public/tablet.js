/* The controller. Real SVG map with scrub-preview + pinch-zoom, a list view,
   and selection relayed to the big screen. */
(function () {
  const SAINTS = window.SAINTS;
  const MAP = window.UK_MAP;
  const byId = Object.fromEntries(SAINTS.map((s) => [s.id, s]));

  const wrap = document.getElementById('mapwrap');
  const previewEl = document.getElementById('preview');
  const nowShowing = document.getElementById('nowshowing');
  const resetBtn = document.getElementById('reset');
  const soundBtn = document.getElementById('sound');
  const viewMapBtn = document.getElementById('viewMap');
  const viewListBtn = document.getElementById('viewList');
  const listview = document.getElementById('listview');
  const zoomResetBtn = document.getElementById('zoomReset');
  const mapHint = document.getElementById('mapHint');
  const pairgate = document.getElementById('pairgate');
  const pairInput = document.getElementById('pairInput');
  const pairConnect = document.getElementById('pairConnect');
  const pairMsg = document.getElementById('pairMsg');

  const SVGNS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs) => {
    const node = document.createElementNS(SVGNS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const monogram = (name) => name.replace(/^(St|Saint)\s+/i, '').trim().charAt(0).toUpperCase() || '✠';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const [, , VW, VH] = MAP.viewBox.split(' ').map(Number);

  // ---- Build the map ----------------------------------------------------
  const svg = el('svg', { viewBox: MAP.viewBox, role: 'img',
    'aria-label': 'Map of Britain and Ireland with Catholic saints' });

  const defs = el('defs', {});
  defs.innerHTML = `
    <linearGradient id="landGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="oklch(31% 0.05 266)" />
      <stop offset="55%" stop-color="oklch(25% 0.045 272)" />
      <stop offset="100%" stop-color="oklch(20% 0.04 278)" />
    </linearGradient>`;
  svg.appendChild(defs);

  // Static backdrop (does not zoom).
  for (let i = 0; i < 3; i++) {
    svg.appendChild(el('ellipse', { class: 'sea-ring',
      cx: VW * 0.52, cy: VH * 0.5, rx: VW * 0.42 + i * 70, ry: VH * 0.42 + i * 80 }));
  }
  const compass = el('g', { class: 'compass', transform: `translate(${VW * 0.13} ${VH * 0.14})` });
  compass.appendChild(el('circle', { cx: 0, cy: 0, r: 26, fill: 'none', 'stroke-width': 1 }));
  compass.appendChild(el('path', { d: 'M0 -34 L7 0 L0 34 L-7 0 Z', fill: 'oklch(72% 0.10 86 / 0.5)', 'stroke-width': 0.6 }));
  compass.appendChild(el('path', { d: 'M-34 0 L0 7 L34 0 L0 -7 Z', fill: 'oklch(72% 0.10 86 / 0.25)', 'stroke-width': 0.6 }));
  const nLabel = el('text', { x: 0, y: -40, 'text-anchor': 'middle' });
  nLabel.textContent = 'N';
  compass.appendChild(nLabel);
  svg.appendChild(compass);

  // Everything that zooms lives in this layer.
  const zoomLayer = el('g', { class: 'zoomLayer' });
  svg.appendChild(zoomLayer);
  zoomLayer.appendChild(el('path', { class: 'land land--ireland', d: MAP.ireland }));
  zoomLayer.appendChild(el('path', { class: 'land land--britain', d: MAP.uk }));

  // ---- Declutter pins ---------------------------------------------------
  const MIN_SEP = 15;
  const placed = [];
  function settle(x, y) {
    let px = x, py = y;
    for (let guard = 0; guard < 40; guard++) {
      const clash = placed.find((p) => Math.hypot(p.x - px, p.y - py) < MIN_SEP);
      if (!clash) break;
      const ang = guard * 2.39996;
      const rad = MIN_SEP * (1 + guard * 0.18);
      px = x + Math.cos(ang) * rad;
      py = y + Math.sin(ang) * rad;
    }
    placed.push({ x: px, y: py });
    return [px, py];
  }

  const pinNodes = new Map();
  SAINTS.forEach((saint, i) => {
    const [x, y] = settle(saint.map.x, saint.map.y);
    const g = el('g', { class: 'pin', tabindex: '0', role: 'button',
      'aria-label': `${saint.name}, ${saint.place}`,
      transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`,
      style: `--pin-accent: oklch(${saint.accent});` });
    g.dataset.id = saint.id;
    g.appendChild(el('circle', { class: 'pin__hit', r: 18, fill: 'transparent' }));
    g.appendChild(el('circle', { class: 'pin__pulse', r: 7 }));
    g.appendChild(el('circle', { class: 'pin__halo', r: 12 }));
    const dot = el('circle', { class: 'pin__dot', r: 4.5 });
    dot.style.animationDelay = `${(i % 9) * 0.35}s`;
    g.appendChild(dot);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(saint.id); }
    });
    pinNodes.set(saint.id, g);
    zoomLayer.appendChild(g);
  });

  wrap.appendChild(svg);

  // ---- Zoom + pan -------------------------------------------------------
  const view = { k: 1, tx: 0, ty: 0 };
  const userPt = svg.createSVGPoint();
  function toUser(cx, cy) {
    userPt.x = cx; userPt.y = cy;
    const p = userPt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  }
  function clampView() {
    view.tx = clamp(view.tx, VW * (1 - view.k), 0);
    view.ty = clamp(view.ty, VH * (1 - view.k), 0);
  }
  function applyView() {
    zoomLayer.setAttribute('transform', `translate(${view.tx.toFixed(2)} ${view.ty.toFixed(2)}) scale(${view.k.toFixed(4)})`);
    const zoomed = view.k > 1.02;
    zoomResetBtn.hidden = !zoomed;
    zoomResetBtn.setAttribute('aria-hidden', String(!zoomed));
    if (mapHint) mapHint.classList.toggle('is-hidden', zoomed);
  }
  function zoomAt(cx, cy, kNew) {
    const U = toUser(cx, cy);
    const Fx = (U.x - view.tx) / view.k;
    const Fy = (U.y - view.ty) / view.k;
    view.k = clamp(kNew, 1, 4.5);
    view.tx = U.x - view.k * Fx;
    view.ty = U.y - view.k * Fy;
    clampView();
    applyView();
  }
  zoomResetBtn.addEventListener('click', () => { view.k = 1; view.tx = 0; view.ty = 0; applyView(); });
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, view.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
  }, { passive: false });

  // ---- Pointer manager: 1 finger scrubs, 2 fingers pinch/pan ------------
  const pointers = new Map();
  let underId = null, shownId = null, gestured = false, gStart = null;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function pinIdFromPoint(cx, cy) {
    const t = document.elementFromPoint(cx, cy);
    const g = t && t.closest && t.closest('.pin');
    return g ? g.dataset.id : null;
  }
  function setPreview(id) {
    if (id && id !== shownId) {
      shownId = id;
      const s = byId[id];
      const r = pinNodes.get(id).getBoundingClientRect();
      const w = wrap.getBoundingClientRect();
      const cx = r.left + r.width / 2 - w.left;
      const cy = r.top + r.height / 2 - w.top;
      previewEl.style.setProperty('--pin-accent', `oklch(${s.accent})`);
      previewEl.innerHTML =
        `<div class="preview__img${s.image ? '' : ' is-mono'}" data-mono="${monogram(s.name)}"` +
        `${s.image ? ` style="background-image:url('/${esc(s.image)}')"` : ''}></div>` +
        `<div class="preview__name">${esc(s.name)}</div>` +
        `<div class="preview__place">${esc(s.place)}</div>`;
      previewEl.style.left = `${cx}px`;
      previewEl.style.top = `${cy}px`;
      previewEl.classList.toggle('is-below', cy < w.height * 0.22);
      previewEl.classList.add('is-shown');
    }
    pinNodes.forEach((node, key) => node.classList.toggle('is-hover', key === underId));
  }
  function hidePreview() {
    previewEl.classList.remove('is-shown');
    shownId = null; underId = null;
    pinNodes.forEach((node) => node.classList.remove('is-hover'));
  }
  function scrub(cx, cy) {
    underId = pinIdFromPoint(cx, cy);
    if (underId) setPreview(underId);
    else pinNodes.forEach((node) => node.classList.remove('is-hover'));
  }

  wrap.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      gestured = true; hidePreview();
      const [a, b] = [...pointers.values()];
      const m = mid(a, b); const U = toUser(m.x, m.y);
      gStart = { dist: dist(a, b), k: view.k, Fx: (U.x - view.tx) / view.k, Fy: (U.y - view.ty) / view.k };
    } else if (pointers.size === 1 && !gestured) {
      scrub(e.clientX, e.clientY);
    }
  });
  wrap.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2 && gStart) {
      const [a, b] = [...pointers.values()];
      const m = mid(a, b); const U = toUser(m.x, m.y);
      view.k = clamp(gStart.k * dist(a, b) / gStart.dist, 1, 4.5);
      view.tx = U.x - view.k * gStart.Fx;
      view.ty = U.y - view.k * gStart.Fy;
      clampView(); applyView();
    } else if (pointers.size === 1 && !gestured) {
      scrub(e.clientX, e.clientY);
    }
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      if (!gestured && underId) select(underId);
      gestured = false; gStart = null; hidePreview();
    } else if (pointers.size === 1) {
      gStart = null; // dropped from pinch to one finger — wait for full release
    }
  }
  wrap.addEventListener('pointerup', endPointer);
  wrap.addEventListener('pointercancel', endPointer);
  wrap.addEventListener('pointerleave', () => { if (pointers.size === 0) hidePreview(); });

  // ---- Selection --------------------------------------------------------
  let lastSent = { type: 'home' };
  let lastSel = { id: null, t: 0 };
  let nowShowingTimer = null;
  function select(id) {
    const now = performance.now();
    if (id === lastSel.id && now - lastSel.t < 500) return;
    lastSel = { id, t: now };
    lastSent = { type: 'select', id };
    conn.send(lastSent);
    markActive(id);
    const saint = byId[id];
    if (saint) {
      const node = pinNodes.get(id);
      if (node) node.parentNode.appendChild(node);
      nowShowing.innerHTML = `Now on the big screen — <b style="--accent: oklch(${saint.accent})">${esc(saint.name)}</b>`;
      nowShowing.classList.add('is-shown');
      clearTimeout(nowShowingTimer);
      nowShowingTimer = setTimeout(() => nowShowing.classList.remove('is-shown'), 3400);
    }
  }
  function markActive(id) {
    pinNodes.forEach((node, key) => node.classList.toggle('is-active', key === id));
    listview.querySelectorAll('.scard').forEach((c) => c.classList.toggle('is-active', c.dataset.id === id));
  }

  resetBtn.addEventListener('click', () => {
    lastSent = { type: 'home' };
    conn.send(lastSent);
    markActive(null);
    nowShowing.classList.remove('is-shown');
  });

  // ---- List view --------------------------------------------------------
  const COUNTRY_ORDER = ['Scotland', 'Northern Ireland', 'Ireland', 'England', 'Wales'];
  (function buildList() {
    const groups = {};
    SAINTS.forEach((s) => { (groups[s.country] = groups[s.country] || []).push(s); });
    const order = COUNTRY_ORDER.filter((c) => groups[c])
      .concat(Object.keys(groups).filter((c) => !COUNTRY_ORDER.includes(c)));
    listview.innerHTML = order.map((c) => {
      const cards = groups[c].map((s) =>
        `<button class="scard" data-id="${s.id}" style="--pin-accent:oklch(${s.accent})">
           <span class="scard__img${s.image ? '' : ' is-mono'}" data-mono="${esc(monogram(s.name))}"` +
        `${s.image ? ` style="background-image:url('/${esc(s.image)}')"` : ''}></span>
           <span class="scard__name">${esc(s.name)}</span>
           <span class="scard__place">${esc(s.place)}</span>
         </button>`).join('');
      return `<div class="listgroup"><div class="listgroup__head">${esc(c)} <span>·&nbsp;${groups[c].length}</span></div><div class="listgrid">${cards}</div></div>`;
    }).join('');
    listview.addEventListener('click', (e) => {
      const b = e.target.closest('.scard');
      if (b) select(b.dataset.id);
    });
  })();

  function setView(v) {
    const map = v === 'map';
    wrap.classList.toggle('is-off', !map);
    listview.classList.toggle('is-off', map);
    listview.hidden = map;
    viewMapBtn.classList.toggle('is-active', map);
    viewListBtn.classList.toggle('is-active', !map);
    viewMapBtn.setAttribute('aria-selected', String(map));
    viewListBtn.setAttribute('aria-selected', String(!map));
  }
  viewMapBtn.addEventListener('click', () => setView('map'));
  viewListBtn.addEventListener('click', () => setView('list'));
  setView('map');

  // ---- Sound (governs the big screen) -----------------------------------
  let muted = false;
  function reflectSound(m) {
    muted = !!m;
    soundBtn.textContent = muted ? '🔕 Muted' : '🔔 Sound';
    soundBtn.setAttribute('aria-pressed', String(!muted));
    soundBtn.classList.toggle('is-off', muted);
  }
  soundBtn.addEventListener('click', () => {
    conn.send({ type: 'mute', muted: !muted });
    reflectSound(!muted);
  });

  // ---- Pairing gate (only on the WebRTC transport) ----------------------
  let rtcMode = false, linked = false;
  function refreshGate() { pairgate.hidden = !(rtcMode && !linked); if (!pairgate.hidden) setTimeout(() => pairInput.focus(), 60); }

  // ---- Connection -------------------------------------------------------
  const conn = window.createConnection('tablet', (msg) => {
    if (msg.type === 'select') markActive(msg.id);
    else if (msg.type === 'home') markActive(null);
    else if (msg.type === 'mute') reflectSound(msg.muted);
    else if (msg.type === 'requestState') conn.send(lastSent); // late-join sync
  }, {
    onMode: (m) => { rtcMode = (m === 'rtc'); refreshGate(); },
    onStatus: (s) => { linked = (s === 'online'); if (linked) { pairMsg.textContent = ''; pairMsg.classList.remove('is-error'); } refreshGate(); },
    onPaired: () => { linked = true; refreshGate(); },
    onPairError: (msg) => { if (msg) { pairMsg.textContent = msg; pairMsg.classList.add('is-error'); } },
  });

  function attemptPair() {
    const code = (pairInput.value || '').trim().toUpperCase();
    if (code.length < 4) { pairMsg.textContent = 'Enter the 4-character code.'; pairMsg.classList.add('is-error'); return; }
    pairMsg.classList.remove('is-error');
    pairMsg.textContent = 'Connecting…';
    conn.pair(code);
  }
  pairConnect.addEventListener('click', attemptPair);
  pairInput.addEventListener('input', () => {
    pairInput.value = pairInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  });
  pairInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptPair(); });

  // Tap the "Big screen" lamp to re-pair (handy if the link drops).
  const lamp = document.querySelector('.lamp[data-conn-status]');
  if (lamp) lamp.addEventListener('click', () => {
    if (rtcMode) { conn.repair(); linked = false; pairMsg.textContent = ''; pairMsg.classList.remove('is-error'); refreshGate(); }
  });
})();
