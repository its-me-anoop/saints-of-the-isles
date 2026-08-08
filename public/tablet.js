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
  const surpriseBtn = document.getElementById('surprise');
  const nowchip = document.getElementById('nowchip');
  const nowchipImg = document.getElementById('nowchipImg');
  const nowchipName = document.getElementById('nowchipName');
  let hintDone = false;
  const viewMapBtn = document.getElementById('viewMap');
  const viewListBtn = document.getElementById('viewList');
  const listview = document.getElementById('listview');
  const zoomResetBtn = document.getElementById('zoomReset');
  const mapHint = document.getElementById('mapHint');

  const SVGNS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs) => {
    const node = document.createElementNS(SVGNS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const monogram = (name) => name.replace(/^(St|Saint)\s+/i, '').trim().charAt(0).toUpperCase() || '✠';
  // Every portrait on the tablet is small (cards, the scrub bubble, the chip),
  // so they all come from the generated thumbnails — loading 80 full-size
  // originals at once is what evicts the tab on a memory-tight device.
  const thumb = (image) => `images/thumbs/${image.split('/').pop().replace(/\.(jpe?g|png)$/i, '.webp')}`;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // Haptic feedback (Android/Chrome support navigator.vibrate; iOS Safari ignores it).
  const haptic = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* noop */ } };

  // The "how to use it" hint hides once a visitor has selected a saint, then
  // quietly returns after 25s of idle for whoever walks up next.
  let hintTimer = null;
  function scheduleHintReturn() {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hintDone = false; applyView(); }, 25000);
  }
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
  const MIN_SEP = 22; // keep neighbouring hit-zones honest for fingertips
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
      style: `--pin-accent: ${saint.accent};` });
    g.dataset.id = saint.id;
    g.appendChild(el('circle', { class: 'pin__hit', r: 21, fill: 'transparent' }));
    g.appendChild(el('circle', { class: 'pin__pulse', r: 7 }));
    g.appendChild(el('circle', { class: 'pin__halo', r: 12 }));
    g.appendChild(el('circle', { class: 'pin__dot', r: 4.5 }));
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
    if (mapHint) mapHint.classList.toggle('is-hidden', zoomed || hintDone);
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
      previewEl.style.setProperty('--pin-accent', s.accent);
      previewEl.innerHTML =
        `<div class="preview__img${s.image ? '' : ' is-mono'}" data-mono="${monogram(s.name)}"` +
        `${s.image ? ` style="background-image:url('/${esc(thumb(s.image))}')"` : ''}></div>` +
        `<div class="preview__name">${esc(s.name)}</div>` +
        `<div class="preview__epithet">${esc(s.epithet || '')}</div>` +
        `<div class="preview__place">${esc(s.place)}</div>`;
      previewEl.style.left = `${cx}px`;
      previewEl.style.top = `${cy}px`;
      previewEl.classList.toggle('is-below', cy < w.height * 0.22);
      previewEl.classList.add('is-shown');
      haptic(6); // light tick as the finger passes over each saint
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
    // Capture so this element still receives the up/cancel even if the finger
    // strays outside it — otherwise the entry below is never removed and the
    // stale count disables selection for the rest of the day.
    try { wrap.setPointerCapture(e.pointerId); } catch { /* noop */ }
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
  // `commit` is false for pointercancel: the system aborted the touch (a palm,
  // an incoming call, Control Centre), so it must never push a saint on screen.
  function endPointer(e, commit) {
    try { wrap.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      if (commit && !gestured && underId) select(underId);
      gestured = false; gStart = null; hidePreview();
      scheduleHintReturn();
    } else if (pointers.size === 1) {
      gStart = null; // dropped from pinch to one finger — wait for full release
    }
  }
  wrap.addEventListener('pointerup', (e) => endPointer(e, true));
  wrap.addEventListener('pointercancel', (e) => endPointer(e, false));
  wrap.addEventListener('pointerleave', () => { if (pointers.size === 0) hidePreview(); });
  // Last resort: if a pointer is ever lost without up/cancel (backgrounded tab,
  // rotation mid-gesture), drop the stale state rather than wedge the map.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pointers.clear(); gestured = false; gStart = null; hidePreview(); }
  });

  // ---- Selection --------------------------------------------------------
  let lastSent = { type: 'home' };
  let lastSel = { id: null, t: 0 };
  let nowShowingTimer = null;
  function select(id) {
    const now = performance.now();
    if (id === lastSel.id && now - lastSel.t < 500) return;
    lastSel = { id, t: now };
    haptic(20);
    hintDone = true;
    if (mapHint) mapHint.classList.add('is-hidden'); // visitors have got it now
    lastSent = { type: 'select', id };
    conn.send(lastSent);
    markActive(id);
    const saint = byId[id];
    if (saint) {
      const node = pinNodes.get(id);
      if (node) node.parentNode.appendChild(node);
      nowShowing.innerHTML = `Now on the large display: <b style="--accent: ${saint.accent}">${esc(saint.name)}</b>`;
      nowShowing.classList.add('is-shown');
      clearTimeout(nowShowingTimer);
      nowShowingTimer = setTimeout(() => nowShowing.classList.remove('is-shown'), 3400);
    }
  }
  function markActive(id) {
    pinNodes.forEach((node, key) => node.classList.toggle('is-active', key === id));
    listview.querySelectorAll('.scard').forEach((c) => c.classList.toggle('is-active', c.dataset.id === id));
    // Persistent "now on the big screen" chip in the footer.
    const s = id ? byId[id] : null;
    nowchip.hidden = !s;
    if (s) {
      nowchipName.textContent = s.name;
      nowchipImg.style.backgroundImage = s.image ? `url('/${thumb(s.image)}')` : 'none';
      nowchipImg.textContent = s.image ? '' : monogram(s.name);
      nowchip.style.setProperty('--pin-accent', s.accent);
    }
  }

  resetBtn.addEventListener('click', () => {
    haptic(12);
    lastSent = { type: 'home' };
    conn.send(lastSent);
    markActive(null);
    nowShowing.classList.remove('is-shown');
  });

  // ---- Surprise me: a random saint, anywhere on the isles ----------------
  surpriseBtn.addEventListener('click', () => {
    haptic(16);
    const pool = SAINTS.filter((s) => s.id !== lastSel.id);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    select(pick.id);
  });

  // ---- List view: searchable, filterable by country ----------------------
  const COUNTRY_ORDER = ['Scotland', 'Northern Ireland', 'Ireland', 'England', 'Wales'];
  let countryFilter = 'All';
  function applyListFilter() {
    const q = (document.getElementById('listSearch').value || '').trim().toLowerCase();
    let any = false;
    listview.querySelectorAll('.listgroup').forEach((gr) => {
      const c = gr.dataset.country;
      let vis = 0;
      gr.querySelectorAll('.scard').forEach((card) => {
        const s = byId[card.dataset.id];
        const hay = `${s.name} ${s.aka || ''} ${s.place} ${s.region}`.toLowerCase();
        const ok = (countryFilter === 'All' || c === countryFilter) && (!q || hay.includes(q));
        card.classList.toggle('is-off', !ok);
        if (ok) vis++;
      });
      gr.classList.toggle('is-off', vis === 0);
      any = any || vis > 0;
    });
    document.getElementById('listEmpty').hidden = any;
  }
  (function buildList() {
    const groups = {};
    SAINTS.forEach((s) => { (groups[s.country] = groups[s.country] || []).push(s); });
    const order = COUNTRY_ORDER.filter((c) => groups[c])
      .concat(Object.keys(groups).filter((c) => !COUNTRY_ORDER.includes(c)));
    const chips = ['All'].concat(order).map((c) =>
      `<button class="chip${c === 'All' ? ' is-on' : ''}" data-country="${esc(c)}" aria-pressed="${c === 'All'}">${esc(c)}</button>`).join('');
    const body = order.map((c) => {
      const cards = groups[c].map((s) =>
        `<button class="scard" data-id="${s.id}" style="--pin-accent:${s.accent}">
           <span class="scard__img${s.image ? '' : ' is-mono'}" data-mono="${esc(monogram(s.name))}"` +
        `${s.image ? ` style="background-image:url('/${esc(thumb(s.image))}')"` : ''}></span>
           <span class="scard__name">${esc(s.name)}</span>
           <span class="scard__epi">${esc(s.epithet)}</span>
           <span class="scard__place">${esc(s.place)}</span>
           <span class="scard__feast">Feast · ${esc(s.feast)}</span>
         </button>`).join('');
      return `<section class="listgroup" data-country="${esc(c)}"><h2 class="listgroup__head">${esc(c)} <span>${groups[c].length} saints</span></h2><div class="listgrid">${cards}</div></section>`;
    }).join('');
    listview.innerHTML = `
      <div class="listtools">
        <input id="listSearch" class="listsearch" type="search" placeholder="Search ${SAINTS.length} saints by name or place…"
               aria-label="Search saints" autocomplete="off" autocorrect="off" spellcheck="false" />
        <div class="chiprow" aria-label="Filter saints by country">${chips}</div>
      </div>
      ${body}
      <div class="listempty" id="listEmpty" role="status" hidden>No saints match. Try another name or place.</div>`;
    document.getElementById('listSearch').addEventListener('input', applyListFilter);
    listview.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (chip) {
        haptic(8);
        countryFilter = chip.dataset.country;
        listview.querySelectorAll('.chip').forEach((x) => {
          const selected = x === chip;
          x.classList.toggle('is-on', selected);
          x.setAttribute('aria-pressed', String(selected));
        });
        applyListFilter();
        return;
      }
      const b = e.target.closest('.scard');
      if (b) select(b.dataset.id);
    });
  })();

  // Country headings stick directly below the search + filter bar, whose height
  // changes when the chips wrap (narrow tablets, rotation).
  const listtools = listview.querySelector('.listtools');
  function measureTools() {
    if (listtools) listview.style.setProperty('--tools-h', `${listtools.offsetHeight}px`);
  }
  window.addEventListener('resize', measureTools);
  window.addEventListener('orientationchange', () => setTimeout(measureTools, 120));

  let scrollTimer = null;
  function setView(v) {
    const map = v === 'map';
    wrap.classList.toggle('is-off', !map);
    listview.classList.toggle('is-off', map);
    listview.hidden = map;
    wrap.hidden = !map;
    viewMapBtn.classList.toggle('is-active', map);
    viewListBtn.classList.toggle('is-active', !map);
    viewMapBtn.setAttribute('aria-selected', String(map));
    viewListBtn.setAttribute('aria-selected', String(!map));
    viewMapBtn.tabIndex = map ? 0 : -1;
    viewListBtn.tabIndex = map ? -1 : 0;
    // The incoming panel takes one short breath (outgoing is cut instantly).
    const incoming = map ? wrap : listview;
    incoming.classList.remove('view-enter');
    void incoming.offsetWidth; // restart-safe under rapid toggling
    incoming.classList.add('view-enter');
    clearTimeout(scrollTimer); // a List->Map->List flurry can't fire a stale scroll
    if (!map) {
      measureTools(); // the list has a box only once it is visible
      // Land with the currently-showing saint in view, not the top of A–Z.
      const act = listview.querySelector('.scard.is-active');
      if (act) scrollTimer = setTimeout(() => act.scrollIntoView({ block: 'center', behavior: 'auto' }), 40);
    }
  }
  viewMapBtn.addEventListener('click', () => { haptic(8); setView('map'); });
  viewListBtn.addEventListener('click', () => { haptic(8); setView('list'); });
  [viewMapBtn, viewListBtn].forEach((button) => button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const next = button === viewMapBtn ? viewListBtn : viewMapBtn;
    setView(next === viewMapBtn ? 'map' : 'list');
    next.focus();
  }));
  setView('map');

  // ---- Connection -------------------------------------------------------
  const conn = window.createConnection('tablet', (msg) => {
    if (msg.type === 'select') markActive(msg.id);
    else if (msg.type === 'home') markActive(null);
    else if (msg.type === 'requestState') conn.send(lastSent); // serverless late-join
  });
})();
