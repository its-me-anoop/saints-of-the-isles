/* The stage (big screen). Idle constellation of saints; lean reveal on tap. */
(function () {
  const SAINTS = window.SAINTS;
  const byId = Object.fromEntries(SAINTS.map((s) => [s.id, s]));

  const display = document.getElementById('display');
  const saintEl = document.getElementById('saint');
  const raysEl = document.getElementById('rays');
  const inviteFloat = document.getElementById('inviteFloat');

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const monogram = (name) => name.replace(/^(St|Saint)\s+/i, '').trim().charAt(0).toUpperCase() || '✠';
  const rnd = (a, b) => a + Math.random() * (b - a);

  // A short summary made of WHOLE sentences within a budget — never truncated.
  const shortSummary = (s) => {
    const full = ((s.story && s.story.join(' ')) || s.intro || '').trim();
    const sentences = full.match(/[^.!?]+[.!?]+(?:["')\]]*)/g) || [full];
    let out = '';
    for (const sent of sentences) {
      const next = (out ? out + ' ' : '') + sent.trim();
      if (out && next.length > 240) break; // keep at least one full sentence
      out = next;
      if (out.length >= 190) break;         // enough for a lean summary
    }
    return out.trim();
  };

  // ---- Idle invitation: a drifting constellation of saint portraits -----
  (function buildFloaters() {
    const pool = SAINTS.filter((s) => s.image);
    for (let i = pool.length - 1; i > 0; i--) { // shuffle
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const chosen = pool.slice(0, 30);
    inviteFloat.innerHTML = chosen.map((s) => {
      const size = Math.round(rnd(46, 116));
      const left = rnd(1, 94).toFixed(1);
      const top = rnd(1, 90).toFixed(1);
      const dur = rnd(18, 40).toFixed(1);
      const delay = (-rnd(0, dur)).toFixed(1);
      const op = rnd(0.2, 0.62).toFixed(2);
      const vars = [
        `--s:${size}px`, `left:${left}%`, `top:${top}%`,
        `--dx0:${rnd(-50, 50).toFixed(0)}px`, `--dy0:${rnd(-50, 50).toFixed(0)}px`,
        `--dx1:${rnd(-50, 50).toFixed(0)}px`, `--dy1:${rnd(-50, 50).toFixed(0)}px`,
        `--dur:${dur}s`, `animation-delay:${delay}s`, `opacity:${op}`,
        `--pin-accent:oklch(${s.accent})`, `background-image:url('/${esc(s.image)}')`,
      ].join(';');
      return `<div class="float-avatar" style="${vars}" title="${esc(s.name)}"></div>`;
    }).join('');
  })();

  // ---- Rays behind the portrait ----------------------------------------
  (function buildRays() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '-100 -100 200 200');
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const outer = i % 2 === 0 ? 98 : 66;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', (Math.cos(a) * 30).toFixed(2));
      line.setAttribute('y1', (Math.sin(a) * 30).toFixed(2));
      line.setAttribute('x2', (Math.cos(a) * outer).toFixed(2));
      line.setAttribute('y2', (Math.sin(a) * outer).toFixed(2));
      line.setAttribute('stroke', 'oklch(var(--accent))');
      line.setAttribute('stroke-width', i % 2 === 0 ? '1.4' : '0.7');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('opacity', i % 2 === 0 ? '0.7' : '0.35');
      svg.appendChild(line);
    }
    raysEl.appendChild(svg);
  })();

  // ---- Sound: a gentle chime, governed by the tablet --------------------
  let audioCtx = null;
  let muted = false;

  // Browsers block audio until a gesture; the operator's setup click unlocks it.
  function unlock() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch { /* ignore */ }
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, unlock, { once: true }));

  function chime() {
    if (muted) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      [523.25, 783.99, 1046.5].forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        const peak = 0.16 / (i + 1);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(peak, now + 0.02 + i * 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.6 + i * 0.3);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 3.2);
      });
    } catch { /* audio not available — no problem */ }
  }

  // ---- Render a saint (lean: short summary + a few facts) ---------------
  let currentId = null;
  function showSaint(id) {
    const s = byId[id];
    if (!s) return showHome();
    const changing = id !== currentId;
    currentId = id;

    display.style.setProperty('--accent', `oklch(${s.accent})`);

    const portrait = s.image
      ? `<img class="saint__img" src="/${esc(s.image)}" alt="${esc(s.name)}"
            onerror="this.parentNode.classList.add('is-mono');this.remove();" />`
      : '';
    const frameClass = s.image ? 'saint__frame' : 'saint__frame is-mono';
    const credit = s.credit ? `<div class="saint__credit rise" style="--rise-delay:.5s">Image: ${esc(s.credit)}</div>` : '';
    const summary = `<p class="saint__summary rise" style="--rise-delay:.3s">${esc(shortSummary(s))}</p>`;
    const facts = (s.facts || []).slice(0, 3).map((f) => `<li>${esc(f)}</li>`).join('');
    const factsBlock = facts
      ? `<div class="saint__facts-wrap rise" style="--rise-delay:.4s">
           <div class="saint__facts-head">Curious facts</div>
           <ul class="saint__facts">${facts}</ul>
         </div>` : '';

    saintEl.innerHTML = `
      <div class="saint__left">
        <div class="${frameClass} rise" style="--rise-delay:.05s" data-mono="${esc(monogram(s.name))}">
          ${portrait}
        </div>
        <div class="saint__place rise" style="--rise-delay:.16s">${esc(s.place)}</div>
        <div class="saint__region rise" style="--rise-delay:.19s">${esc(s.region)}</div>
        <dl class="saint__meta rise" style="--rise-delay:.26s">
          <div><dt>Feast</dt><dd>${esc(s.feast)}</dd></div>
          <div><dt>Lived</dt><dd>${esc(s.era)}</dd></div>
        </dl>
        ${credit}
      </div>
      <div class="saint__right">
        <p class="saint__epithet rise" style="--rise-delay:.1s">${esc(s.epithet)}</p>
        <h1 class="saint__name rise" style="--rise-delay:.16s">${esc(s.name)}</h1>
        <p class="saint__intro rise" style="--rise-delay:.24s">${esc(s.intro)}</p>
        ${summary}
        ${factsBlock}
      </div>`;

    display.classList.add('has-saint');
    void saintEl.offsetWidth;
    if (changing) chime();
  }

  function showHome() {
    currentId = null;
    display.classList.remove('has-saint');
  }

  // ---- Pairing panel (only shown when on the WebRTC transport) ----------
  const pairbox = document.getElementById('pairbox');
  const pairCodeEl = document.getElementById('pairCode');
  let rtcMode = false, codeShown = null, linked = false;
  function refreshPairbox() { pairbox.hidden = !(rtcMode && !linked && codeShown); }

  // ---- Connection -------------------------------------------------------
  const conn = window.createConnection('display', (msg) => {
    if (msg.type === 'select') showSaint(msg.id);
    else if (msg.type === 'home') showHome();
    else if (msg.type === 'mute') { muted = !!msg.muted; }
  }, {
    onMode: (m) => { rtcMode = (m === 'rtc'); refreshPairbox(); },
    onStatus: (s) => { linked = (s === 'online'); refreshPairbox(); },
    onCode: (code) => { codeShown = code; pairCodeEl.textContent = code.split('').join(' '); refreshPairbox(); },
    onPaired: () => { linked = true; refreshPairbox(); },
  });
  // Ask the controller for the current state (covers reconnects).
  [300, 1200, 2600].forEach((t) => setTimeout(() => conn.send({ type: 'requestState' }), t));

  const demo = new URLSearchParams(location.search).get('demo');
  if (demo) showSaint(demo);
})();
