import { useEffect, useRef } from 'react'
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  type StyleSpecification,
} from 'maplibre-gl'
import type { Sighting } from '../types'
import { getHuntState, type HuntState } from '../lib/sightings'
import 'maplibre-gl/dist/maplibre-gl.css'

interface AbeiMapProps {
  sightings: Sighting[]
  activeId: string | null
  discoveredIds: ReadonlySet<string>
  onSelect: (sighting: Sighting) => void
}

const MARKER_STD = '/assets/marker.png'
const MARKER_NEW = '/assets/marker-new.png'

/**
 * MapLibre GL + CARTO dark raster (OSM), free, no API key.
 * WebGL continuous zoom; fadeDuration 0 kills white voids on zoom-out.
 */
const MAP_STYLE: StyleSpecification = {
  version: 8,
  name: 'abei-arctic-dark',
  sources: {
    'esri-dark-gray': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, FAO, NOAA, USGS, EPA',
      maxzoom: 16,
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#071f2e' },
    },
    {
      id: 'esri-dark-gray',
      type: 'raster',
      source: 'esri-dark-gray',
      paint: {
        'raster-fade-duration': 0,
        'raster-opacity': 1,
      },
    },
  ],
}

function makeZoneElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'abei-hunt-zone'
  el.setAttribute('aria-hidden', 'true')
  el.innerHTML = `
    <div class="abei-hunt-zone__core">
      <span class="abei-hunt-zone__oval"></span>
      <span class="abei-marker-radar abei-hunt-zone__radar"></span>
      <span class="abei-marker-radar abei-marker-radar--delay abei-hunt-zone__radar"></span>
    </div>
  `
  return el
}

function makePinElement(): HTMLDivElement {
  const pin = document.createElement('div')
  pin.className = 'abei-marker-pin'
  pin.innerHTML = `
    <div class="abei-marker-badge">
      <span class="abei-marker-radar" aria-hidden="true"></span>
      <span class="abei-marker-radar abei-marker-radar--delay" aria-hidden="true"></span>
      <img src="${MARKER_STD}" alt="" width="48" height="48" draggable="false" />
    </div>
  `
  return pin
}

type LayerBundle = {
  zone: Marker
  zoneEl: HTMLDivElement
  paw: Marker
  pawEl: HTMLDivElement
  state: HuntState | null
}

