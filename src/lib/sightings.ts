import type { Sighting } from '../types'
import type { Map as MapLibreMap } from 'maplibre-gl'

export const NEW_SIGHTING_MS = 24 * 60 * 60 * 1000
export const REVEAL_MIN_ZOOM = 7

export function isNewSighting(
  sighting: Sighting,
  now = Date.now(),
): boolean {
  if (!sighting.createdOn) return false
  const created = Date.parse(sighting.createdOn)
  if (Number.isNaN(created)) return false
  return now - created < NEW_SIGHTING_MS
}

export function isNearSighting(map: MapLibreMap, sighting: Sighting): boolean {
  if (map.getZoom() < REVEAL_MIN_ZOOM) return false
  // MapLibre uses [lng, lat]
  return map.getBounds().contains([sighting.lng, sighting.lat])
}

export function shouldRevealNewSighting(
  map: MapLibreMap,
  sighting: Sighting,
  discoveredIds: ReadonlySet<string>,
  now = Date.now(),
): boolean {
  if (discoveredIds.has(sighting.id)) return false
  return isNewSighting(sighting, now) && isNearSighting(map, sighting)
}
