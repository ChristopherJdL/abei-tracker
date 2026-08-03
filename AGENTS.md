# AGENTS.md — Abei Finder GBA

Context for coding agents working on this repo. Keep changes small, match the existing pixel/arctic aesthetic, and never commit secrets or Vercel/GitHub credentials.

## What this is

A **client-only SPA** that mimics a retro “tracker console” (Spidey Tracker–inspired). Users open an intro screen, then pan a world map. **Bear-print markers** open a **pixel “ENCOUNTER CARD”** modal showing a scene image for that location.

There is no backend, database, or auth. Content is static files under `public/`.

## Stack & layout

| Piece | Choice |
| --- | --- |
| App | React 19 + TypeScript |
| Build | Vite → `dist/` |
| Map | **MapLibre GL** (WebGL) + CARTO `dark_all` raster (OSM). Free, no API key. Continuous GPU zoom. |
| Sightings data | `public/locations.json` |
| Scene art | `public/scenes/<id>.png` |
| Character / markers | `public/assets/abei.png`, `bear-print.png`, `marker.png` |
| Deploy | Vercel (SPA); Amplify-friendly `_redirects` also present |

### Source map

```
src/
  App.tsx                 # shell: intro gate, chrome, modal host
  App.css                 # arctic UI, frame, encounter card, mobile
  index.css               # CSS vars, MapLibre tweaks, pixel font
  types.ts                # Sighting / SightingStatus
  components/
    IntroScreen.tsx       # first-run gate (“OPEN TRACKER”)
    AbeiMap.tsx           # MapLibre GL map, markers, fit/ease, reveal
    EncounterModal.tsx    # portal pixel window + scene image
  lib/
    sightings.ts          # new/near reveal helpers
    discovered.ts         # localStorage discovered ids
public/
  locations.json          # all paws — edit this to add locations
  scenes/                 # encounter PNGs referenced by JSON
  assets/                 # abei sprite (transparent), paw, map marker
  _redirects              # Amplify SPA fallback
vercel.json               # SPA rewrite → index.html
```

## Design choices (do not casually undo)

### Aesthetic

- **Arctic / ice palette** (CSS vars in `src/index.css`): ice cyan, frost white, glacier, crystal highlights, ice-edge borders (`--ice-edge`, `--ice-shadow`) — no seal brown. Avoid purple/glow AI-default looks.
- **Pixel UI**: Press Start 2P, chunky borders, scanlines on encounter art, GBA-ish “ENCOUNTER CARD” chrome.
- **Reference vibe**: Spidey Tracker (map + pixel HUD + character), but simpler — no sound pipeline, no activity log product surface.

### Map UX (important)

- Map **must stay draggable/zoomable**, including when a sighting is “LOCKED”.
- **No sightings list on the map** — players hunt paws on the globe; do not re-add a spoiler HUD.
- **New paw reveal**: sightings with `createdOn` within the last 24h show a yellow radar halo only when zoomed in near the pin (`REVEAL_MIN_ZOOM` in `src/lib/sightings.ts`). Uses `public/assets/marker-new.png` (yellow ring). Once opened, `localStorage` (`abei-discovered-ids`) remembers the find — no more yellow halo for that paw.
- Encounter UI is portaled to `document.body` with **`pointer-events: none`** on the overlay layer; only the cart has `pointer-events: auto` so pan works around it.
- Decorative overlays (grid, tint, aurora) use `pointer-events: none`.
- `AbeiMap` uses **MapLibre GL (WebGL)** for Spidey-class continuous zoom/pan. Selecting a sighting eases to it at the **current zoom** (no forced zoom-in).
- **Zoom hygiene (do not regress):** Spidey Tracker is Google Maps/WebGL. Leaflet DOM raster tiles cannot match it (choppy zoom + white gaps on zoom-out). Keep **MapLibre GL** with free CARTO/OSM tiles (`raster-fade-duration: 0`, arctic navy background). Do **not** reintroduce Leaflet. Do **not** switch to Google Maps (billing required — not free-of-charge with certainty). No `mix-blend-mode` / `contain:paint` over the map frame.
- Pinch/wheel zoom only — no on-screen +/- controls.

### Encounter modal

- Pixel bezel + title bar (“ENCOUNTER CARD”) + large scene frame with speech bubble.
- Close via X, BACK TO MAP, or Escape.
- Scene images should be shown with `image-rendering: pixelated` where it helps.

### Assets

- Original Abei sprite had a **hot-pink / magenta chroma** background; production asset is `public/assets/abei.png` with that keyed out (Pillow flood-fill + despill). Do not reintroduce opaque pink fringes.
- Header logo: crystalline ice paw (`public/assets/bear-print.png`). Map markers use ice paw on cyan/white badge (`marker.png`).
- Scene art was generated (Cursor GenerateImage) with Abei as reference; owners may replace PNGs anytime — paths stay in JSON.

## Adding a location (checklist)

