import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import type { Sighting } from '../types'
import { shouldRevealNewSighting } from '../lib/sightings'
import 'leaflet/dist/leaflet.css'

interface AbeiMapProps {
  sightings: Sighting[]
  activeId: string | null
  discoveredIds: ReadonlySet<string>
  onSelect: (sighting: Sighting) => void
}

const MARKER_STD = '/assets/marker.png'
const MARKER_NEW = '/assets/marker-new.png'

const markerHtml = `<div class="abei-marker-pin">
  <span class="abei-marker-radar" aria-hidden="true"></span>
  <span class="abei-marker-radar abei-marker-radar--delay" aria-hidden="true"></span>
  <img src="${MARKER_STD}" alt="" width="48" height="48" draggable="false" />
</div>`

const sharedIcon = L.divIcon({
  className: 'abei-marker',
  html: markerHtml,
  iconSize: [80, 80],
  iconAnchor: [40, 56],
})

/** Keep pan/zoom handlers alive — overlays must never disable them. */
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
    const onZoomStart = () => container.classList.add('is-zooming')
    const onZoomEnd = () => container.classList.remove('is-zooming')
    map.on('zoomstart', onZoomStart)
    map.on('zoomend', onZoomEnd)

    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    return () => {
      map.off('zoomstart', onZoomStart)
      map.off('zoomend', onZoomEnd)
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
    map.flyTo([sighting.lat, sighting.lng], Math.max(map.getZoom(), 15), {
      duration: 0.75,
    })
  }, [map, sighting])

  return null
}

/**
 * Markers are managed imperatively: React renders them once, then reveal state
 * is applied by toggling classes on existing DOM nodes. Re-rendering markers on
 * map events made zooming stutter.
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

  selectRef.current = onSelect
  discoveredRef.current = discoveredIds

  useEffect(() => {
    const layer = L.layerGroup().addTo(map)
    const markers = markersRef.current
    markers.clear()

    for (const sighting of sightings) {
      const marker = L.marker([sighting.lat, sighting.lng], {
        icon: sharedIcon,
        keyboard: false,
      })
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e.originalEvent)
        selectRef.current(sighting)
      })
      marker.addTo(layer)
      markers.set(sighting.id, marker)
    }

    return () => {
      layer.remove()
      markers.clear()
    }
  }, [map, sightings])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const applyReveal = () => {
      const now = Date.now()
      for (const sighting of sightings) {
        const el = markersRef.current.get(sighting.id)?.getElement()
        if (!el) continue

        const pin = el.firstElementChild as HTMLElement | null
        if (!pin) continue

        const reveal = shouldRevealNewSighting(
          map,
          sighting,
          discoveredRef.current,
          now,
        )
        if (pin.classList.contains('is-new-reveal') === reveal) continue

        pin.classList.toggle('is-new-reveal', reveal)
        const img = pin.querySelector('img')
        if (img) img.src = reveal ? MARKER_NEW : MARKER_STD
      }
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(applyReveal, 150)
    }

    applyReveal()
    map.on('zoomend moveend', schedule)
    const interval = window.setInterval(applyReveal, 60_000)

    return () => {
      if (timer) clearTimeout(timer)
      window.clearInterval(interval)
      map.off('zoomend moveend', schedule)
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
      preferCanvas={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={18}
        updateWhenZooming={false}
        keepBuffer={3}
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
