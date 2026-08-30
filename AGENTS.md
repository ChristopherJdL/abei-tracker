# AGENTS.md — Abei Tracker GBA

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
- **Hunt / radar:** Sightings with `createdOn` within the last **12 hours** that are not in `localStorage` (`abei-discovered-ids`) hide the pin and show a large translucent yellow pixel oval + radar. Zoom in near the point (`REVEAL_MIN_ZOOM`) to unlock the paw (quick fade-in + radar). Opening the encounter marks it discovered forever. Older / already-opened sightings show a normal solid paw.
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

1. Generate `public/scenes/<id>.png` using the **Scene image generation** guidelines below.
2. Upload the scene image to S3 with immutable cache:
   ```bash
   aws s3 cp public/scenes/<id>.png s3://abei-tracker-scenes-eu-west-2/scenes/<id>.png --cache-control "public, max-age=31536000, immutable"
   ```
3. Invalidate/refresh CloudFront cache:
   ```bash
   aws cloudfront create-invalidation --distribution-id EB5D4YJXER6OF --paths "/scenes/<id>.png"
   ```
4. Append to `public/locations.json` with the CloudFront CDN URL:

```json
{
  "id": "unique-kebab-id",
  "title": "Short Title",
  "subtitle": "One witty line.",
  "lat": 0,
  "lng": 0,
  "image": "https://d2fvij85scvftm.cloudfront.net/scenes/unique-kebab-id.png",
  "status": "CONFIRMED",
  "createdOn": "2026-08-02T12:00:00.000Z"
}
```

5. Set `createdOn` to the ISO timestamp when the sighting goes live. Within the last **12 hours**, undiscovered paws use the yellow hunt oval until the player zooms in and opens the encounter.
6. Use real-ish lat/lng so the paw sits on the right place (extreme poles are hard to click — prefer slightly inland Antarctica coords if needed).
7. Match `subtitle` to what is actually in the scene (brands, action, landmarks). Keep it short and witty.
8. No code change required unless you add fields (then update `src/types.ts` + UI).
9. Push to `main` — Vercel auto-deploys. Do not run the Vercel CLI.

### Current sightings (at time of writing)

Arctic, Sahara, Desert Sunset (taco/cactus), Wandsworth Road / Sky Gardens (London), Shibuya Crossing (katsu sando + 7-Eleven), Paris, Iceland, South Pole, Australian Outback, Zhaoxing Dong Village (Guizhou), Marseille (cagoule gang fight), Plan-de-Cuques, Qatar oil slick, Gapyeong botanic garden, Vauxhall bus station, Fukushima / Nagasaki wastelands, Nine Elms Sainsbury's, Socotra dragon tree, Darvaza Door to Hell.

## Deploy (Vercel) — safe notes only

- Project is a **static Vite SPA**. Build: `npm run build`, output `dist/`.
- `vercel.json` rewrites unknown routes to `index.html` (filesystem assets still win on Vercel).
- **Production deploys automatically from `main`.** Agents must **not** run `npx vercel --prod` (or any Vercel CLI deploy) unless the user explicitly asks to deploy manually.
- Pushing to `main` is enough for prod. Wait for the GitHub → Vercel integration; do not double-deploy from the CLI.
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
# do NOT deploy via CLI — Vercel auto-deploys from main
```

## Git workflow

**Commit directly to `main`.** Do not open pull requests or feature branches for routine work.

1. Check out `main` and pull latest: `git checkout main && git pull origin main`
2. Make changes, run `npm run lint` and `npm run build`
3. Commit on `main` with a clear message
4. Push: `git push origin main` — Vercel deploys from that push

Use PRs only if the user explicitly asks for one.

## Agent do / don’t

**Do**

- Commit and push directly to `main` (no PRs unless the user asks).
- Prefer editing `locations.json` + scene PNGs for content.
- Preserve arctic CSS variables and pixel framing.
- Keep map interaction working when the encounter card is open.
- Let Vercel auto-deploy from `main` after push.
- When generating or modifying an Abei sighting image directly as an agent: upload the scene to S3 (`s3://abei-tracker-scenes-eu-west-2/scenes/<id>.png`), put the CloudFront CDN URL (`https://d2fvij85scvftm.cloudfront.net/scenes/<id>.png`) in `locations.json`, and automatically order CloudFront to refresh/invalidate the cache (`aws cloudfront create-invalidation --distribution-id EB5D4YJXER6OF --paths "/scenes/<id>.png"`).

