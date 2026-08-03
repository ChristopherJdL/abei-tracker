const STORAGE_KEY = 'abei-discovered-ids'

export function getDiscoveredIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id) => typeof id === 'string')
        : [],
    )
  } catch {
    return new Set()
  }
}

export function markDiscovered(id: string): void {
  const ids = getDiscoveredIds()
  if (ids.has(id)) return
  ids.add(id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
}

/** Remove one sighting from discovery (e.g. ?revert=gapyeong-botanic). */
export function revertDiscovered(id: string): boolean {
  const ids = getDiscoveredIds()
  if (!ids.has(id)) return false
  ids.delete(id)
  if (ids.size === 0) localStorage.removeItem(STORAGE_KEY)
  else localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  return true
}