1. Add `public/scenes/<id>.png` (prefer ~4:3, pixel-art consistent with Abei: white bear, red scarf, mint shirt).
2. Append to `public/locations.json`:

```json
{
  "id": "unique-kebab-id",
  "title": "Short Title",
  "subtitle": "One witty line.",
  "lat": 0,
  "lng": 0,
  "image": "/scenes/unique-kebab-id.png",
  "status": "CONFIRMED",
  "createdOn": "2026-08-02T12:00:00.000Z"
}
```

3. Set `createdOn` to the ISO timestamp when the sighting goes live. For 24 hours after that, the paw glows **yellow with a radar halo** when the map is zoomed in near the pin (scavenger-hunt reveal); then it returns to normal cyan.
4. Use real-ish lat/lng so the paw sits on the right place (extreme poles are hard to click — prefer slightly inland Antarctica coords if needed).
5. No code change required unless you add fields (then update `src/types.ts` + UI).
6. Redeploy if production should update (see below).

### Current sightings (at time of writing)

Arctic, Sahara, Desert Sunset (taco/cactus), Wandsworth Road / Sky Gardens (London), Shibuya Crossing (katsu sando + 7-Eleven), Paris, Iceland, South Pole, Australian Outback, Zhaoxing Dong Village (Guizhou), Marseille (cagoule gang fight).

Encounter scenes show the art only — do **not** reintroduce an on-image speech bubble overlay (“ABEI LOCATED…”).

## Deploy (Vercel) — safe notes only

- Project is a **static Vite SPA**. Build: `npm run build`, output `dist/`.
- `vercel.json` rewrites unknown routes to `index.html` (filesystem assets still win on Vercel).
- Deploy from a logged-in Vercel CLI session in the project root:

  ```bash
  npx vercel --prod
  ```

- Local link metadata lives in **`.vercel/`** (gitignored). Do **not** commit it, tokens, or team/project JSON from the dashboard.
- Production hostname used historically: `abei-tracker.vercel.app`. Do not hardcode org/team IDs, account emails, or CLI tokens in docs or code.
- No env vars are required for the current app (no API keys in the client for the map tiles used today).
- Amplify alternative: connect the repo / upload `dist`, SPA fallback via `public/_redirects`.

### Git author must match the Vercel account

The CLI attaches the author of `HEAD` to every deployment, and Vercel rejects authors that
aren't on the team. A mismatch yields `state: BLOCKED` with `seatBlock.blockCode: TEAM_ACCESS_REQUIRED`
**before** any build is scheduled — so `--prebuilt` does not help.

The CLI renders this badly: it prints `Building…` indefinitely and `vercel inspect` reports
`status UNKNOWN`, which looks like a stuck queue or an outage. Confirm the real state with:

```bash
vercel api "/v6/deployments?projectId=<id>&teamId=<id>&limit=1"
```

and read `state` / `errorMessage`. Keep this repo's committer identity (`git config user.email`,
set locally, not globally) equal to an email registered on the deploying Vercel account.

### What not to commit or paste

- Vercel / GitHub tokens, `.vercel/project.json`, cookies, device OAuth codes
- Private keys, `.env*`, credential dumps
- Internal team slugs or account identifiers in public docs if the repo is ever made public

## Commands

```bash
npm install
npm run dev       # local Vite
npm run build     # tsc -b && vite build
npm run lint      # oxlint
npx vercel --prod # production deploy (CLI must already be authenticated)
```

## Git workflow

**Commit directly to `main`.** Do not open pull requests or feature branches for routine work.

1. Check out `main` and pull latest: `git checkout main && git pull origin main`
2. Make changes, run `npm run lint` and `npm run build`
3. Commit on `main` with a clear message
4. Push: `git push origin main`

Use PRs only if the user explicitly asks for one.

## Agent do / don’t

**Do**

- Commit and push directly to `main` (no PRs unless the user asks).
- Prefer editing `locations.json` + scene PNGs for content.
- Preserve arctic CSS variables and pixel framing.
- Keep map interaction working when the encounter card is open.
- After content or UI changes meant for prod, redeploy with Vercel CLI if the user asks.

**Don’t**

- Open pull requests or long-lived feature branches for routine changes.
- Add a backend “just because.”
- Block the map with full-screen opaque modals that capture all pointer events.
- Commit `node_modules/`, `dist/`, `.vercel/`, or secrets.
- Rewrite the stack (Next, Mapbox paid keys, Google Maps billing, etc.) unless the user requests it. **MapLibre GL + free OSM vector tiles is the approved map stack** for Spidey-smooth zoom.
- Expose personal/org identifiers beyond the public site URL when documenting deploy.

## Image regeneration tip

When regenerating a scene, describe: pixel art 16-bit, Abei (white polar bear, red scarf, mint green shirt), location landmarks, action, chunky pixels, thick outlines, no watermark. Attach `public/assets/abei.png` as reference when the tooling allows.
