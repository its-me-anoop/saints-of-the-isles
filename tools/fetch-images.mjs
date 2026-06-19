/*
 * Fetch a real portrait for every saint from Wikipedia/Wikimedia Commons.
 *
 * For each saint we ask the MediaWiki API for the article's lead image,
 * download a large rendered thumbnail (always browser-friendly JPEG/PNG even
 * when the source is a TIFF or SVG), and record licence/attribution so we can
 * credit the artwork properly.
 *
 * Polite + resumable: throttled, retries on HTTP 429, and skips saints whose
 * image is already on disk — so re-running only fills the gaps.
 *
 * Input:  data/saints.master.json   (array of saints, each with a "wiki" title)
 * Output: public/images/<id>.<ext>  (downloaded portraits)
 *         data/saints.final.json     (master + image path + accent colour)
 *         data/credits.json          (per-image source / licence / artist)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'public', 'images');
const UA = 'SaintsOfTheIsles-Exhibition/1.0 (educational museum kiosk; contact anoopjose.flutterly@gmail.com)';

const PALETTE = [
  '66% 0.14 25', '70% 0.12 78', '72% 0.13 132', '64% 0.13 158',
  '70% 0.11 196', '64% 0.12 218', '62% 0.13 244', '58% 0.15 280',
  '60% 0.15 312', '66% 0.16 8', '74% 0.13 88', '60% 0.13 168',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRetry(url, opts = {}, tries = 5) {
  let delay = 800;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
      if (res.status === 429 || res.status === 503) {
        const ra = Number(res.headers.get('retry-after')) * 1000;
        await sleep(ra > 0 ? ra : delay);
        delay *= 2;
        continue;
      }
      return res;
    } catch (e) {
      if (attempt === tries) throw e;
      await sleep(delay);
      delay *= 2;
    }
  }
  throw new Error('rate-limited after retries');
}

async function api(params) {
  const url = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ format: 'json', ...params });
  const res = await fetchRetry(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// Files that are never a portrait — chrome, icons, maps, heraldry, etc.
const JUNK = /commons-logo|wiki(source|media|data)|edit-?(icon|clear)|locator|location_map|\bmap\b|coat[_ ]of[_ ]arms|escutcheon|\bflag\b|red[_ ]?pog|loudspeaker|ambox|question_book|portal|crystal|disambig|symbol|blason|arms_of|\.ogg$|\.svg$/i;

// Primary: pageimages lead thumbnail. Fallbacks: REST summary, then any
// plausible portrait among the page's images (stained glass, statues, icons).
async function leadImage(title, hintName) {
  const data = await api({
    action: 'query', redirects: '1', titles: title,
    prop: 'pageimages', piprop: 'thumbnail|name', pithumbsize: '900',
  });
  const pages = data.query && data.query.pages;
  const page = pages && Object.values(pages)[0];
  if (page && page.thumbnail) {
    return { thumb: page.thumbnail.source, file: page.pageimage ? 'File:' + page.pageimage : null };
  }
  // Fallback 1: REST summary.
  try {
    const res = await fetchRetry('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')));
    if (res.ok) {
      const sum = await res.json();
      const src = (sum.originalimage && sum.originalimage.source) || (sum.thumbnail && sum.thumbnail.source);
      if (src && /\.(jpe?g|png)$/i.test(src)) return { thumb: src, file: null };
    }
  } catch { /* ignore */ }
  // Fallback 2: scan all images on the page for a portrait-like file.
  try {
    const list = await api({ action: 'query', redirects: '1', titles: title, prop: 'images', imlimit: '60' });
    const lp = Object.values(list.query.pages)[0];
    const files = (lp && lp.images ? lp.images.map((im) => im.title) : [])
      .filter((t) => /\.(jpe?g|png)$/i.test(t) && !JUNK.test(t));
    const last = (hintName || '').replace(/^(St|Saint)\s+/i, '').split(/\s+/).pop().toLowerCase();
    files.sort((a, b) => {
      const score = (t) => (t.toLowerCase().includes(last) ? 2 : 0) + (/saint|st[._ ]/i.test(t) ? 1 : 0);
      return score(b) - score(a);
    });
    if (files.length) {
      const ii = await api({ action: 'query', titles: files[0], prop: 'imageinfo', iiprop: 'url', iiurlwidth: '900' });
      const info = Object.values(ii.query.pages)[0];
      const src = info && info.imageinfo && (info.imageinfo[0].thumburl || info.imageinfo[0].url);
      if (src) return { thumb: src, file: files[0] };
    }
  } catch { /* ignore */ }
  // Fallback 3: Commons search, but only accept a file whose NAME contains the
  // saint's distinctive name (guards against grabbing an unrelated image).
  try {
    const last = (hintName || '').replace(/^(St|Saint)\s+/i, '').split(/\s+/).pop().toLowerCase();
    const cu = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
      format: 'json', action: 'query', generator: 'search',
      gsrsearch: `${hintName} saint`, gsrnamespace: '6', gsrlimit: '15',
      prop: 'imageinfo', iiprop: 'url', iiurlwidth: '900',
    });
    const res = await fetchRetry(cu);
    if (res.ok) {
      const j = await res.json();
      const pages = (j.query && j.query.pages) ? Object.values(j.query.pages) : [];
      const cand = pages.find((p) => /\.(jpe?g|png)$/i.test(p.title) && !JUNK.test(p.title)
        && last.length > 3 && p.title.toLowerCase().includes(last) && p.imageinfo);
      if (cand) {
        const src = cand.imageinfo[0].thumburl || cand.imageinfo[0].url;
        if (src) return { thumb: src, file: cand.title };
      }
    }
  } catch { /* ignore */ }
  return null;
}

