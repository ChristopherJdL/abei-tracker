# AGENTS.md — Abei Finder GBA

Context for coding agents working on this repo. Keep changes small, match the existing pixel/arctic aesthetic, and never commit secrets or Vercel/GitHub credentials.

## What this is

A **client-only SPA** that mimics a retro “tracker console” (Spidey Tracker–inspired). Users open an intro screen, then pan a world map. **Bear-print markers** (and a sightings list) open a **pixel “ENCOUNTER CART”** modal showing a scene image for that location.

There is no backend, database, or auth. Content is static files under `public/`.

## Stack & layout

| Piece | Choice |
| --- | --- |
| App | React 19 + TypeScript |
| Build | Vite → `dist/` |
| Map | Leaflet + `react-leaflet`, CARTO `dark_all` OSM tiles |
| Sightings data | `public/locations.json` |
| Scene art | `public/scenes/<id>.png` |
| Character / markers | `public/assets/abei.png`, `bear-print.png`, `marker.png` |
| Deploy | Vercel (SPA); Amplify-friendly `_redirects` also present |

### Source map

```
src/
  App.tsx                 # shell: intro gate, chrome, HUD list, modal host
  App.css                 # arctic UI, frame, encounter cart, mobile
  index.css               # CSS vars, Leaflet tweaks, pixel font
  types.ts                # Sighting / SightingStatus
  components/
    IntroScreen.tsx       # first-run gate (“OPEN TRACKER” / skip)
    AbeiMap.tsx           # MapContainer, markers, fit/fly, drag enable
    EncounterModal.tsx    # portal pixel window + scene image
public/
  locations.json          # all paws — edit this to add locations
  scenes/                 # encounter PNGs referenced by JSON
  assets/                 # abei sprite (transparent), paw, map marker
  _redirects              # Amplify SPA fallback
vercel.json               # SPA rewrite → index.html
```

## Design choices (do not casually undo)

### Aesthetic

- **Arctic palette** (CSS vars in `src/index.css`): ice cyan, frost white, glacier, seal brown, seal freckle dark, arctic navy. Avoid purple/glow AI-default looks.
- **Pixel UI**: Press Start 2P, chunky borders, scanlines on encounter art, GBA-ish “ENCOUNTER CART” chrome.
- **Reference vibe**: Spidey Tracker (map + pixel HUD + character), but simpler — no sound pipeline, no activity log product surface.

### Map UX (important)

- Map **must stay draggable/zoomable**, including when a sighting is “LOCKED”.
- Encounter UI is portaled to `document.body` with **`pointer-events: none`** on the overlay layer; only the cart has `pointer-events: auto` so pan works around it.
- Decorative overlays (grid, tint, aurora) use `pointer-events: none`.
- `AbeiMap` explicitly re-enables Leaflet drag/touch/scroll handlers and only `fitBounds` once; `flyTo` runs once per selected id (does not fight the user afterward).
- Zoom controls: bottom-left.

### Encounter modal

- Pixel bezel + title bar (“ENCOUNTER CART”) + large scene frame with speech bubble.
- Close via X, BACK TO MAP, or Escape.
- Scene images should be shown with `image-rendering: pixelated` where it helps.

### Assets

- Original Abei sprite had a **hot-pink / magenta chroma** background; production asset is `public/assets/abei.png` with that keyed out (Pillow flood-fill + despill). Do not reintroduce opaque pink fringes.
- Map markers use seal-toned paw on a cyan/white badge (`marker.png`).
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
  "status": "CONFIRMED"
}
```

3. Use real-ish lat/lng so the paw sits on the right place (extreme poles are hard to click — prefer slightly inland Antarctica coords if needed).
4. No code change required unless you add fields (then update `src/types.ts` + UI).
5. Redeploy if production should update (see below).

### Current sightings (at time of writing)

Arctic, Sahara, Desert Sunset (taco/cactus), Wandsworth Road / Sky Gardens (London), Shibuya Crossing (katsu sando + 7-Eleven), Paris, Iceland, South Pole, Australian Outback.

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

## Agent do / don’t

**Do**

- Prefer editing `locations.json` + scene PNGs for content.
- Preserve arctic CSS variables and pixel framing.
- Keep map interaction working when the encounter cart is open.
- After content or UI changes meant for prod, redeploy with Vercel CLI if the user asks.

**Don’t**

- Add a backend “just because.”
- Block the map with full-screen opaque modals that capture all pointer events.
- Commit `node_modules/`, `dist/`, `.vercel/`, or secrets.
- Rewrite the stack (Next, Mapbox paid keys, etc.) unless the user requests it.
- Expose personal/org identifiers beyond the public site URL when documenting deploy.

## Image regeneration tip

When regenerating a scene, describe: pixel art 16-bit, Abei (white polar bear, red scarf, mint green shirt), location landmarks, action, chunky pixels, thick outlines, no watermark. Attach `public/assets/abei.png` as reference when the tooling allows.
