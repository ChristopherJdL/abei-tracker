import { useEffect, useRef } from 'react'
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type StyleSpecification,
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
 * MapLibre GL + CARTO dark raster (OSM), free, no API key.
 *
 * Why not Leaflet: DOM PNG tiles = choppy pinch + white voids on zoom-out.
 * Why not Google Maps: billing account required — not free with certainty.
 * Why MapLibre raster (not vector): WebGL still does continuous GPU zoom
 * (Spidey-class feel) while reusing the battle-tested CARTO dark_all CDN.
 * `raster-fade-duration: 0` + arctic navy background kill the white flash.
 */
const MAP_STYLE: StyleSpecification = {
  version: 8,
  name: 'abei-arctic-dark',
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxzoom: 18,
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#071f2e' },
    },
    {
      id: 'carto-dark',
      type: 'raster',
      source: 'carto-dark',
      paint: {
        'raster-fade-duration': 0,
        'raster-opacity': 1,
      },
    },
  ],
}

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
  if (pin.classList.contains('is-new-reveal') === revealed) return
  pin.classList.toggle('is-new-reveal', revealed)
  const img = pin.querySelector('img')
  if (img) img.src = revealed ? MARKER_NEW : MARKER_STD
}

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
  const errorRef = useRef<HTMLDivElement>(null)

  selectRef.current = onSelect
  discoveredRef.current = discoveredIds
  sightingsRef.current = sightings

  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return

    const markers = markersRef.current
    const pins = pinElsRef.current

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

    map.addControl(
      new NavigationControl({
        showCompass: false,
        visualizePitch: false,
      }),
      'bottom-left',
    )

    map.on('error', (e) => {
      // Non-fatal tile blips are common; only surface WebGL hard fails.
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
      markers.forEach((m) => m.remove())
      markers.clear()
      pins.clear()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Markers are DOM — never wait on style/tile load (that blocked paws before).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

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
      // Fallback if 'load' is delayed — still frame the paws.
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

  return (
    <>
      <div ref={containerRef} className="abei-map" />
      <div ref={errorRef} className="abei-map-error" hidden />
    </>
  )
}