async function fileCredit(fileTitle) {
  if (!fileTitle) return {};
  try {
    const data = await api({
      action: 'query', titles: fileTitle, prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiextmetadatafilter: 'LicenseShortName|License|Artist|Credit|Attribution|ImageDescription',
    });
    const page = Object.values(data.query.pages)[0];
    const info = page && page.imageinfo && page.imageinfo[0];
    if (!info) return {};
    const em = info.extmetadata || {};
    const strip = (s) => (s ? String(s.value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '');
    return { descriptionUrl: info.descriptionurl, license: strip(em.LicenseShortName), artist: strip(em.Artist) };
  } catch {
    return {};
  }
}

async function download(url, destNoExt) {
  const res = await fetchRetry(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  const ext = ct.includes('png') ? 'png' : ct.includes('svg') ? 'svg' : 'jpg';
  const buf = Buffer.from(await res.arrayBuffer());
  const file = `${destNoExt}.${ext}`;
  fs.writeFileSync(file, buf);
  return { file: path.basename(file), bytes: buf.length };
}

function existingImage(id) {
  for (const ext of ['jpg', 'png', 'svg', 'jpeg']) {
    const p = path.join(IMG_DIR, `${id}.${ext}`);
    if (fs.existsSync(p) && fs.statSync(p).size > 1500) return `images/${id}.${ext}`;
  }
  return null;
}

const master = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'saints.master.json'), 'utf8'));
const creditsPath = path.join(ROOT, 'data', 'credits.json');
const credits = fs.existsSync(creditsPath) ? JSON.parse(fs.readFileSync(creditsPath, 'utf8')) : {};
const final = [];
let ok = 0, miss = 0, skipped = 0;

for (let i = 0; i < master.length; i++) {
  const s = master[i];
  const accent = PALETTE[(i * 5) % PALETTE.length];
  let image = existingImage(s.id);
  let credit = credits[s.id];

  if (image) {
    skipped++;
  } else {
    try {
      const lead = await leadImage(s.wiki, s.name);
      if (lead && lead.thumb) {
        const dl = await download(lead.thumb, path.join(IMG_DIR, s.id));
        image = 'images/' + dl.file;
        const cr = await fileCredit(lead.file);
        credit = { name: s.name, source: lead.thumb, ...cr };
        credits[s.id] = credit;
        ok++;
        console.log(`✓ ${s.name.padEnd(28)} ${image} (${Math.round(dl.bytes / 1024)}kb)`);
      } else {
        miss++;
        console.log(`· ${s.name.padEnd(28)} no image (wiki: ${s.wiki})`);
      }
    } catch (e) {
      miss++;
      console.log(`✗ ${s.name.padEnd(28)} ${e.message} (wiki: ${s.wiki})`);
    }
    await sleep(350); // be polite to Wikimedia
  }

  const bits = credit ? [credit.artist, credit.license].filter(Boolean) : [];
  const creditStr = image ? (bits.length ? bits.join(' · ') : 'Wikimedia Commons') : null;
  final.push({ ...s, accent, image: image || null, credit: creditStr });
}

fs.writeFileSync(path.join(ROOT, 'data', 'saints.final.json'), JSON.stringify(final, null, 2));
fs.writeFileSync(creditsPath, JSON.stringify(credits, null, 2));
console.log(`\nDone: ${ok} new, ${skipped} already on disk, ${miss} without an image (of ${master.length}).`);
