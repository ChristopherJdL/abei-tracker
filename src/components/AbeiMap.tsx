import { useEffect, useRef } from 'react'
import OLMap from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import XYZ from 'ol/source/XYZ'
import Overlay from 'ol/Overlay'
import { fromLonLat } from 'ol/proj'
import { defaults as defaultControls } from 'ol/control/defaults'
import { createEmpty, extendCoordinate } from 'ol/extent'
import type { Sighting } from '../types'
import { getHuntState, type HuntState, type MapViewContext } from '../lib/sightings'
import 'ol/ol.css'

interface AbeiMapProps {
  sightings: Sighting[]
  activeId: string | null
  discoveredIds: ReadonlySet<string>
  onSelect: (sighting: Sighting) => void
}

const MARKER_STD = '/assets/marker.png'
const MARKER_NEW = '/assets/marker-new.png'

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
  zone: Overlay
  zoneEl: HTMLDivElement
  paw: Overlay
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
  const mapRef = useRef<OLMap | null>(null)
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

    // Base geometry tile layer (Esri Dark Gray Base)
    const baseLayer = new TileLayer({
      className: 'abei-ol-base-layer',
      source: new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        attributions:
          '&copy; <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a>, HERE, Garmin, FAO, NOAA, USGS, EPA',
        maxZoom: 16,
        transition: 0,
      }),
    })

    // Reference labels layer (Esri Dark Gray Reference — Cities, capitals, boundaries)
    const labelsLayer = new TileLayer({
      className: 'abei-ol-labels-layer',
      opacity: 0.85,
      source: new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 16,
        transition: 0,
      }),
    })

    const view = new View({
      center: fromLonLat([20, 20]),
      zoom: 2,
      minZoom: 1.5,
      maxZoom: 18,
      enableRotation: false,
      constrainResolution: false, // Continuous fractional zoom for smooth trackpad / pinch gestures
    })

    let map: OLMap
    try {
      map = new OLMap({
        target: el,
        layers: [baseLayer, labelsLayer],
        view,
        controls: defaultControls({
          zoom: false,
          rotate: false,
          attribution: true,
        }),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Map failed to start'
      if (errorRef.current) {
        errorRef.current.hidden = false
        errorRef.current.textContent = `MAP SIGNAL LOST — ${msg}`
      }
      return
    }

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

    let zoomTimer: ReturnType<typeof setTimeout> | undefined
    view.on('change:resolution', () => {
      beginZoom()
      if (zoomTimer) clearTimeout(zoomTimer)
      zoomTimer = setTimeout(endZoom, 200)
    })

    const onResize = () => map.updateSize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      root.classList.remove('abei-map-zooming')
      layers.forEach((bundle) => {
        map.removeOverlay(bundle.zone)
        map.removeOverlay(bundle.paw)
      })
      layers.clear()
      map.setTarget(undefined)
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
      map.removeOverlay(bundle.zone)
      map.removeOverlay(bundle.paw)
      layers.delete(id)
    }

    for (const sighting of sightings) {
      if (layers.has(sighting.id)) continue

      const coord = fromLonLat([sighting.lng, sighting.lat])

      const zoneEl = makeZoneElement()
      const zone = new Overlay({
        element: zoneEl,
        position: coord,
        positioning: 'center-center',
        stopEvent: false,
      })
      map.addOverlay(zone)

      const pawEl = makePinElement()
      pawEl.addEventListener('click', (e) => {
        e.stopPropagation()
        selectRef.current(sighting)
      })
      const paw = new Overlay({
        element: pawEl,
        position: coord,
        positioning: 'center-center',
        stopEvent: true,
      })
      map.addOverlay(paw)

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

  // Initial fit of map bounds to show all sightings
  useEffect(() => {
    const map = mapRef.current
    if (!map || !sightings.length || fittedRef.current) return

    const fit = () => {
      if (fittedRef.current || !mapRef.current) return
      fittedRef.current = true
      const extent = createEmpty()
      for (const s of sightings) {
        extendCoordinate(extent, fromLonLat([s.lng, s.lat]))
      }
      map.getView().fit(extent, {
        padding: [56, 56, 56, 56],
        duration: 700,
      })
    }

    requestAnimationFrame(fit)
  }, [sightings])

  // Fly/pan to active sighting
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

    map.getView().animate({
      center: fromLonLat([sighting.lng, sighting.lat]),
      duration: 750,
    })
  }, [activeId, sightings])

  // Sync hunt zones / unlocked paws from localStorage discovery + camera.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let moving = false

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
      if (moving) return
      const view = map.getView()
      const size = map.getSize()
      if (!size) return

      const extent = view.calculateExtent(size)
      const zoom = view.getZoom() ?? 2

      const mapContext: MapViewContext = {
        getZoom: () => zoom,
        containsLngLat: (lng: number, lat: number) => {
          const coord = fromLonLat([lng, lat])
          return (
            coord[0] >= extent[0] &&
            coord[0] <= extent[2] &&
            coord[1] >= extent[1] &&
            coord[1] <= extent[3]
          )
        },
      }

      const now = Date.now()
      for (const sighting of sightingsRef.current) {
        const bundle = layersRef.current.get(sighting.id)
        if (!bundle) continue
        const next = getHuntState(mapContext, sighting, discoveredRef.current, now)
        applyState(bundle, next)
      }
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(syncHunt, 160)
    }

    const onMoveStart = () => {
      moving = true
      if (timer) clearTimeout(timer)
    }
    const onMoveEnd = () => {
      moving = false
      schedule()
    }

    syncHunt()
    map.on('movestart', onMoveStart)
    map.on('moveend', onMoveEnd)

    // Re-check 12h window without needing a map gesture.
    const interval = window.setInterval(syncHunt, 60_000)

    return () => {
      if (timer) clearTimeout(timer)
      window.clearInterval(interval)
      map.un('movestart', onMoveStart)
      map.un('moveend', onMoveEnd)
    }
  }, [])

  return (
    <div className="abei-map-container">
      <div
        ref={containerRef}
        className="abei-map"
        tabIndex={0}
        aria-label="Abei Sightings World Map"
      />
      <div ref={errorRef} className="abei-map-error" hidden />
    </div>
  )
}
