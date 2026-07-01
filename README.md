# ✠ Saints of the Isles

An interactive, two-screen exhibition piece. Visitors **touch a place on a real
map of the British Isles on a tablet**, and a **large screen** beside it comes
alive with the story of the Catholic saint who shaped that place — their actual
portrait (a painting, icon, statue or stained-glass window), dates, feast day, a
short summary, and a few curious facts, set in an illuminated-manuscript style.

The two screens stay in sync over your local network through a small Node
server — **no pairing code, they connect automatically**.

- **85 saints** across England, Scotland, Wales, Northern Ireland & Ireland —
  from St Cuthbert to **St Carlo Acutis** (born in London, canonised 2025), each
  with a **pilgrimage site** and a short **prayer**.
- A **large, geographically accurate** UK + Ireland map (real coastline, real
  pin positions) rendered from open GISCO geometry, filling the tablet.
- **Scrub to preview** (drag a finger across the map to see a circular avatar of
  the saint under your finger; lift to send them to the big screen),
  **pinch to zoom**, and a **Map / List** toggle (saints grouped by country).
- The **big screen narrates** each saint aloud (Web Speech, sentence-chunked,
  local-voice preferred), reads the pilgrimage site, and plays a **plainchant-like
  hymn**: a composed four-phrase melody sung in a voice-like tone over a chord
  cycle (D minor → B♭ → F → C) that glides in step with each phrase, inside a
  generated stone-chapel reverb — ducked under the voice, all toggled from the
  tablet. Reveals arpeggiate the current chord; clearing rings a soft gong.
- **Searchable list** (name/place + country filter chips), a ✨ **Surprise me**
  button, a persistent *now-showing* chip, and touch sounds + haptics on the
  tablet. The idle big screen drifts portraits and rotates the saints' own words.
- **Real portraits** for 80 of the 85 saints, downloaded from Wikimedia Commons
  with full attribution (the few without a usable image show an elegant
  monogram). Images are stored locally so the kiosk works offline.
- The **big screen** opens with a living constellation of drifting saint
  portraits; each reveal stays lean — a short summary and a few curious facts.
- **Sound is controlled from the tablet** (the 🔔 button); the big screen obeys.

---

## Run it

```bash
npm install
npm start
```

The terminal prints the addresses to open. Typically:

| Screen           | URL                              |
| ---------------- | -------------------------------- |
| Launcher         | `http://localhost:3000/`         |
| **Tablet** (map) | `http://localhost:3000/tablet`   |
| **Big screen**   | `http://localhost:3000/display`  |

Run on another port with `PORT=8080 npm start`.

### Two devices (tablet + big screen)

The server also prints a `http://<your-ip>:3000/...` address. On **both**
devices open that address (not `localhost` — on the tablet, `localhost` means
the tablet itself):

- big screen → `http://<your-ip>:3000/display`
- tablet → `http://<your-ip>:3000/tablet`

Both devices must be on the **same Wi-Fi as the computer** running the server,
and that computer's firewall must allow port 3000. They connect automatically
and reconnect on their own if a device sleeps or reboots — no code needed.

## Exhibition setup tips

- Open **`/display`** full-screen (kiosk mode) on the big screen — landscape,
  1080p or larger looks best.
- Open **`/tablet`** full-screen on the tablet; the map fills the screen and the
  pins have finger-sized tap targets.
- The 🔔 button (on the **tablet**) toggles the soft reveal chime that plays on
  the big screen — silence it in a quiet gallery. Browsers block audio until a
  click, so click the big screen once at setup to allow the chime.
- **"Clear the screen"** on the tablet returns the display to its idle
  invitation.

## How it fits together

```
server.js              Express static host + a tiny WebSocket relay
public/
  index.html           launcher
  tablet.html + tablet.js   the touch map (controller)
  display.html + display.js the big-screen reveal (stage)
  map.js               GENERATED — accurate SVG coastline paths + viewBox
  saints.js            GENERATED — the 78 saints, each with projected pin x/y,
                       accent colour, image path and credit
  images/              GENERATED — downloaded saint portraits
  connection.js        auto-reconnecting WebSocket shared by both screens
  styles.css           the illuminated-manuscript styling
data/
  saints.master.json   the researched master list (source of truth for content)
  saints.final.json    master + accent + image path + credit
  credits.json         per-image source / licence / artist
  uk-ie.geo.json       trimmed GISCO geometry (UK + Ireland), for regeneration
tools/
  genmap.mjs           projects geometry + pins -> map.js + saints.js (d3-geo)
  fetch-images.mjs     downloads portraits from Wikimedia + records credits
  gen-credits.mjs      builds CREDITS.md from credits.json
```

A tap sends `{ type: 'select', id }` to the server, which remembers it and
broadcasts to every connected screen — so a late-joining display catches up
instantly.

## Editing the saints / regenerating

The content lives in **`data/saints.master.json`**. To change the line-up:

```bash
# 1. edit data/saints.master.json
node tools/fetch-images.mjs   # (re)download portraits — resumable, polite
node tools/genmap.mjs         # re-project pins, rebuild public/map.js + saints.js
node tools/gen-credits.mjs    # refresh CREDITS.md
```

The map projection comes from `data/uk-ie.geo.json` (no network needed).

## Image credits & licensing

Portraits are from **Wikimedia Commons / Wikipedia**, mostly public-domain
artwork or freely-licensed photographs. Per-image author and licence are listed
in **[`CREDITS.md`](CREDITS.md)**. Before any reuse beyond this exhibition,
check the linked file page for the authoritative current terms.

## Standalone preview

Preview one reveal without a tablet:
`http://localhost:3000/display?demo=cuthbert` (any saint `id` from `saints.js`).
