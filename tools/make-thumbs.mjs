#!/usr/bin/env node
/*
 * Generate small WebP thumbnails for every saint portrait.
 *
 * Why: the tablet's list view paints all 85 cards at once, and the big screen's
 * idle constellation floats 30 portraits. Pointing those at the full-resolution
 * files means ~23 MB of transfer and ~226 MB of decoded image memory — enough to
 * get a tab evicted on a 3 GB device such as an iPad 7th generation, whose
 * Safari (16.x) also lacks `content-visibility` and so renders every card
 * immediately. Thumbnails cut both figures by roughly twenty times.
 *
 * The short edge is resized to THUMB px so CSS `background-size: cover` still
 * has enough pixels for a 2x display at the sizes these thumbnails are used
 * (80 px cards, 150 px scrub preview, 116 px floating avatars).
 *
 * Only the big screen's main reveal portrait keeps the full-resolution file.
 *
 * Requires: sips (macOS, for reading dimensions) and cwebp (`brew install webp`).
 *
 *   node tools/make-thumbs.mjs [--force]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

// Short edge in pixels. The largest consumer is the tablet's scrub bubble at
// clamp(92px, 13vh, 150px) — 150 CSS px on a 2x display needs 300 device px,
// so 320 keeps it crisp while the 80px cards and 116px avatars have margin.
const THUMB = 320;
const QUALITY = 72;

const root = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(root, 'public', 'images');
const outDir = path.join(srcDir, 'thumbs');
const force = process.argv.includes('--force');

mkdirSync(outDir, { recursive: true });

const sources = readdirSync(srcDir).filter((f) => /\.(jpe?g|png)$/i.test(f));
if (!sources.length) {
  console.error(`No portraits found in ${srcDir}. Run tools/fetch-images.mjs first.`);
  process.exit(1);
}

const dimensions = (file) => {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  const w = Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1]);
  const h = Number(/pixelHeight:\s*(\d+)/.exec(out)?.[1]);
  return { w, h };
};

let made = 0;
let skipped = 0;
let srcBytes = 0;
let outBytes = 0;

for (const name of sources) {
  const src = path.join(srcDir, name);
  const out = path.join(outDir, name.replace(/\.(jpe?g|png)$/i, '.webp'));
  srcBytes += statSync(src).size;

  if (!force && existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) {
    outBytes += statSync(out).size;
    skipped += 1;
    continue;
  }

  const { w, h } = dimensions(src);
  if (!w || !h) {
    console.warn(`  ! could not read dimensions, skipping: ${name}`);
    continue;
  }
  // Resize the SHORT edge to THUMB so `background-size: cover` never upscales.
  const resize = w <= h ? [String(THUMB), '0'] : ['0', String(THUMB)];

  execFileSync('cwebp', ['-quiet', '-q', String(QUALITY), '-resize', ...resize, src, '-o', out]);
  outBytes += statSync(out).size;
  made += 1;
}

const mb = (b) => (b / 1048576).toFixed(1);
console.log(
  `\n  Thumbnails → public/images/thumbs\n` +
  `  ${made} generated, ${skipped} already current, ${sources.length} total\n` +
  `  ${mb(srcBytes)} MB of originals → ${mb(outBytes)} MB of thumbnails ` +
  `(${(srcBytes / Math.max(outBytes, 1)).toFixed(0)}x smaller)\n`
);
