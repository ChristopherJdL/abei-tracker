export type SightingStatus = 'CONFIRMED' | 'SCANNING' | 'RUMORED'

export interface Sighting {
  id: string
  title: string
  subtitle: string
  lat: number
  lng: number
  image: string
  status: SightingStatus
  /** ISO 8601 — fresh hunt oval if within last 12h and not yet discovered */
  createdOn?: string
}
