import { useEffect, useRef } from 'react'
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
} from 'maplibre-gl'
import type { Sighting } from '../types'
import { shouldRevealNewSighting } from '../lib/sightings'
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
 * Free OSM vector style (no API key, no billing).
 * WebGL continuous zoom — same class of renderer Spidey uses via Google Maps.
 * CARTO Dark Matter matches our prior dark_all arctic look.
 */
const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

function makePinElement(revealed: boolean): HTMLDivElement {
  const pin = document.createElement('div')
  pin.className = revealed
    ? 'abei-marker-pin is-new-reveal'
    : 'abei-marker-pin'
  pin.innerHTML = `
    <span class="abei-marker-radar" aria-hidden="true"></span>
    <span class="abei-marker-radar abei-marker-radar--delay" aria-hidden="true"></span>
    <img src="${revealed ? MARKER_NEW : MARKER_STD}" alt="" width="48" height="48" draggable="false" />
  `
  return pin
}

function setPinReveal(pin: HTMLElement, revealed: boolean) {
  const next = revealed
  if (pin.classList.contains('is-new-reveal') === next) return
  pin.classList.toggle('is-new-reveal', next)
  const img = pin.querySelector('img')
  if (img) img.src = next ? MARKER_NEW : MARKER_STD
}

/**
 * MapLibre GL (WebGL) tracker map.
 * Spidey Tracker smoothness comes from GPU vector rendering — Leaflet raster
 * tiles cannot match it. This swaps the renderer while keeping OSM data free.
 */
export function AbeiMap({
  sightings,
  activeId,
  discoveredIds,
  onSelect,
}: AbeiMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef(new Map<string, Marker>())
  const pinElsRef = useRef(new Map<string, HTMLDivElement>())
  const fittedRef = useRef(false)
  const lastFlyId = useRef<string | null>(null)
  const selectRef = useRef(onSelect)
  const discoveredRef = useRef(discoveredIds)
  const sightingsRef = useRef(sightings)

  selectRef.current = onSelect
  discoveredRef.current = discoveredIds
  sightingsRef.current = sightings

  // Create map once
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return

    const markers = markersRef.current
    const pins = pinElsRef.current

    const map = new MapLibreMap({
      container: el,
      style: MAP_STYLE,
      center: [20, 20],
      zoom: 2,
      minZoom: 1.5,
      maxZoom: 18,
      renderWorldCopies: true,
      attributionControl: { compact: true },
      // Instant tile crossfade — white gaps were Leaflet's discrete PNG swap.
      fadeDuration: 0,
      pitchWithRotate: false,
      dragRotate: false,
      touchPitch: false,
      // Continuous trackpad/wheel zoom (WebGL), not Leaflet-style stepped jumps.
      scrollZoom: true,
    })

    map.addControl(
      new NavigationControl({
        showCompass: false,
        visualizePitch: false,
      }),
      'bottom-left',
    )

    const paintArcticBackground = () => {
      try {
        if (map.getLayer('background')) {
          map.setPaintProperty('background', 'background-color', '#0a2433')
        }
      } catch {
        /* style variants may rename the layer */
      }
      map.getCanvas().style.background = '#0a2433'
      map.resize()
    }

    map.on('load', paintArcticBackground)
    // Layout can settle after chrome/fonts; re-measure once.
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
    map.on('movestart', () => {
      if (map.isZooming()) beginZoom()
    })

    const onResize = () => map.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      root.classList.remove('abei-map-zooming')
      markers.forEach((m) => m.remove())
      markers.clear()
      pins.clear()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Sync markers when sightings change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const ensureMarkers = () => {
      const existing = markersRef.current
      const pins = pinElsRef.current
      const keep = new Set(sightings.map((s) => s.id))

      for (const [id, marker] of existing) {
        if (keep.has(id)) continue
        marker.remove()
        existing.delete(id)
        pins.delete(id)
      }

      for (const sighting of sightings) {
        if (existing.has(sighting.id)) continue

        const pin = makePinElement(false)
        pin.addEventListener('click', (e) => {
          e.stopPropagation()
          selectRef.current(sighting)
        })

        const marker = new Marker({
          element: pin,
          anchor: 'bottom',
          offset: [0, 4],
          pitchAlignment: 'viewport',
          rotationAlignment: 'viewport',
        })
          .setLngLat([sighting.lng, sighting.lat])
          .addTo(map)

        existing.set(sighting.id, marker)
        pins.set(sighting.id, pin)
      }
    }

    if (map.isStyleLoaded()) {
      ensureMarkers()
    } else {
      map.once('load', ensureMarkers)
    }
  }, [sightings])

  // Fit all paws once after style + markers are ready
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

    if (map.isStyleLoaded()) {
      requestAnimationFrame(fit)
    } else {
      map.once('load', () => requestAnimationFrame(fit))
    }
  }, [sightings])

  // Pan to active sighting without changing zoom
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

  // Reveal yellow radar when near + new (debounced; never mid-zoom)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let zooming = false

    const applyReveal = () => {
      if (zooming) return
      const now = Date.now()
      for (const sighting of sightingsRef.current) {
        const pin = pinElsRef.current.get(sighting.id)
        if (!pin) continue
        const reveal = shouldRevealNewSighting(
          map,
          sighting,
          discoveredRef.current,
          now,
        )
        setPinReveal(pin, reveal)
      }
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(applyReveal, 180)
    }

    const onZoomStart = () => {
      zooming = true
      if (timer) clearTimeout(timer)
    }
    const onZoomEnd = () => {
      zooming = false
      schedule()
    }

    applyReveal()
    map.on('zoomstart', onZoomStart)
    map.on('zoomend', onZoomEnd)
    map.on('moveend', schedule)
    const interval = window.setInterval(applyReveal, 60_000)

    return () => {
      if (timer) clearTimeout(timer)
      window.clearInterval(interval)
      map.off('zoomstart', onZoomStart)
      map.off('zoomend', onZoomEnd)
      map.off('moveend', schedule)
    }
  }, [discoveredIds, sightings])

  return <div ref={containerRef} className="abei-map" />
}
