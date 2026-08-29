import { useCallback, useEffect, useState } from 'react'
import { IntroScreen } from './components/IntroScreen'
import { AbeiMap } from './components/AbeiMap'
import { EncounterModal } from './components/EncounterModal'
import { NewsTicker } from './components/NewsTicker'
import { PixelButton } from './components/PixelButton'
import { NewAbeiModal } from './components/NewAbeiModal'
import {
  getDiscoveredIds,
  markDiscovered,
  revertDiscovered,
} from './lib/discovered'
import { isBypassActive } from './lib/creations'
import type { Sighting } from './types'
import './App.css'

function App() {
  const [ready, setReady] = useState(false)
  const [sightings, setSightings] = useState<Sighting[]>([])
  const [active, setActive] = useState<Sighting | null>(null)
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const [discoveredIds, setDiscoveredIds] = useState<Set<string>>(() =>
    getDiscoveredIds(),
  )
  const [error, setError] = useState<string | null>(null)

  const day = new Date().getDay()
  const isAllowedDay = day === 0 || day === 1 || day === 3 || day === 6 // Sunday, Monday, Wednesday, Saturday
  const isBypass = isBypassActive()
  const showNewAbeiButton = isAllowedDay || isBypass

  let nextAllowedDay = ''
  if (day === 0) nextAllowedDay = 'Monday'
  else if (day === 1 || day === 2) nextAllowedDay = 'Wednesday'
  else if (day === 3 || day === 4 || day === 5) nextAllowedDay = 'Saturday'
  else nextAllowedDay = 'Sunday'

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const revertId = params.get('revert')?.trim()
    if (revertId) {
      revertDiscovered(revertId)
      setDiscoveredIds(getDiscoveredIds())
      window.history.replaceState({}, '', '/')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    fetch('/locations.json')
      .then((res) => {
        if (!res.ok) throw new Error('Could not load locations.json')
        return res.json()
      })
      .then((data: Sighting[]) => {
        if (!cancelled) setSightings(data)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActive(null)
        setRequestModalOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready])

  const openSighting = useCallback((sighting: Sighting) => {
    markDiscovered(sighting.id)
    setDiscoveredIds((prev) => {
      if (prev.has(sighting.id)) return prev
      const next = new Set(prev)
      next.add(sighting.id)
      return next
    })
    setActive(sighting)
  }, [])

  return (
    <div className="app">
      {!ready && <IntroScreen onEnter={() => setReady(true)} />}

      <header className="chrome-header">
        <div className="brand">
          <img className="pixel" src="/assets/bear-print.png" alt="" />
          <div className="brand-text">
            <strong>ABEI TRACKER GBA</strong>
            <small>Friendly polar bear tracker</small>
          </div>
        </div>

        {showNewAbeiButton ? (
          <PixelButton variant="orange" onClick={() => setRequestModalOpen(true)}>
            ADD NEW ABEI
          </PixelButton>
        ) : (
          <PixelButton variant="gray" disabled>
            {`WAIT FOR NEXT ${nextAllowedDay.toUpperCase()} TO ADD A NEW ABEI`}
          </PixelButton>
        )}
      </header>

      <main className="frame">
        {ready && !error && (
          <AbeiMap
            sightings={sightings}
            activeId={active?.id ?? null}
            discoveredIds={discoveredIds}
            onSelect={openSighting}
          />
        )}
        {error && (
          <div className="hud-panel" style={{ margin: 16 }}>
            <h2>SIGNAL LOST</h2>
            <p>{error}</p>
          </div>
        )}
        <div className="map-tint" />

        <img
          className="corner-abei pixel"
          src="/assets/abei.png"
          alt=""
          aria-hidden
        />
      </main>

      {active && (
        <EncounterModal sighting={active} onClose={() => setActive(null)} />
      )}

      {requestModalOpen && (
        <NewAbeiModal onClose={() => setRequestModalOpen(false)} />
      )}

      <footer className="chrome-footer">
        <NewsTicker />
      </footer>
    </div>
  )
}

export default App
