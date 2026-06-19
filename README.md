# ✠ Saints of the Isles

An interactive, two-screen exhibition piece. Visitors **touch a place on a real
map of the British Isles on a tablet**, and a **large screen** beside it comes
alive with the story of the Catholic saint who shaped that place — their actual
portrait (a painting, icon, statue or stained-glass window), dates, feast day, a
short tale, fun facts, and a closing quote, set in an illuminated-manuscript
style.

The two screens stay in sync over the local network, so the tablet and the big
display can be the same computer (two windows) **or two separate devices on the
same Wi-Fi**.

- **78 saints** across England, Scotland, Wales, Northern Ireland & Ireland.
- A **large, geographically accurate** UK + Ireland map (real coastline, real
  pin positions) rendered from open GISCO geometry, filling the tablet so it's
  easy to touch.
- **Scrub to preview:** drag a finger across the map and a circular avatar of
  the saint under your finger appears; lift to send them to the big screen.
- **Pinch to zoom** the map (two fingers) and **switch to a List view** — saints
  grouped by country, tap to send any of them to the big screen.
- **Real portraits** for 74 of the 78 saints, downloaded from Wikimedia Commons
  with full attribution (the few without a usable image show an elegant
  monogram). Images are stored locally so the kiosk works offline.
- The **big screen** opens with a living constellation of saint portraits
  drifting behind the title, and each reveal stays lean — a short summary and a
  few curious facts, never overflowing.
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

### Two devices on the same Wi-Fi

The server also prints a `http://<your-ip>:3000/...` address. Open `…/tablet` on
the tablet and `…/display` on the screen's browser — they connect automatically
and reconnect on their own if a device sleeps or reboots.

## Hosting & how the two screens pair

The sync layer ([`public/connection.js`](public/connection.js)) picks its
transport automatically:

- **WebSocket** when a relay server is present (local `npm start`) — the tablet
  and big screen connect automatically across the network, no code needed.
- **WebRTC pairing** when there is no server (a static host such as **Vercel**).
  The big screen shows a 4-character **pairing code**; enter it on the tablet
  and the two connect **directly, device-to-device**. A free public PeerJS
  broker is used only for the brief handshake — the live link is a direct
  peer-to-peer DataChannel, so it works across separate devices with no backend.

### Pairing on the hosted site
1. Open **`/display`** on the big screen — it shows a pairing code (e.g. `3YWS`).
2. Open **`/tablet`** on the tablet, type the code, tap **Connect**.
3. They link up; tapping a saint on the tablet now reveals it on the big screen.
   Tap the "Big screen" status dot on the tablet to re-pair if the link drops.

**Keep both devices on the same Wi-Fi.** WebRTC connects them directly, which
works on a shared network without client-isolation (the normal on-site setup).
Connecting across *different* networks (e.g. mobile data, or guest Wi-Fi that
isolates clients / uses symmetric NAT) requires a **TURN relay**, and there is
no working free public one. To support those cases, add your own TURN
credentials (a free metered.ca key is plenty) in any of these ways — no code
change needed:

```js
// option A: a tiny inline <script> before the other scripts, on both pages
window.SAINTS_TURN = [{ urls: 'turn:YOUR.HOST:3478', username: 'U', credential: 'C' }];
```
```
// option B: per-device, in the browser console / DevTools
localStorage.setItem('saints-ice', JSON.stringify([
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'turn:YOUR.HOST:3478', username: 'U', credential: 'C' }
]));
// option C: a URL param — ?ice=<base64 of that same JSON array>
```

Append `?rtc` to either URL to force pairing mode even when a relay server is
available (handy for testing).

> Live demo: **https://saints-of-the-isles.vercel.app** — open `/display` and
> `/tablet` on two devices and pair them.

## Exhibition setup tips

- Open **`/display`** full-screen (kiosk mode) on the big screen — landscape,
  1080p or larger looks best.
- Open **`/tablet`** full-screen on the tablet; the map fills the screen and the
  pins have finger-sized tap targets.
- The 🔔 button (on the **tablet**) toggles the soft reveal chime that plays on
  the big screen — silence it in a quiet gallery.
- Browsers block audio until a click, so click the big screen once at setup
  (going full-screen does it) to allow the chime.
- **"Clear the screen"** on the tablet returns the display to its idle invitation.

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

The content lives in **`data/saints.master.json`** (name, place, lat/lng, feast,
era, story, facts, quote, Wikipedia title). To change the line-up:

```bash
# 1. edit data/saints.master.json
node tools/fetch-images.mjs   # (re)download portraits — resumable, polite
node tools/genmap.mjs         # re-project pins, rebuild public/map.js + saints.js
node tools/gen-credits.mjs    # refresh CREDITS.md
```

`fetch-images.mjs` skips saints already on disk, throttles requests and retries
rate-limits, so re-running only fills gaps. The map projection comes from
`data/uk-ie.geo.json` (no network needed); set `GEO_SRC=...` to use other
geometry.

## Image credits & licensing

Portraits are from **Wikimedia Commons / Wikipedia**, mostly public-domain
artwork or freely-licensed photographs. Per-image author and licence are listed
in **[`CREDITS.md`](CREDITS.md)**. Before any reuse beyond this exhibition,
check the linked file page for the authoritative current terms.

## Standalone preview

Preview one reveal without a tablet:
`http://localhost:3000/display?demo=cuthbert` (any saint `id` from `saints.js`).
