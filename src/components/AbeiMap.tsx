import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
  ZoomControl,
} from 'react-leaflet'
import L from 'leaflet'
import type { Sighting } from '../types'
import { shouldRevealNewSighting } from '../lib/sightings'
import 'leaflet/dist/leaflet.css'

interface AbeiMapProps {
  sightings: Sighting[]
  activeId: string | null
  onSelect: (sighting: Sighting) => void
}

function makeMarkerIcon(revealed: boolean, isActive: boolean) {
  const pinClass = [
    'abei-marker-pin',
    revealed ? 'is-new-reveal' : '',
    isActive ? 'is-active' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const radar = revealed
    ? `<span class="abei-marker-radar" aria-hidden="true"></span>
       <span class="abei-marker-radar abei-marker-radar--delay" aria-hidden="true"></span>`
    : ''

  return L.divIcon({
    className: 'abei-marker',
    html: `<div class="${pinClass}">${radar}<img src="/assets/marker.png" alt="" width="48" height="48" draggable="false" /></div>`,
    iconSize: revealed ? [80, 80] : [48, 48],
    iconAnchor: revealed ? [40, 56] : [24, 40],
  })
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

function SightingMarkers({
  sightings,
  activeId,
  onSelect,
}: {
  sightings: Sighting[]
  activeId: string | null
  onSelect: (sighting: Sighting) => void
}) {
  const map = useMap()
  const [mapTick, setMapTick] = useState(0)

  const refresh = useCallback(() => setMapTick((t) => t + 1), [])

  useMapEvents({
    moveend: refresh,
    zoomend: refresh,
  })

  useEffect(() => {
    const id = window.setInterval(refresh, 60_000)
    return () => window.clearInterval(id)
  }, [refresh])

  const revealedIds = new Set<string>()
  const now = Date.now()
  for (const sighting of sightings) {
    if (shouldRevealNewSighting(map, sighting, now)) revealedIds.add(sighting.id)
  }
  void mapTick

  return (
    <>
      {sightings.map((sighting) => {
        const revealed = revealedIds.has(sighting.id)
        const isActive = activeId === sighting.id
        return (
          <Marker
            key={sighting.id}
            position={[sighting.lat, sighting.lng]}
            icon={makeMarkerIcon(revealed, isActive)}
            zIndexOffset={revealed ? 1000 : isActive ? 500 : 0}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e.originalEvent)
                onSelect(sighting)
              },
            }}
            opacity={activeId && activeId !== sighting.id ? 0.65 : 1}
          />
        )
      })}
    </>
  )
}

export function AbeiMap({ sightings, activeId, onSelect }: AbeiMapProps) {
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
      attributionControl={false}
      preferCanvas={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={18}
      />
      <ZoomControl position="bottomleft" />
      <EnsureMapControls />
      <FitSightingsOnce sightings={sightings} />
      <FlyToActive sighting={active} />
      <SightingMarkers
        sightings={sightings}
        activeId={activeId}
        onSelect={onSelect}
      />
    </MapContainer>
  )
}
