import { useEffect, useState } from 'react'
import { IntroScreen } from './components/IntroScreen'
import { AbeiMap } from './components/AbeiMap'
import { EncounterModal } from './components/EncounterModal'
import type { Sighting } from './types'
import './App.css'

function App() {
  const [ready, setReady] = useState(false)
  const [sightings, setSightings] = useState<Sighting[]>([])
  const [active, setActive] = useState<Sighting | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      if (e.key === 'Escape') setActive(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready])

  const openSighting = (sighting: Sighting) => setActive(sighting)

  return (
    <div className="app">
      {!ready && <IntroScreen onEnter={() => setReady(true)} />}

      <header className="chrome-header">
        <div className="brand">
          <img className="pixel" src="/assets/bear-print.png" alt="" />
          <div className="brand-text">
            <strong>ABEI FINDER GBA</strong>
            <small>POLAR BEAR TRACKER // OSM</small>
          </div>
        </div>
        <div className="status-chip" aria-live="polite">
          BEAR STATUS:
          <br />
          <span className="blink">
            {active ? `LOCKED: ${active.title}` : '[ SCANNING... ]'}
          </span>
        </div>
      </header>

      <main className="frame">
        {ready && !error && (
          <AbeiMap
            sightings={sightings}
            activeId={active?.id ?? null}
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

        <aside className="hud hud-top-right">
          <div className="hud-panel">
            <h2>SIGHTINGS ({sightings.length})</h2>
            <ul className="sighting-list">
              {sightings.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={active?.id === s.id ? 'active' : undefined}
                    onClick={() => openSighting(s)}
                  >
                    {s.title}
                    <span className="meta">{s.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

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

      <footer className="chrome-footer">
        <div className="ticker" aria-hidden>
          <div className="ticker-track">
            <span>
              <strong>ABEI LOCATED</strong> — FOLLOW THE BEAR PRINTS AROUND THE
              GLOBE — ARCTIC CYAN ONLINE —
            </span>
            <span>
              <strong>ABEI LOCATED</strong> — FOLLOW THE BEAR PRINTS AROUND THE
              GLOBE — ARCTIC CYAN ONLINE —
            </span>
          </div>
        </div>
        <div className="footer-actions">
          <button
            type="button"
            className="pixel-btn secondary"
            onClick={() => setActive(sightings[0] ?? null)}
            disabled={!sightings.length}
          >
            FIND ABEI
          </button>
        </div>
      </footer>
    </div>
  )
}

export default App
