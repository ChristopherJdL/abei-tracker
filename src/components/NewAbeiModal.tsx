import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PixelButton } from './PixelButton'
import {
  canCreateSightingToday,
  recordSightingCreationToday,
} from '../lib/creations'

interface NewAbeiModalProps {
  onClose: () => void
}

export function NewAbeiModal({ onClose }: NewAbeiModalProps) {
  const [promptText, setPromptText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!promptText.trim()) return

    // Enforce daily creation limit of 2 per day in localStorage
    if (canCreateSightingToday()) {
      recordSightingCreationToday()

      const lambdaUrl = import.meta.env.VITE_LAMBDA_URL || ''
      if (lambdaUrl) {
        fetch(lambdaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptText,
          }),
        }).catch(() => {
          // Fire and forget - ignore errors
        })
      }
    }

    // Always display submission success message (silent failure if limit reached)
    setSubmitted(true)
  }

  return createPortal(
    <div className="encounter-layer" role="presentation">
      <div className="encounter-dim" aria-hidden />

      <div
        className="pixel-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-title"
        style={{ maxWidth: '420px' }}
      >
        <div className="pixel-window__bezel">
          <div className="pixel-window__titlebar">
            <p className="pixel-window__card">NEW ABEI REQUEST</p>
            <PixelButton
              variant="red"
              isSquare
              onClick={onClose}
              ariaLabel="Close modal"
            >
              <span className="pixel-cross" />
            </PixelButton>
          </div>

          <div className="pixel-window__body">
            <header className="pixel-window__header">
              <div>
                <p className="pixel-window__label" style={{ color: '#ff6b35' }}>
                  NEW DISCOVERY
                </p>
                <h2 id="request-title" style={{ fontSize: '15px' }}>
                  SUBMIT A SIGHTING
                </h2>
              </div>
              <img
                className="pixel pixel-window__abei"
                src="/assets/abei.png"
                alt=""
                aria-hidden
              />
            </header>

            <div className="pixel-screen" style={{ padding: '16px' }}>
              {submitted ? (
                <div
                  style={{
                    padding: '20px 10px',
                    textAlign: 'center',
                    color: '#ffffff',
                    fontFamily: "'Press Start 2P', monospace, sans-serif",
                    fontSize: '11px',
                    lineHeight: '1.8',
                  }}
                >
                  <p style={{ color: '#ff6b35', marginBottom: '12px' }}>
                    [ SUBMISSION RECEIVED ]
                  </p>
                  <p>
                    Your submission is under evaluation, come back later to see if your submission is accepted.
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <label
                    htmlFor="abei-prompt-input"
                    style={{
                      fontFamily: "'Press Start 2P', monospace, sans-serif",
                      fontSize: '10px',
                      color: 'var(--ice-cyan)',
                      lineHeight: '1.5',
                    }}
                  >
                    Where do you want to see Abei next?
                  </label>

                  <textarea
                    id="abei-prompt-input"
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    rows={4}
                    placeholder="e.g. Abei eating ramen in Tokyo..."
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: 'rgba(4, 16, 24, 0.85)',
                      border: '2px solid var(--ice-edge)',
                      borderRadius: '4px',
                      color: '#ffffff',
                      fontFamily: 'inherit',
                      fontSize: '12px',
                      lineHeight: '1.4',
                      resize: 'none',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />

                  <div style={{ marginTop: '6px', textAlign: 'center' }}>
                    <PixelButton type="submit">SUBMIT</PixelButton>
                  </div>
                </form>
              )}
            </div>

            <footer className="pixel-window__footer" style={{ display: 'flex', justifyContent: 'center' }}>
              <PixelButton variant="blue" onClick={onClose}>
                {submitted ? 'CLOSE' : 'BACK TO MAP'}
              </PixelButton>
            </footer>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
