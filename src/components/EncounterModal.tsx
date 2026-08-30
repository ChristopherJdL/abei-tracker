import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PixelButton } from './PixelButton'
import type { Sighting } from '../types'
import { resolveSceneUrl } from '../lib/cdn'
import './PokemonCard.css'

interface EncounterModalProps {
  sighting: Sighting
  onClose: () => void
}

export function EncounterModal({ sighting, onClose }: EncounterModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const imageFileName = sighting.image.split('/').pop() || sighting.id
  const sceneSrc = resolveSceneUrl(sighting.image)

  return createPortal(
    <div className="encounter-layer" role="presentation">
      {/* pointer-events: none — map stays draggable while locked */}
      <div className="encounter-dim" aria-hidden />

      <div
        className="pokemon-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="encounter-title"
      >
        {/* Top Header Bar */}
        <div className="pokemon-card__topbar">
          <div className="pokemon-card__stage-badge">
            <img
              className="pixel pokemon-card__stage-img"
              src="/assets/abei.png"
              alt=""
              aria-hidden
            />
            <span>TRACKER</span>
          </div>

          <h2 id="encounter-title" className="pokemon-card__title">
            {sighting.title}
          </h2>

          <div className="pokemon-card__close">
            <PixelButton
              variant="red"
              isSquare
              onClick={onClose}
              ariaLabel="Close encounter"
            >
              <span className="pixel-cross" />
            </PixelButton>
          </div>
        </div>

        {/* Center Image Art Box */}
        <div className="pokemon-card__art-frame">
          <img
            className="pixel pokemon-card__art-img"
            src={sceneSrc}
            alt={`Abei sighting: ${sighting.title}`}
          />
          <div className="pokemon-card__art-shine" aria-hidden />
        </div>

        {/* Yellow Sub-strip (Coordinates) */}
        <div className="pokemon-card__strip">
          Sighting Coords: LAT {sighting.lat.toFixed(2)} • LNG {sighting.lng.toFixed(2)}
        </div>

        {/* Description / Subtitle Box */}
        <div className="pokemon-card__body">
          <div className="pokemon-card__attack">
            <img
              className="pixel pokemon-card__paw-icon"
              src="/assets/bear-print.png"
              alt=""
              aria-hidden
            />
            <p className="pokemon-card__subtitle">{sighting.subtitle}</p>
          </div>
        </div>

        {/* Bottom Meta & Image Identifier at bottom right */}
        <div className="pokemon-card__meta">
          <span className="pokemon-card__status-badge">{sighting.status}</span>
          <span className="pokemon-card__image-id">{imageFileName}</span>
        </div>

        {/* Action Button */}
        <div className="pokemon-card__footer-action">
          <PixelButton variant="blue" onClick={onClose}>
            BACK TO MAP
          </PixelButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}
