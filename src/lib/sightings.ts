import type { Sighting } from '../types'
import type { Map as LeafletMap } from 'leaflet'

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

export function isNearSighting(map: LeafletMap, sighting: Sighting): boolean {
  if (map.getZoom() < REVEAL_MIN_ZOOM) return false
  return map.getBounds().contains([sighting.lat, sighting.lng])
}

export function shouldRevealNewSighting(
  map: LeafletMap,
  sighting: Sighting,
  discoveredIds: ReadonlySet<string>,
  now = Date.now(),
): boolean {
  if (discoveredIds.has(sighting.id)) return false
  return isNewSighting(sighting, now) && isNearSighting(map, sighting)
}
