import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import type { Sighting } from '../types'
import { shouldRevealNewSighting } from '../lib/sightings'
import { patchLeafletMarkerZoomPerf } from '../lib/leafletPerf'
import 'leaflet/dist/leaflet.css'

patchLeafletMarkerZoomPerf()

interface AbeiMapProps {
  sightings: Sighting[]
  activeId: string | null
  discoveredIds: ReadonlySet<string>
  onSelect: (sighting: Sighting) => void
}

const MARKER_STD = '/assets/marker.png'
const MARKER_NEW = '/assets/marker-new.png'

/** Plain image icon — one DOM node, no nested animations. */
const stdIcon = L.icon({
  iconUrl: MARKER_STD,
  iconSize: [48, 48],
  iconAnchor: [24, 42],
  className: 'abei-marker abei-marker--img',
})

const revealIcon = L.divIcon({
  className: 'abei-marker',
  html: `<div class="abei-marker-pin is-new-reveal">
  <span class="abei-marker-radar" aria-hidden="true"></span>
  <span class="abei-marker-radar abei-marker-radar--delay" aria-hidden="true"></span>
  <img src="${MARKER_NEW}" alt="" width="48" height="48" draggable="false" />
</div>`,
  iconSize: [80, 80],
  iconAnchor: [40, 56],
})

/**
 * Keep pan/zoom handlers alive — overlays must never disable them.
 * Also toggles an app-level zoom class so chrome animations / blend
 * overlays can get out of the GPU's way during pinch & wheel zoom.
 */
function EnsureMapControls() {
  const map = useMap()

  useEffect(() => {
    map.attributionControl.setPrefix(
      '<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>',
    )

    map.dragging.enable()
    map.touchZoom.enable()
    map.doubleClickZoom.enable()
    map.scrollWheelZoom.enable()
    map.boxZoom.enable()
    map.keyboard.enable()
    map.invalidateSize()

    const container = map.getContainer()
    const root = document.documentElement

    const beginZoom = () => {
      container.classList.add('is-zooming')
      root.classList.add('abei-map-zooming')
    }
    const endZoom = () => {
      container.classList.remove('is-zooming')
      root.classList.remove('abei-map-zooming')
    }

    // pinch / continuous zoom + animated wheel both emit zoomstart/zoomend
    map.on('zoomstart', beginZoom)
    map.on('zoomend', endZoom)

    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    return () => {
      map.off('zoomstart', beginZoom)
      map.off('zoomend', endZoom)
      root.classList.remove('abei-map-zooming')
      window.removeEventListener('resize', onResize)
    }
  }, [map])

  return null
}

function FitSightingsOnce({ sightings }: { sightings: Sighting[] }) {
  const map = useMap()
  const done = useRef(false)

  useEffect(() => {
    if (done.current || !sightings.length) return
    done.current = true
    const bounds = L.latLngBounds(sightings.map((s) => [s.lat, s.lng]))
    map.fitBounds(bounds.pad(0.4), { animate: true, duration: 0.7 })
  }, [map, sightings])

  return null
}

function FlyToActive({ sighting }: { sighting: Sighting | null }) {
  const map = useMap()
  const lastId = useRef<string | null>(null)

  useEffect(() => {
    if (!sighting) {
      lastId.current = null
      return
    }
    if (lastId.current === sighting.id) return
    lastId.current = sighting.id
    map.flyTo([sighting.lat, sighting.lng], map.getZoom(), {
      duration: 0.75,
    })
  }, [map, sighting])

  return null
}

/**
 * Markers are managed imperatively:
 * - Idle paws use a plain L.icon (single <img>) so pinch zoom stays cheap.
 * - Only "new" revealed paws swap to a DivIcon with radar rings.
 * Never re-create markers on move/zoom — that was a prior stutter source.
 */
function SightingMarkersLayer({
  sightings,
  discoveredIds,
  onSelect,
}: {
  sightings: Sighting[]
  discoveredIds: ReadonlySet<string>
  onSelect: (sighting: Sighting) => void
}) {
  const map = useMap()
  const selectRef = useRef(onSelect)
  const discoveredRef = useRef(discoveredIds)
  const markersRef = useRef(new Map<string, L.Marker>())
  const revealRef = useRef(new Map<string, boolean>())

  selectRef.current = onSelect
  discoveredRef.current = discoveredIds

  useEffect(() => {
    const layer = L.layerGroup().addTo(map)
    const markers = markersRef.current
    const revealState = revealRef.current
    markers.clear()
    revealState.clear()

    for (const sighting of sightings) {
      const marker = L.marker([sighting.lat, sighting.lng], {
        icon: stdIcon,
        keyboard: false,
        // Stable paint order; paired with leafletPerf + CSS z-index:0
        // (Leaflet #6318 — classic Safari/iOS pinch stutter).
        zIndexOffset: 0,
      })
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e.originalEvent)
        selectRef.current(sighting)
      })
      marker.addTo(layer)
      markers.set(sighting.id, marker)
      revealState.set(sighting.id, false)
    }

    return () => {
      layer.remove()
      markers.clear()
      revealState.clear()
    }
  }, [map, sightings])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let zooming = false

    const applyReveal = () => {
      // Never touch the DOM mid-gesture — icon swaps during pinch are jank.
      if (zooming) return

      const now = Date.now()
      for (const sighting of sightings) {
        const marker = markersRef.current.get(sighting.id)
        if (!marker) continue

        const reveal = shouldRevealNewSighting(
          map,
          sighting,
          discoveredRef.current,
          now,
        )
        if (revealRef.current.get(sighting.id) === reveal) continue

        revealRef.current.set(sighting.id, reveal)
        marker.setIcon(reveal ? revealIcon : stdIcon)
      }
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      // Debounce past the zoom/pan gesture settling.
      timer = setTimeout(applyReveal, 200)
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
  }, [map, sightings, discoveredIds])

  return null
}

export function AbeiMap({
  sightings,
  activeId,
  discoveredIds,
  onSelect,
}: AbeiMapProps) {
  const active = sightings.find((s) => s.id === activeId) ?? null

  return (
    <MapContainer
      className="abei-map"
      center={[20, 20]}
      zoom={2}
      minZoom={2}
      maxZoom={18}
      worldCopyJump
      scrollWheelZoom
      dragging
      touchZoom
      doubleClickZoom
      keyboard
      zoomControl={false}
      // Discrete tile fades during zoom fight the GPU; Spidey-smooth needs this off.
      fadeAnimation={false}
      // Prefer fewer wheel micro-steps so each gesture is one clean zoom anim.
      wheelPxPerZoomLevel={90}
      preferCanvas={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={18}
        updateWhenZooming={false}
        updateWhenIdle
        keepBuffer={2}
      />
      <ZoomControl position="bottomleft" />
      <EnsureMapControls />
      <FitSightingsOnce sightings={sightings} />
      <FlyToActive sighting={active} />
      <SightingMarkersLayer
        sightings={sightings}
        discoveredIds={discoveredIds}
        onSelect={onSelect}
      />
    </MapContainer>
  )
}
