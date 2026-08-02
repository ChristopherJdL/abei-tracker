export type SightingStatus = 'CONFIRMED' | 'SCANNING' | 'RUMORED'

export interface Sighting {
  id: string
  title: string
  subtitle: string
  lat: number
  lng: number
  image: string
  status: SightingStatus
  /** ISO 8601 — used for 24h “new paw” reveal on the map */
  createdOn?: string
}
