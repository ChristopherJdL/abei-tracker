import type { Sighting } from '../types'
import type { Map as MapLibreMap } from 'maplibre-gl'

/** Must zoom in this far before a fresh hunt paw unlocks. */
export const REVEAL_MIN_ZOOM = 8

/** Yellow hunt oval only for sightings created within this window. */
export const HUNT_WINDOW_MS = 12 * 60 * 60 * 1000

export type HuntState = 'discovered' | 'zone' | 'unlocked'

export function isFreshHuntSighting(
  sighting: Sighting,
  now = Date.now(),
): boolean {
  if (!sighting.createdOn) return false
  const created = Date.parse(sighting.createdOn)
  if (Number.isNaN(created)) return false
  return now - created < HUNT_WINDOW_MS
}

/**
 * Hunt overlay rules:
 * - Outside the 12h createdOn window → normal solid paw (same as discovered)
 * - Inside 12h + not in localStorage → zone (far) or unlocked paw (near + zoom)
 * - Clicked (localStorage) → solid paw forever
 */
export function getHuntState(
  map: MapLibreMap,
  sighting: Sighting,
  discoveredIds: ReadonlySet<string>,
  now = Date.now(),
): HuntState {
  if (discoveredIds.has(sighting.id) || !isFreshHuntSighting(sighting, now)) {
    return 'discovered'
  }
  if (map.getZoom() < REVEAL_MIN_ZOOM) return 'zone'
  if (!map.getBounds().contains([sighting.lng, sighting.lat])) return 'zone'
  return 'unlocked'
}
