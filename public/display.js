/* The stage (big screen). Idle constellation of saints; lean reveal on tap. */
(function () {
  const SAINTS = window.SAINTS;
  const byId = Object.fromEntries(SAINTS.map((s) => [s.id, s]));

  const display = document.getElementById('display');
  const saintEl = document.getElementById('saint');
  const raysEl = document.getElementById('rays');
  const inviteFloat = document.getElementById('inviteFloat');
  const inviteEl = document.getElementById('invite');
  const demo = new URLSearchParams(location.search).get('demo');

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const monogram = (name) => name.replace(/^(St|Saint)\s+/i, '').trim().charAt(0).toUpperCase() || '✠';
  const rnd = (a, b) => a + Math.random() * (b - a);
  // The drifting constellation shows 30 portraits at once, so it uses the
  // generated thumbnails. Only the reveal below loads a full-size original.
  const thumb = (image) => `images/thumbs/${image.split('/').pop().replace(/\.(jpe?g|png)$/i, '.webp')}`;

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

  const sentenceExcerpt = (text, budget) => {
    const full = String(text || '').trim();
    const sentences = full.match(/[^.!?]+[.!?]+(?:["')\]]*)/g) || [full];
    let out = '';
    for (const sentence of sentences) {
      const next = `${out ? `${out} ` : ''}${sentence.trim()}`;
      if (out && next.length > budget) break;
      out = next;
    }
    return out || full;
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
        `--pin-accent:oklch(${s.accent})`, `background-image:url('/${esc(thumb(s.image))}')`,
      ].join(';');
      return `<div class="float-avatar" style="${vars}" title="${esc(s.name)}"></div>`;
    }).join('');
  })();

  // ---- Idle: rotating words of the saints --------------------------------
  (function rotateQuotes() {
    const el = document.getElementById('inviteQuote');
    if (!el) return;
    const pool = SAINTS.filter((s) => s.quote && s.quote.trim().length > 8);
    if (!pool.length) return;
    let qi = Math.floor(Math.random() * pool.length);
    const show = () => {
      const s = pool[qi % pool.length];
      qi += 1;
      el.classList.add('is-out');
      setTimeout(() => {
        el.innerHTML = `&ldquo;${esc(s.quote)}&rdquo;<span>— ${esc(s.name)}</span>`;
        el.classList.remove('is-out');
      }, 650);
    };
    show();
    setInterval(show, 10500);
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

  // ---- Render a saint (lean: short summary + a few facts) ---------------
  function renderSaint(s) {
    const portrait = s.image
      ? `<img class="saint__img" src="/${esc(s.image)}" alt="${esc(s.name)}"
            onerror="this.parentNode.classList.add('is-mono');this.remove();" />`
      : '';
    const frameClass = s.image ? 'saint__frame' : 'saint__frame is-mono';
    const credit = s.credit ? `<div class="saint__credit rise" style="--rise-delay:1.3s">Image: ${esc(s.credit)}</div>` : '';
    const summary = `<p class="saint__summary rise" style="--rise-delay:.9s">${esc(shortSummary(s))}</p>`;
    // With a prayer below, two facts keep the whole column on-screen at 16:9.
    const facts = (s.facts || []).slice(0, s.prayer ? 2 : 3).map((f) => `<li>${esc(f)}</li>`).join('');
    const factsBlock = facts
      ? `<div class="saint__facts-wrap rise" style="--rise-delay:1.05s">
           <div class="saint__facts-head">Curious facts</div>
           <ul class="saint__facts">${facts}</ul>
         </div>` : '';
    const pilg = (s.pilgrimage && s.pilgrimage.site)
      ? `<div class="saint__pilg rise" style="--rise-delay:.6s">
           <span class="saint__pilg-label">Pilgrimage</span>
           <span class="saint__pilg-site">${esc(s.pilgrimage.site)}</span>
           ${s.pilgrimage.town ? `<span class="saint__pilg-town">${esc(s.pilgrimage.town)}</span>` : ''}
         </div>` : '';
    const prayer = s.prayer
      ? `<blockquote class="saint__prayer rise" style="--rise-delay:1.2s"><span>Prayer</span>${esc(sentenceExcerpt(s.prayer, 230))}</blockquote>` : '';

    // Three acts: the face (0s) — the identity (~0.35s) — the story (~0.8s).
    return `
      <div class="saint__left">
        <div class="${frameClass} rise" style="--rise-delay:0s" data-mono="${esc(monogram(s.name))}">
          ${portrait}
        </div>
        <div class="saint__place rise" style="--rise-delay:.42s">${esc(s.place)}</div>
        <div class="saint__region rise" style="--rise-delay:.46s">${esc(s.region)}</div>
        <dl class="saint__meta rise" style="--rise-delay:.52s">
          <div><dt>Feast</dt><dd>${esc(s.feast)}</dd></div>
          <div><dt>Lived</dt><dd>${esc(s.era)}</dd></div>
        </dl>
        ${pilg}
        ${credit}
      </div>
      <div class="saint__right">
        <p class="saint__epithet rise" style="--rise-delay:.38s">${esc(s.epithet)}</p>
        <h1 class="saint__name rise" style="--rise-delay:.35s">${esc(s.name)}</h1>
        <p class="saint__intro rise" style="--rise-delay:.8s">${esc(s.intro)}</p>
        ${summary}
        ${factsBlock}
        ${prayer}
      </div>`;
  }

  // ---- Cinematic sequencer: exit -> held beat -> entrance ----------------
  // Cut grammar: the old shot departs upward (the vector it arrived on), the
  // stage holds a dark beat, then the new procession rises. A generation
  // token — never transitionend — decides who owns the stage, so rapid taps
  // can only ever shorten the dark, not strand it.
  const EXIT_MS = 400;    // subject departs (mirror of --t-exit)
  const HOLD_MS = 200;    // held beat on the empty stage (saint -> saint)
  const IDLE_MS = 260;    // light warms before the first subject (idle -> saint)
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  let token = 0;          // generation counter: the only authority
  let phase = 'idle';     // 'idle' | 'leaving' | 'shown'
  let currentId = null;   // committed saint (unchanged while a shot exits)
  let pendingId = null;   // destination of an in-flight transition (null = idle)
  let phaseTimer = null;  // the single pipeline timer

  function transitionTo(nextId) {  // nextId: saint id, or null = idle
    if (nextId !== null && !byId[nextId]) nextId = null; // unknown id = Clear
    if (phase === 'leaving' && nextId === pendingId) return; // already en route
    if (nextId !== null && nextId === currentId && phase === 'shown') return; // never re-cut the same shot

    const myToken = ++token;      // outvote everything in flight
    clearTimeout(phaseTimer);
    pendingId = nextId;

    const commit = () => {
      if (token !== myToken) return; // a later tap owns the stage
      saintEl.classList.remove('is-exiting');
      display.classList.remove('is-cutting');
      if (nextId === null) {
        currentId = null; pendingId = null; phase = 'idle';
        saintEl.innerHTML = '';   // drop Ken Burns + reveal work for the idle hours
        display.classList.remove('has-saint');
        inviteEl.setAttribute('aria-hidden', 'false');
        saintEl.setAttribute('aria-hidden', 'true');
        return;
      }
      const s = byId[nextId];
      currentId = nextId; pendingId = null; phase = 'shown';
      display.style.setProperty('--accent', `oklch(${s.accent})`); // recolor in the dim
      saintEl.innerHTML = renderSaint(s);
      display.classList.add('has-saint');
      inviteEl.setAttribute('aria-hidden', 'true');
      saintEl.setAttribute('aria-hidden', 'false');
      void saintEl.offsetWidth;
    };

    if (reduced()) { commit(); return; } // reduced motion: instant, correct cut

    // Occupied means a committed shot is visible — the has-saint class alone
    // also covers the 260ms idle warm-up, when there is nothing to exit yet.
    const stageOccupied = display.classList.contains('has-saint') && currentId !== null;
    if (!stageOccupied) {
      if (nextId === null) { commit(); return; } // idle -> idle: kills strays
      // Idle -> saint: light before subject — the invite leaves and the aura
      // warms in the new colour for a beat before the procession enters.
      display.style.setProperty('--accent', `oklch(${byId[nextId].accent})`);
      display.classList.add('has-saint');
      phase = 'leaving';
      phaseTimer = setTimeout(commit, IDLE_MS);
      return;
    }

    phase = 'leaving';
    saintEl.classList.add('is-exiting'); // idempotent mid-exit: the fade never restarts
    if (nextId === null) {
      // Clear: the shot leaves at once; aura/rays decay on their own clocks
      // (drop any mid-cut trough so the decay starts now, not at commit);
      // the invite's transition-delay is the held beat before the exhale.
      display.classList.remove('has-saint');
      display.classList.remove('is-cutting');
      phaseTimer = setTimeout(commit, EXIT_MS);
    } else {
      display.classList.add('is-cutting'); // aura dims to the trough
      phaseTimer = setTimeout(commit, EXIT_MS + HOLD_MS); // swap unseen, in the dark
    }
  }

  // ---- Connection -------------------------------------------------------
  const conn = window.createConnection('display', (msg) => {
    if (demo) return;
    if (msg.type === 'select') transitionTo(msg.id);
    else if (msg.type === 'home') transitionTo(null);
  });
  // Ask the controller for the current state (covers the serverless fallback,
  // where there's no relay to push it on connect) — and keep asking quietly
  // while idle, so a tablet opened later still finds this screen.
  [300, 1200, 2600].forEach((t) => setTimeout(() => conn.send({ type: 'requestState' }), t));
  setInterval(() => { if (phase === 'idle') conn.send({ type: 'requestState' }); }, 5000);

  if (demo) transitionTo(demo);
})();
