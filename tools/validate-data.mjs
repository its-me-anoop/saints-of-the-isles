/* Data integrity check: saints.js is complete, consistent, and renderable. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'public', 'saints.js'), 'utf8');
const saints = JSON.parse(src.match(/window\.SAINTS\s*=\s*([\s\S]*);\s*$/)[1]);
const credits = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'credits.json'), 'utf8'));

const errs = [];
const ids = new Set();

if (saints.length < 85) errs.push(`expected >= 85 saints, got ${saints.length}`);

for (const s of saints) {
  const who = s.id || s.name || '(unknown)';
  if (ids.has(s.id)) errs.push(`duplicate id: ${s.id}`);
  ids.add(s.id);
  for (const f of ['id', 'name', 'epithet', 'place', 'region', 'country', 'feast', 'era', 'intro', 'accent']) {
    if (!s[f] || !String(s[f]).trim()) errs.push(`${who}: missing ${f}`);
  }
  if (!Array.isArray(s.story) || !s.story.length) errs.push(`${who}: missing story`);
  if (!Array.isArray(s.facts) || s.facts.length < 2) errs.push(`${who}: fewer than 2 facts`);
  if (!s.pilgrimage || !s.pilgrimage.site) errs.push(`${who}: missing pilgrimage site`);
  if (!s.prayer || !s.prayer.trim()) errs.push(`${who}: missing prayer`);
  if (!(s.lat > 49 && s.lat < 61 && s.lng > -11 && s.lng < 2.5)) errs.push(`${who}: coords out of range`);
  if (!s.map || !(s.map.x > 0 && s.map.x < 720 && s.map.y > 0 && s.map.y < 960)) errs.push(`${who}: pin outside viewBox`);
  if (s.image) {
    if (!fs.existsSync(path.join(ROOT, 'public', s.image))) errs.push(`${who}: image file missing (${s.image})`);
    if (!credits[s.id]) errs.push(`${who}: image without credit entry`);
    if (!s.credit) errs.push(`${who}: image without on-screen credit`);
  }
}

const withImg = saints.filter((s) => s.image).length;
console.log(`saints: ${saints.length} | with image: ${withImg} | monogram: ${saints.length - withImg}`);
if (errs.length) {
  console.log(`\nFAILED — ${errs.length} problem(s):`);
  errs.forEach((e) => console.log('  ✗ ' + e));
  process.exit(1);
}
console.log('all integrity checks passed ✓');
