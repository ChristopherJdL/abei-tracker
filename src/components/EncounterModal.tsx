import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Sighting } from '../types'

interface EncounterModalProps {
  sighting: Sighting
  onClose: () => void
}

export function EncounterModal({ sighting, onClose }: EncounterModalProps) {
  const badgeClass =
    sighting.status === 'SCANNING'
      ? 'badge scanning'
      : sighting.status === 'RUMORED'
        ? 'badge rumored'
        : 'badge'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="encounter-layer" role="presentation">
      {/* pointer-events: none — map stays draggable while locked */}
      <div className="encounter-dim" aria-hidden />

      <div
        className="pixel-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="encounter-title"
      >
        <div className="pixel-window__bezel">
          <div className="pixel-window__titlebar">
            <p className="pixel-window__card">ENCOUNTER CARD</p>
            <button
              type="button"
              className="modal-close"
              aria-label="Close encounter"
              onClick={onClose}
            >
              X
            </button>
          </div>

          <div className="pixel-window__body">
            <header className="pixel-window__header">
              <div>
                <p className="pixel-window__label">SIGHTING LOCKED</p>
                <h2 id="encounter-title">{sighting.title}</h2>
                <p className="pixel-window__sub">{sighting.subtitle}</p>
                <span className={badgeClass}>{sighting.status}</span>
              </div>
              <img
                className="pixel pixel-window__abei"
                src="/assets/abei.png"
                alt=""
                aria-hidden
              />
            </header>

            <div className="pixel-screen">
              <div className="pixel-screen__frame">
                <img
                  className="pixel pixel-screen__img"
                  src={sighting.image}
                  alt={`Abei sighting: ${sighting.title}`}
                />
                <div className="pixel-screen__scanlines" aria-hidden />
              </div>
              <div className="pixel-screen__meta">
                <span>
                  LAT {sighting.lat.toFixed(2)} / LNG {sighting.lng.toFixed(2)}
                </span>
                <span>SCENE: {sighting.image.replace('/scenes/', '')}</span>
              </div>
            </div>

            <footer className="pixel-window__footer">
              <button type="button" className="pixel-btn" onClick={onClose}>
                BACK TO MAP
              </button>
            </footer>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