**Don’t**

- Run `npx vercel --prod` / Vercel CLI deploys unless the user explicitly asks.
- Open pull requests or long-lived feature branches for routine changes.
- Add a backend “just because.”
- Block the map with full-screen opaque modals that capture all pointer events.
- Commit `node_modules/`, `dist/`, `.vercel/`, or secrets.
- Rewrite the stack (Next, Mapbox paid keys, Google Maps billing, etc.) unless the user requests it. **MapLibre GL + free OSM vector tiles is the approved map stack** for Spidey-smooth zoom.
- Expose personal/org identifiers beyond the public site URL when documenting deploy.

## Scene image generation (new Abei)

Use Cursor **GenerateImage** (or equivalent). Always attach `public/assets/abei.png` as a reference. Prefer ~**4:3** PNGs under `public/scenes/<id>.png`.

### Prompt skeleton

```
Pixel art 16-bit scene, 4:3. Abei the white polar bear (red scarf, mint green shirt)
[ACTION] at [PLACE / LANDMARKS]. [ATMOSPHERE / TIME OF DAY].
Chunky pixels, thick black outlines, no watermark, no UI chrome.
Match Abei style from reference, but expressions and speech bubbles are allowed.
```

### Character — Abei (hard rules)

- **Look:** white polar bear, **red scarf**, **mint / teal shirt**. Keep proportions close to `public/assets/abei.png`.
- **Outfit:** can change when the story needs it (e.g. hazmat suit) — still keep the recognisable Abei silhouette.

### Scene composition

- One clear joke / action. Abei should be readable at encounter-card size.
- Prefer real landmarks or place-specific props so the location is obvious without a label.
- For product / brand gags: use **real packaging** (colours, logos, product name). If the user names a brand (Elle & Vire, Elmlea, etc.), match that packaging — do not substitute a generic tub.
- Use the wording the user asks for (e.g. **double cream**, not crème fraîche) on labels and in the subtitle.
- **Insolite** sightings: pick a genuinely weird place *and* a weirder action (e.g. marshmallows over Darvaza, climbing a Socotra dragon-blood tree). Keep it cute/absurd, not gore.

### Avoid look-alike twins

When two scenes share a theme (two wastelands, two London stops, etc.):

- Change **palette**, **time of day**, **landmarks**, and **Abei facing / pose**.
- Do **not** reuse the same warning signs, plant buildings, or prop layout.
- Example: Fukushima = murky green plant haze + crouching; Nagasaki = coastal sunset + standing + different props + Petit Gris.

### After generate

1. Visually check face (neutral eyes + pout), packaging text, and distinctness vs nearby scenes.
2. Save image to `public/scenes/<id>.png`.
3. **Upload to S3 CDN bucket**:
   ```bash
   aws s3 cp public/scenes/<id>.png s3://abei-tracker-scenes-eu-west-2/scenes/<id>.png --cache-control "public, max-age=31536000, immutable"
   ```
4. **Invalidate CloudFront cache**:
   ```bash
   aws cloudfront create-invalidation --distribution-id EB5D4YJXER6OF --paths "/scenes/<id>.png"
   ```
5. Put the full CloudFront URL in `public/locations.json` (`"image": "https://d2fvij85scvftm.cloudfront.net/scenes/<id>.png"`) and keep the witty `subtitle` in sync.
6. Lint/build (`npm run lint && npm run build`), commit and push to `main` (Vercel auto-deploys).

### Regeneration tip

When regenerating an existing scene, attach both `public/assets/abei.png` **and** the previous scene PNG as references, then spell out the **exact** delta (“same composition, only swap Sainsbury’s tub for Elmlea Double packaging” / “keep pout, make eyes blank dots”).
