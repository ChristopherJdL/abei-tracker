import { useEffect, useMemo, useRef } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  ZoomControl,
} from 'react-leaflet'
import L from 'leaflet'
import type { Sighting } from '../types'
import 'leaflet/dist/leaflet.css'

interface AbeiMapProps {
  sightings: Sighting[]
  activeId: string | null
  onSelect: (sighting: Sighting) => void
}

/** Keep pan/zoom handlers alive — overlays must never disable them. */
function EnsureMapControls() {
  const map = useMap()

  useEffect(() => {
    map.dragging.enable()
    map.touchZoom.enable()
    map.doubleClickZoom.enable()
    map.scrollWheelZoom.enable()
    map.boxZoom.enable()
    map.keyboard.enable()
    map.invalidateSize()

    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
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

export function AbeiMap({ sightings, activeId, onSelect }: AbeiMapProps) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'abei-marker',
        html: `<img src="/assets/marker.png" alt="" width="48" height="48" draggable="false" />`,
        iconSize: [48, 48],
        iconAnchor: [24, 40],
      }),
    [],
  )

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
      />
      <ZoomControl position="bottomleft" />
      <EnsureMapControls />
      <FitSightingsOnce sightings={sightings} />
      <FlyToActive sighting={active} />
      {sightings.map((sighting) => (
        <Marker
          key={sighting.id}
          position={[sighting.lat, sighting.lng]}
          icon={icon}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e.originalEvent)
              onSelect(sighting)
            },
          }}
          opacity={activeId && activeId !== sighting.id ? 0.65 : 1}
        />
      ))}
    </MapContainer>
  )
}
