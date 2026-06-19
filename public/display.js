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

  // ---- Audio: ambient music + narration (TTS) + reveal chime ------------
  // The big screen produces all the sound; the tablet's 🔔 toggle controls it.
  let audioCtx = null;
  let musicGain = null;
  let muted = false;      // narration + chime ("Sound")
  let musicOn = true;     // ambient background music ("Music")
  let unlocked = false;
  const MUSIC_VOL = 0.4;
  const sndind = document.getElementById('sndind');
  const audiostart = document.getElementById('audiostart');

  function reflectSoundIndicator() {
    if (!sndind) return;
    sndind.textContent = (musicOn ? '🎵' : '') + (muted ? '🔇' : '🔊');
    sndind.classList.toggle('is-muted', muted && !musicOn);
  }

  // A calm, audible D-minor pad with gentle bell tones drifting over it.
  function startAmbient() {
    if (!audioCtx || musicGain) return;
    musicGain = audioCtx.createGain();
    musicGain.gain.value = musicOn ? MUSIC_VOL : 0;
    musicGain.connect(audioCtx.destination);

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1500;
    filter.Q.value = 0.5;
    filter.connect(musicGain);

    const chord = [146.83, 220.00, 293.66, 349.23, 440.00]; // D3 A3 D4 F4 A4
    chord.forEach((f, i) => {
      const g = audioCtx.createGain();
      g.gain.value = 0.07;
      g.connect(filter);
      [f, f * 1.005].forEach((freq, j) => {
        const o = audioCtx.createOscillator();
        o.type = j === 0 ? 'sine' : 'triangle';
        o.frequency.value = freq;
        o.connect(g);
        o.start();
      });
      const lfo = audioCtx.createOscillator(); // gentle breathing per voice
      lfo.type = 'sine';
      lfo.frequency.value = 0.06 + i * 0.017;
      const lfoG = audioCtx.createGain();
      lfoG.gain.value = 0.025;
      lfo.connect(lfoG); lfoG.connect(g.gain); lfo.start();
    });
    const fLfo = audioCtx.createOscillator(); // slow filter sweep for movement
    fLfo.type = 'sine';
    fLfo.frequency.value = 0.03;
    const fLfoG = audioCtx.createGain();
    fLfoG.gain.value = 500;
    fLfo.connect(fLfoG); fLfoG.connect(filter.frequency); fLfo.start();

    scheduleBell();
  }

  // Soft, slow bell notes from the chord — gives the pad a sense of music.
  function scheduleBell() {
    if (!audioCtx || !musicGain) return;
    try {
      const notes = [587.33, 698.46, 880.00, 1046.50]; // D5 F5 A5 C6
      const f = notes[Math.floor(Math.random() * notes.length)];
      const t = audioCtx.currentTime + 0.05;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      g.connect(musicGain);
      const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const oh = audioCtx.createOscillator(); oh.type = 'sine'; oh.frequency.value = f * 2;
      const ohg = audioCtx.createGain(); ohg.gain.value = 0.22; oh.connect(ohg); ohg.connect(g);
      o.connect(g);
      o.start(t); o.stop(t + 3.2); oh.start(t); oh.stop(t + 3.2);
    } catch { /* noop */ }
    setTimeout(scheduleBell, 2600 + Math.random() * 4200);
  }

  function rampMusic() {
    if (!musicGain || !audioCtx) return;
    const now = audioCtx.currentTime;
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setTargetAtTime(musicOn ? MUSIC_VOL : 0, now, 0.5);
  }

  function unlock() {
    if (unlocked) {
      if (audiostart) audiostart.classList.add('is-gone');
      return;
    }
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      startAmbient();
      try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch { /* noop */ }
      unlocked = true;
      if (currentId && byId[currentId]) narrate(byId[currentId]);
    } catch { /* ignore */ }
    if (audiostart) audiostart.classList.add('is-gone');
    reflectSoundIndicator();
  }
  if (audiostart) audiostart.addEventListener('click', unlock);
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlock, { once: true }));

  // ---- Narration (Web Speech) ----
  let voice = null;
  function pickVoice() {
    try {
      const vs = speechSynthesis.getVoices();
      // Prefer a natural, named British English voice when one is installed.
      const pref = ['Google UK English Female', 'Google UK English Male', 'Serena', 'Kate', 'Stephanie',
        'Daniel', 'Arthur', 'Oliver', 'Microsoft Libby Online (Natural) - English (United Kingdom)',
        'Microsoft Sonia Online (Natural) - English (United Kingdom)'];
      for (const n of pref) { const v = vs.find((x) => x.name === n); if (v) { voice = v; return; } }
      voice = vs.find((v) => /en[-_]GB/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || vs[0] || null;
    } catch { voice = null; }
  }
  try { pickVoice(); speechSynthesis.addEventListener('voiceschanged', pickVoice); } catch { /* noop */ }

  // Build clear, naturally-spoken narration: expand abbreviations the speech
  // engine mangles ("St" -> "Saint", "c." -> "circa", drop "S.J."/"O.S.B."...).
  function speechText(s) {
    const parts = [s.name, s.epithet, s.intro, shortSummary(s)];
    if (s.pilgrimage && s.pilgrimage.site) {
      parts.push(`You can visit ${s.pilgrimage.site}${s.pilgrimage.town ? ', ' + s.pilgrimage.town : ''}`);
    }
    return parts.filter(Boolean).join('. ')
      .replace(/\bSt\.?\s/g, 'Saint ')
      .replace(/\bc\.\s*(?=\d)/g, 'circa ')
      .replace(/\bd\.\s*(?=\d)/g, 'died ')
      .replace(/,?\s*(?:S\.?J\.?|O\.?S\.?B\.?|O\.?F\.?M\.?|O\.?P\.?)\b/g, '')
      .replace(/&/g, ' and ')
      .replace(/[—–]/g, ', ')
      .replace(/\s+/g, ' ')
      .replace(/\.\s*\./g, '.')
      .trim();
  }
  function narrate(s) {
    if (muted || !unlocked || !s) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(speechText(s));
      u.rate = 0.9; u.pitch = 1.0; u.volume = 1;
      u.lang = (voice && voice.lang) || 'en-GB';
      if (voice) u.voice = voice;
      speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }
  function stopNarration() { try { speechSynthesis.cancel(); } catch { /* noop */ } }

  function setMuted(m) {        // "Sound" — narration + chime
    muted = !!m;
    if (muted) stopNarration();
    reflectSoundIndicator();
  }
  function setMusic(on) {       // "Music" — ambient background pad
    musicOn = !!on;
    rampMusic();
    reflectSoundIndicator();
  }
  reflectSoundIndicator();

  function chime() {
    if (muted || !audioCtx) return;
    try {
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
    } catch { /* ignore */ }
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
    const pilg = (s.pilgrimage && s.pilgrimage.site)
      ? `<div class="saint__pilg rise" style="--rise-delay:.32s">
           <span class="saint__pilg-label">Pilgrimage</span>
           <span class="saint__pilg-site">${esc(s.pilgrimage.site)}</span>
           ${s.pilgrimage.town ? `<span class="saint__pilg-town">${esc(s.pilgrimage.town)}</span>` : ''}
         </div>` : '';
    const prayer = s.prayer
      ? `<blockquote class="saint__prayer rise" style="--rise-delay:.58s">✛ ${esc(s.prayer)}</blockquote>` : '';

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
        ${pilg}
        ${credit}
      </div>
      <div class="saint__right">
        <p class="saint__epithet rise" style="--rise-delay:.1s">${esc(s.epithet)}</p>
        <h1 class="saint__name rise" style="--rise-delay:.16s">${esc(s.name)}</h1>
        <p class="saint__intro rise" style="--rise-delay:.24s">${esc(s.intro)}</p>
        ${summary}
        ${factsBlock}
        ${prayer}
      </div>`;

    display.classList.add('has-saint');
    void saintEl.offsetWidth;
    if (changing) { chime(); narrate(s); }
  }

  function showHome() {
    currentId = null;
    display.classList.remove('has-saint');
    stopNarration();
  }

  // ---- Connection -------------------------------------------------------
  const conn = window.createConnection('display', (msg) => {
    if (msg.type === 'select') showSaint(msg.id);
    else if (msg.type === 'home') showHome();
    else if (msg.type === 'mute') setMuted(msg.muted);
    else if (msg.type === 'music') setMusic(msg.on);
  });
  // Ask the controller for the current state (covers the serverless fallback,
  // where there's no relay to push it on connect).
  [300, 1200, 2600].forEach((t) => setTimeout(() => conn.send({ type: 'requestState' }), t));

  const demo = new URLSearchParams(location.search).get('demo');
  if (demo) showSaint(demo);
})();
