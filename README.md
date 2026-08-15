# Abei Tracker GBA

Pixel-art SPA that tracks **Abei**, a polar bear, around the world. Inspired by [Spidey Tracker](https://spideytracker.net/), but simpler: OpenStreetMap, bear-print markers, and encounter scenes loaded from JSON.

**Live:** [abei-tracker.vercel.app](https://abei-tracker.vercel.app)

## Quick start

```bash
npm install
npm run dev
```

```bash
npm run build    # output → dist/
npm run preview  # local static check
```

## Add a sighting

1. Drop encounter art at `public/scenes/<id>.png`
2. Append an entry to `public/locations.json`:

```json
{
  "id": "cairo",
  "title": "Cairo",
  "subtitle": "Pyramid selfie.",
  "lat": 30.0444,
  "lng": 31.2357,
  "image": "/scenes/cairo.png",
  "status": "CONFIRMED"
}
```

`status` is one of `CONFIRMED` | `SCANNING` | `RUMORED`.

## Deploy

Vite static SPA. Production is on **Vercel** (`vercel.json` SPA rewrite). Redeploy from the project root:

```bash
npx vercel --prod
```

Also works on AWS Amplify (`public/_redirects` for SPA fallback). No IaC in this repo.

## Stack

- React 19 + TypeScript + Vite
- Leaflet / react-leaflet + CARTO dark OSM tiles
- Sightings: `public/locations.json` + `public/scenes/*`

See [AGENTS.md](./AGENTS.md) for architecture, design choices, and agent workflow.