export function AbeiMap({
  sightings,
  activeId,
  discoveredIds,
  onSelect,
}: AbeiMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const layersRef = useRef(new Map<string, LayerBundle>())
  const fittedRef = useRef(false)
  const lastFlyId = useRef<string | null>(null)
  const selectRef = useRef(onSelect)
  const discoveredRef = useRef(discoveredIds)
  const sightingsRef = useRef(sightings)
  const errorRef = useRef<HTMLDivElement>(null)

  selectRef.current = onSelect
  discoveredRef.current = discoveredIds
  sightingsRef.current = sightings

  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return

    const layers = layersRef.current

    let map: MapLibreMap
    try {
      map = new MapLibreMap({
        container: el,
        style: MAP_STYLE,
        center: [20, 20],
        zoom: 2,
        minZoom: 1.5,
        maxZoom: 18,
        renderWorldCopies: true,
        attributionControl: { compact: true },
        fadeDuration: 0,
        pitchWithRotate: false,
        dragRotate: false,
        touchPitch: false,
        scrollZoom: true,
      })
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'WebGL map failed to start'
      if (errorRef.current) {
        errorRef.current.hidden = false
        errorRef.current.textContent = `MAP SIGNAL LOST — ${msg}`
      }
      return
    }

    map.on('error', (e) => {
      const message = e.error?.message ?? ''
      if (/webgl/i.test(message) && errorRef.current) {
        errorRef.current.hidden = false
        errorRef.current.textContent = `MAP SIGNAL LOST — ${message}`
      }
    })

    map.on('load', () => {
      map.resize()
      map.getCanvas().style.background = '#071f2e'
    })
    window.setTimeout(() => map.resize(), 120)

    mapRef.current = map

    const root = document.documentElement
    const beginZoom = () => {
      el.classList.add('is-zooming')
      root.classList.add('abei-map-zooming')
    }
    const endZoom = () => {
      el.classList.remove('is-zooming')
      root.classList.remove('abei-map-zooming')
    }

    map.on('zoomstart', beginZoom)
    map.on('zoomend', endZoom)

    const onResize = () => map.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      root.classList.remove('abei-map-zooming')
      layers.forEach((bundle) => {
        bundle.zone.remove()
        bundle.paw.remove()
      })
      layers.clear()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Create zone + paw markers per sighting (visibility driven by hunt state).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const layers = layersRef.current
    const keep = new Set(sightings.map((s) => s.id))

    for (const [id, bundle] of layers) {
      if (keep.has(id)) continue
      bundle.zone.remove()
      bundle.paw.remove()
      layers.delete(id)
    }

    for (const sighting of sightings) {
      if (layers.has(sighting.id)) continue

      const zoneEl = makeZoneElement()
      const zone = new Marker({
        element: zoneEl,
        anchor: 'center',
        pitchAlignment: 'viewport',
        rotationAlignment: 'viewport',
      })
        .setLngLat([sighting.lng, sighting.lat])
        .addTo(map)

      const pawEl = makePinElement()
      pawEl.addEventListener('click', (e) => {
        e.stopPropagation()
        selectRef.current(sighting)
      })
      const paw = new Marker({
        element: pawEl,
        anchor: 'center',
        pitchAlignment: 'viewport',
        rotationAlignment: 'viewport',
      })
        .setLngLat([sighting.lng, sighting.lat])
        .addTo(map)

      // Start hidden; syncHunt applies the right state.
      zoneEl.style.display = 'none'
      pawEl.style.display = 'none'

      layers.set(sighting.id, {
        zone,
        zoneEl,
        paw,
        pawEl,
        state: null,
      })
    }
  }, [sightings])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !sightings.length || fittedRef.current) return

    const fit = () => {
      if (fittedRef.current) return
      fittedRef.current = true
      const bounds = new LngLatBounds()
      for (const s of sightings) bounds.extend([s.lng, s.lat])
      map.fitBounds(bounds, {
        padding: 56,
        duration: 700,
        essential: true,
      })
    }

    if (map.loaded() || map.isStyleLoaded()) {
      requestAnimationFrame(fit)
    } else {
      map.once('load', () => requestAnimationFrame(fit))
      window.setTimeout(fit, 800)
    }
  }, [sightings])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!activeId) {
      lastFlyId.current = null
      return
    }
    if (lastFlyId.current === activeId) return
    const sighting = sightings.find((s) => s.id === activeId)
    if (!sighting) return
    lastFlyId.current = activeId

    map.easeTo({
      center: [sighting.lng, sighting.lat],
      zoom: map.getZoom(),
      duration: 750,
      essential: true,
    })
  }, [activeId, sightings])

  // Sync hunt zones / unlocked paws from localStorage discovery + camera.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let zooming = false

    const applyState = (bundle: LayerBundle, next: HuntState) => {
      const prev = bundle.state
      if (prev === next) return
      bundle.state = next

      const { zoneEl, pawEl } = bundle
      const img = pawEl.querySelector('img')

      if (next === 'zone') {
        zoneEl.style.display = ''
        pawEl.style.display = 'none'
        pawEl.classList.remove('is-unlocking', 'is-radar')
        return
      }

      zoneEl.style.display = 'none'
      pawEl.style.display = ''

      if (next === 'unlocked') {
        // Yellow ring + light yellow fill for fresh undiscovered paws.
        if (img) img.src = MARKER_NEW
        pawEl.classList.remove('is-radar')
        pawEl.classList.add('is-unlocking')
        window.setTimeout(() => {
          pawEl.classList.remove('is-unlocking')
          pawEl.classList.add('is-radar')
        }, 420)
        return
      }

      // Discovered: light blue badge, no radar.
      if (img) img.src = MARKER_STD
      pawEl.classList.remove('is-unlocking', 'is-radar')
    }

    const syncHunt = () => {
      if (zooming) return
      const now = Date.now()
      for (const sighting of sightingsRef.current) {
        const bundle = layersRef.current.get(sighting.id)
        if (!bundle) continue
        const next = getHuntState(map, sighting, discoveredRef.current, now)
        applyState(bundle, next)
      }
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(syncHunt, 160)
    }

    const onZoomStart = () => {
      zooming = true
      if (timer) clearTimeout(timer)
    }
    const onZoomEnd = () => {
      zooming = false
      schedule()
    }

    syncHunt()
    map.on('zoomstart', onZoomStart)
    map.on('zoomend', onZoomEnd)
    map.on('moveend', schedule)
    // Re-check 12h window without needing a map gesture.
    const interval = window.setInterval(syncHunt, 60_000)

    return () => {
      if (timer) clearTimeout(timer)
      window.clearInterval(interval)
      map.off('zoomstart', onZoomStart)
      map.off('zoomend', onZoomEnd)
      map.off('moveend', schedule)
    }
  }, [discoveredIds, sightings])

  return (
    <>
      <div ref={containerRef} className="abei-map" />
      <div ref={errorRef} className="abei-map-error" hidden />
    </>
  )
}
