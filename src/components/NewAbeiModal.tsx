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
  const [isLimitReached, setIsLimitReached] = useState(false)

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
    if (!canCreateSightingToday()) {
      console.log('[NewAbei] 🛑 Daily creation limit of 2/day reached in localStorage. Displaying limit reached message.')
      setIsLimitReached(true)
      setSubmitted(true)
      return
    }

    recordSightingCreationToday()

    const lambdaUrl = import.meta.env.VITE_LAMBDA_URL || ''
    if (lambdaUrl) {
      console.log('[NewAbei] 🚀 Sending request to Lambda endpoint:', lambdaUrl, { prompt: promptText })

      fetch(lambdaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
        }),
      })
        .then(async (res) => {
          let responseData: any = null
          try {
            responseData = await res.json()
          } catch {
            responseData = null
          }

          if (!res.ok) {
            console.error(
              `[NewAbei] ❌ Lambda execution failed with HTTP status ${res.status}:`,
              responseData || 'No JSON body received'
            )
            if (responseData?.traceback) {
              console.error('[NewAbei] 📋 Lambda Remote Traceback:\n' + responseData.traceback)
            }
          } else {
            console.log('[NewAbei] ✅ Lambda execution succeeded:', responseData)
          }
        })
        .catch((err) => {
          console.error('[NewAbei] 💥 Network/Fetch error calling Lambda endpoint:', err)
        })
    } else {
      console.warn('[NewAbei] ⚠️ VITE_LAMBDA_URL environment variable is not defined!')
    }

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
                  {isLimitReached ? (
                    <>
                      <div
                        style={{
                          display: 'inline-block',
                          padding: '8px 14px',
                          margin: '0 auto 14px',
                          background: 'linear-gradient(180deg, #5c0d0d 0%, #300707 100%)',
                          border: '2px solid #ef4444',
                          borderRadius: '6px',
                          boxShadow: '0 3px 0 0 rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                          color: '#ff5555',
                          fontSize: '10px',
                          letterSpacing: '1px',
                          textShadow: '1px 1px 0 #2b0000',
                        }}
                      >
                        LIMIT OF SUBMISSION REACHED
                      </div>
                      <p style={{ margin: '8px 0 0', color: 'var(--frost-white)', fontSize: '10px', lineHeight: '1.7' }}>
                        Daily tracker quota reached! Abei is resting in his arctic den. Maximum 2 Abei creations per day allowed per operator. Come back tomorrow to hunt more paws!
                      </p>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          display: 'inline-block',
                          padding: '8px 16px',
                          margin: '0 auto 16px',
                          background: 'linear-gradient(180deg, #143848 0%, #0d2a38 100%)',
                          border: '2px solid var(--ice-cyan)',
                          borderRadius: '6px',
                          boxShadow: '0 3px 0 0 rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                          color: '#ff7700',
                          fontSize: '11px',
                          letterSpacing: '1px',
                          textShadow: '1px 1px 0 #421200',
                        }}
                      >
                        SUBMISSION RECEIVED
                      </div>
                      <p style={{ margin: '8px 0 0', color: 'var(--frost-white)' }}>
                        Your submission is under evaluation, come back later to see if your submission is accepted.
                      </p>
                    </>
                  )}
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
