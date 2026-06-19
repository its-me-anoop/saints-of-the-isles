/*
 * Merge the enrichment workflow output into data/saints.master.json:
 *   - adds `pilgrimage` { site, town } + `prayer` to existing saints
 *   - appends the new saints (Carlo Acutis et al.), normalising their
 *     flat pilgrimageSite/pilgrimageTown into the same shape
 *   - re-sorts roughly north -> south by latitude
 *
 * Input: data/enrichment.json  ({ newSaints:[...], enrich:[...] })
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterPath = path.join(ROOT, 'data', 'saints.master.json');
const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
const result = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'enrichment.json'), 'utf8'));

const byId = new Map(master.map((s) => [s.id, s]));

let enriched = 0;
for (const e of (result.enrich || [])) {
  const s = byId.get(e.id);
  if (s && e.pilgrimageSite) {
    s.pilgrimage = { site: e.pilgrimageSite, town: e.pilgrimageTown || '' };
    s.prayer = e.prayer || '';
    enriched++;
  }
}

let added = 0;
for (const n of (result.newSaints || [])) {
  if (byId.has(n.id)) continue;
  const { pilgrimageSite, pilgrimageTown, prayer, ...rest } = n;
  rest.pilgrimage = { site: pilgrimageSite || '', town: pilgrimageTown || '' };
  rest.prayer = prayer || '';
  master.push(rest);
  byId.set(rest.id, rest);
  added++;
}

master.sort((a, b) => b.lat - a.lat); // north -> south
fs.writeFileSync(masterPath, JSON.stringify(master, null, 2));

const missingPilg = master.filter((s) => !s.pilgrimage || !s.pilgrimage.site).map((s) => s.id);
const missingPrayer = master.filter((s) => !s.prayer).map((s) => s.id);
console.log(`master now ${master.length} saints (+${added} new). enriched ${enriched} existing.`);
console.log(`without pilgrimage: ${missingPilg.length}${missingPilg.length ? ' -> ' + missingPilg.join(', ') : ''}`);
console.log(`without prayer:     ${missingPrayer.length}${missingPrayer.length ? ' -> ' + missingPrayer.join(', ') : ''}`);
