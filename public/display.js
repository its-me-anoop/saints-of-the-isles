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

  // ---- Audio: ambient music + narration (TTS) + reveal chime ------------
  // The big screen produces all the sound; the tablet's 🔔 toggle controls it.
  let audioCtx = null;
  let musicGain = null;   // music bus (pad + bells)
  let sfxGain = null;     // effects bus (reveal arpeggio, gong)
  let reverbIn = null;    // shared reverb send
  let padVoices = [];
  let chordIdx = 0;
  let speaking = false;   // narration in progress (ducks the music)
  let muted = false;      // narration + chime ("Sound")
  let musicOn = true;     // ambient background music ("Music")
  let unlocked = false;
  const MUSIC_VOL = 0.4;
  const sndind = document.getElementById('sndind');
  const audiostart = document.getElementById('audiostart');
  const speakind = document.getElementById('speakind');

  function reflectSoundIndicator() {
    if (!sndind) return;
    sndind.textContent = (musicOn ? '🎵' : '') + (muted ? '🔇' : '🔊');
    sndind.classList.toggle('is-muted', muted && !musicOn);
  }

  // ---- Ambient engine: a slow chord cycle in a stone-chapel reverb ------
  // D minor -> B-flat -> F -> C, each with matching bell tones above it.
  const CHORDS = [
    { pad: [146.83, 220.00, 293.66, 349.23, 440.00], bells: [587.33, 698.46, 880.00, 1174.66] }, // D minor
    { pad: [116.54, 174.61, 293.66, 349.23, 466.16], bells: [587.33, 698.46, 932.33, 1396.91] }, // B-flat major
    { pad: [130.81, 174.61, 261.63, 349.23, 440.00], bells: [698.46, 880.00, 1046.50, 1396.91] }, // F major
    { pad: [130.81, 196.00, 261.63, 329.63, 392.00], bells: [523.25, 783.99, 1046.50, 1318.51] }, // C major
  ];

  // A generated impulse response — no audio file, sounds like a stone chapel.
  function makeReverb(out) {
    const len = Math.floor(audioCtx.sampleRate * 2.6);
    const ir = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.9);
    }
    const conv = audioCtx.createConvolver();
    conv.buffer = ir;
    reverbIn = audioCtx.createGain();
    const wet = audioCtx.createGain();
    wet.gain.value = 0.5;
    reverbIn.connect(conv); conv.connect(wet); wet.connect(out);
  }

  function startAmbient() {
    if (!audioCtx || musicGain) return;
    // Master bus with a gentle compressor so stacked sounds never clip.
    const master = audioCtx.createGain();
    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
    master.connect(comp); comp.connect(audioCtx.destination);
    makeReverb(master);

    // Two buses — music and effects — each dry + a send into the shared reverb.
    musicGain = audioCtx.createGain();
    musicGain.gain.value = musicOn ? MUSIC_VOL : 0;
    musicGain.connect(master);
    const musicSend = audioCtx.createGain();
    musicSend.gain.value = 0.6;
    musicGain.connect(musicSend); musicSend.connect(reverbIn);

    sfxGain = audioCtx.createGain();
    sfxGain.connect(master);
    const sfxSend = audioCtx.createGain();
    sfxSend.gain.value = 0.8;
    sfxGain.connect(sfxSend); sfxSend.connect(reverbIn);

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1500;
    filter.Q.value = 0.5;
    filter.connect(musicGain);

    padVoices = CHORDS[0].pad.map((f, i) => {
      const g = audioCtx.createGain();
      g.gain.value = 0.07;
      // Spread the five voices across the stereo field.
      let out = filter;
      if (audioCtx.createStereoPanner) {
        const p = audioCtx.createStereoPanner();
        p.pan.value = -0.4 + i * 0.2;
        p.connect(filter);
        out = p;
      }
      g.connect(out);
      const oscA = audioCtx.createOscillator();
      oscA.type = 'sine'; oscA.frequency.value = f; oscA.connect(g); oscA.start();
      const oscB = audioCtx.createOscillator();
      oscB.type = 'triangle'; oscB.frequency.value = f * 1.005; oscB.connect(g); oscB.start();
      const lfo = audioCtx.createOscillator(); // gentle breathing per voice
      lfo.type = 'sine';
      lfo.frequency.value = 0.06 + i * 0.017;
      const lfoG = audioCtx.createGain();
      lfoG.gain.value = 0.025;
      lfo.connect(lfoG); lfoG.connect(g.gain); lfo.start();
      return { oscA, oscB };
    });
    const fLfo = audioCtx.createOscillator(); // slow filter sweep for movement
    fLfo.type = 'sine';
    fLfo.frequency.value = 0.03;
    const fLfoG = audioCtx.createGain();
    fLfoG.gain.value = 500;
    fLfo.connect(fLfoG); fLfoG.connect(filter.frequency); fLfo.start();

    setTimeout(playPhrase, 1400); // let the pad establish, then the hymn begins
  }

  // Glide every pad voice to the notes of chord i.
  function glideChord(i) {
    if (!audioCtx || !padVoices.length) return;
    chordIdx = i % CHORDS.length;
    const now = audioCtx.currentTime;
    CHORDS[chordIdx].pad.forEach((f, k) => {
      const v = padVoices[k];
      if (!v) return;
      v.oscA.frequency.setTargetAtTime(f, now, 4);
      v.oscB.frequency.setTargetAtTime(f * 1.005, now, 4);
    });
  }

  // ---- The melody: a slow, plainchant-like hymn — one phrase per chord ---
  // Stepwise, modal (D natural minor), ending each phrase on a chord tone.
  const N = { G4: 392.00, A4: 440.00, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00 };
  const PHRASES = [
    [[N.A4, 1.1], [N.D5, 0.85], [N.E5, 0.85], [N.F5, 1.3], [N.E5, 1.1], [N.D5, 2.6]], // over D minor
    [[N.F5, 1.1], [N.G5, 0.85], [N.A5, 1.3], [N.G5, 1.1], [N.F5, 2.6]],               // over B-flat
    [[N.A5, 1.1], [N.G5, 0.85], [N.F5, 1.1], [N.E5, 1.3], [N.F5, 2.6]],               // over F
    [[N.G5, 1.1], [N.E5, 0.85], [N.D5, 1.1], [N.C5, 1.3], [N.D5, 2.6]],               // over C, leaning home
  ];

  // A voice-like tone: soft attack, three warm partials, gentle vibrato.
  function melodyNote(freq, dur, when) {
    try {
      const t = audioCtx.currentTime + when;
      const vol = 0.16 + Math.random() * 0.05;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.14);           // sung entry, not struck
      g.gain.setValueAtTime(vol, t + Math.max(0.2, dur * 0.55));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.6);   // long release into the reverb
      let dest = musicGain;
      if (audioCtx.createStereoPanner) {
        const p = audioCtx.createStereoPanner();
        p.pan.value = (Math.random() - 0.5) * 0.5;
        p.connect(musicGain);
        dest = p;
      }
      g.connect(dest);
      const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const o2 = audioCtx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
      const g2 = audioCtx.createGain(); g2.gain.value = 0.18; o2.connect(g2); g2.connect(g);
      const o3 = audioCtx.createOscillator(); o3.type = 'sine'; o3.frequency.value = freq * 3;
      const g3 = audioCtx.createGain(); g3.gain.value = 0.05; o3.connect(g3); g3.connect(g);
      const vib = audioCtx.createOscillator(); vib.frequency.value = 4.6;
      const vibG = audioCtx.createGain(); vibG.gain.value = freq * 0.0035;
      vib.connect(vibG); vibG.connect(o.frequency);
      o.connect(g);
      const end = t + dur + 1.8;
      o.start(t); o2.start(t); o3.start(t); vib.start(t + 0.25);
      o.stop(end); o2.stop(end); o3.stop(end); vib.stop(end);
      // an occasional faint octave shimmer answering the note
      if (Math.random() < 0.3) bellNote(freq * 2, vol * 0.2, musicGain, when + dur * 0.5);
    } catch { /* noop */ }
  }

  let phraseIdx = 0;
  function playPhrase() {
    if (!audioCtx || !musicGain) return;
    glideChord(phraseIdx);               // harmony moves with the melody
    const phrase = PHRASES[phraseIdx % PHRASES.length];
    let t = 0.35;
    for (const [f, d] of phrase) {
      const dur = d * (0.95 + Math.random() * 0.1); // human timing
      melodyNote(f, dur, t);
      t += dur;
    }
    phraseIdx = (phraseIdx + 1) % PHRASES.length;
    // a breath between phrases, as a singer would take
    setTimeout(playPhrase, (t + 1.6 + Math.random() * 2.2) * 1000);
  }

  // Soft bell notes drawn from whichever chord is sounding now.
  function bellNote(freq, vol, bus, when) {
    try {
      const t = audioCtx.currentTime + (when || 0.05);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      let dest = bus;
      if (audioCtx.createStereoPanner) { // each bell rings from its own spot
        const p = audioCtx.createStereoPanner();
        p.pan.value = (Math.random() - 0.5) * 0.9;
        p.connect(bus);
        dest = p;
      }
      g.connect(dest);
      const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const oh = audioCtx.createOscillator(); oh.type = 'sine'; oh.frequency.value = freq * 2;
      const ohg = audioCtx.createGain(); ohg.gain.value = 0.22; oh.connect(ohg); ohg.connect(g);
      o.connect(g);
      o.start(t); o.stop(t + 3.2); oh.start(t); oh.stop(t + 3.2);
    } catch { /* noop */ }
  }

  function rampMusic() {
    if (!musicGain || !audioCtx) return;
    const now = audioCtx.currentTime;
    // Duck under the narration so the voice always sits on top.
    const target = musicOn ? (speaking ? MUSIC_VOL * 0.3 : MUSIC_VOL) : 0;
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setTargetAtTime(target, now, speaking ? 0.25 : 0.6);
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
  // Kiosk mode: if autoplay is already permitted (e.g. Chrome launched with
  // --autoplay-policy=no-user-gesture-required), start without a tap.
  try {
    const probe = new (window.AudioContext || window.webkitAudioContext)();
    if (probe.state === 'running') { audioCtx = probe; unlock(); }
    else probe.close();
  } catch { /* noop */ }

  // ---- Narration (Web Speech) ----
  let voice = null;
  function pickVoice() {
    try {
      const vs = speechSynthesis.getVoices();
      // Prefer LOCAL voices (network voices can silently fail or cut off),
      // and a natural, named British English one when installed.
      const locals = vs.filter((v) => v.localService);
      const pool = locals.length ? locals : vs;
      const pref = ['Serena', 'Kate', 'Stephanie', 'Daniel', 'Arthur', 'Oliver',
        'Google UK English Female', 'Google UK English Male'];
      for (const n of pref) { const v = pool.find((x) => x.name === n); if (v) { voice = v; return; } }
      voice = pool.find((v) => /en[-_]GB/i.test(v.lang)) || pool.find((v) => /^en/i.test(v.lang)) || vs[0] || null;
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
      .replace(/(\d)\s*[-–—]\s*(\d)/g, '$1 to $2')   // "634 – 687" -> "634 to 687"
      .replace(/\s*\([^)]*\)/g, '')                   // drop parenthetical glosses
      .replace(/&/g, ' and ')
      .replace(/[—–]/g, ', ')
      .replace(/\s+/g, ' ')
      .replace(/\.\s*\./g, '.')
      .trim();
  }
  function narrate(s) {
    if (muted || !unlocked || !s) return;
    if (currentId !== s.id) return; // the screen moved on before the voice began
    try {
      speechSynthesis.cancel();
      // Chunk into sentence groups — one very long utterance can be cut off
      // mid-stream by some engines; a queue of short ones is robust.
      const sentences = speechText(s).match(/[^.!?]+[.!?]+(?:["')\]]*)?/g) || [speechText(s)];
      const chunks = [];
      let cur = '';
      for (const sent of sentences) {
        if (cur && (cur + sent).length > 200) { chunks.push(cur); cur = sent; }
        else cur += sent;
      }
      if (cur.trim()) chunks.push(cur);
      // Duck the music and show the speaking bars while the voice is live.
      const done = () => { speaking = false; rampMusic(); if (speakind) speakind.classList.remove('is-on'); };
      chunks.forEach((chunk, i) => {
        const u = new SpeechSynthesisUtterance(chunk.trim());
        u.rate = 0.9; u.pitch = 1.0; u.volume = 1;
        u.lang = (voice && voice.lang) || 'en-GB';
        if (voice) u.voice = voice;
        if (i === 0) u.onstart = () => { speaking = true; rampMusic(); if (speakind) speakind.classList.add('is-on'); };
        if (i === chunks.length - 1) u.onend = done;
        u.onerror = done;
        speechSynthesis.speak(u);
      });
    } catch { /* ignore */ }
  }
  let narrateTimer = null;
  function stopNarration() {
    clearTimeout(narrateTimer);
    try { speechSynthesis.cancel(); } catch { /* noop */ }
    speaking = false;
    if (speakind) speakind.classList.remove('is-on');
    rampMusic();
  }

  function setMuted(m) {        // "Sound" — narration + chime
    muted = !!m;
    if (muted) stopNarration();
    else if (currentId && byId[currentId]) {
      // Unmuting while a saint is showing: pick the narration back up.
      clearTimeout(narrateTimer);
      narrateTimer = setTimeout(() => narrate(byId[currentId]), 400);
    }
    reflectSoundIndicator();
  }
  function setMusic(on) {       // "Music" — ambient background pad
    musicOn = !!on;
    rampMusic();
    reflectSoundIndicator();
  }
  reflectSoundIndicator();

  function chime() {
    if (muted || !audioCtx || !sfxGain) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      // A rising arpeggio of the current chord — the sound of a reveal.
      const bells = CHORDS[chordIdx].bells;
      [0, 1, 2].forEach((i) => {
        bellNote(bells[i % bells.length], 0.15 / (i * 0.35 + 1), sfxGain, 0.03 + i * 0.11);
      });
    } catch { /* ignore */ }
  }

  // A low, soft gong when the screen returns to rest.
  function gong() {
    if (muted || !audioCtx || !sfxGain) return;
    try {
      const t = audioCtx.currentTime + 0.03;
      [73.42, 146.83, 220.5].forEach((f, i) => {
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12 / (i + 1), t + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
        g.connect(sfxGain);
        const o = audioCtx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * (i === 2 ? 1.007 : 1); // slight shimmer on top
        o.connect(g);
        o.start(t); o.stop(t + 4);
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
    const credit = s.credit ? `<div class="saint__credit rise" style="--rise-delay:1.3s">Image: ${esc(s.credit)}</div>` : '';
    const summary = `<p class="saint__summary rise" style="--rise-delay:.9s">${esc(shortSummary(s))}<span class="saint__more"> ✦</span></p>`;
    const facts = (s.facts || []).slice(0, 3).map((f) => `<li>${esc(f)}</li>`).join('');
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
      ? `<blockquote class="saint__prayer rise" style="--rise-delay:1.2s">✛ ${esc(s.prayer)}</blockquote>` : '';

    // Three acts: the face (0s) — the identity (~0.35s) — the story (~0.8s).
    saintEl.innerHTML = `
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

    display.classList.add('has-saint');
    void saintEl.offsetWidth;
    // Re-tapping the same saint replays the narration once it has finished.
    let idle = false;
    try { idle = !speechSynthesis.speaking && !speechSynthesis.pending; } catch { /* noop */ }
    if (changing || idle) {
      chime();
      // Let the chime ring out before the voice enters (also avoids the
      // cancel()->speak() race that can swallow the first utterance).
      clearTimeout(narrateTimer);
      narrateTimer = setTimeout(() => narrate(s), 700);
    }
  }

  function showHome() {
    const had = currentId !== null;
    currentId = null;
    display.classList.remove('has-saint');
    stopNarration();
    if (had) gong();
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
