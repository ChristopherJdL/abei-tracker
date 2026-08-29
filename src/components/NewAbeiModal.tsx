import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PixelButton } from './PixelButton'
import {
  canCreateSightingToday,
  recordSightingCreationToday,
} from '../lib/creations'
import './PokemonCard.css'
import './NewAbeiModal.css'

interface NewAbeiModalProps {
  onClose: () => void
}

export function NewAbeiModal({ onClose }: NewAbeiModalProps) {
  const [promptText, setPromptText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isLimitReached, setIsLimitReached] = useState(false)

  const day = new Date().getDay()
  let nextDay = ''
  if (day === 0) nextDay = 'Monday'
  else if (day === 1 || day === 2) nextDay = 'Wednesday'
  else if (day === 3 || day === 4 || day === 5) nextDay = 'Saturday'
  else nextDay = 'Sunday'

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
        className="pokemon-card pokemon-card--terminal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-title"
      >
        {/* 1. Top Header Bar: Small Stage Badge + Main Title + Close Button */}
        <div className="pokemon-card__topbar">
          <div className="pokemon-card__stage-badge pokemon-card__stage-badge--new">
            <img
              className="pixel pokemon-card__stage-img"
              src="/assets/abei.png"
              alt=""
              aria-hidden
            />
            <span>NEW SIGHTING</span>
          </div>

          <h2 id="request-title" className="pokemon-card__title">
            SUBMIT A SIGHTING
          </h2>

          <div className="pokemon-card__close">
            <PixelButton
              variant="red"
              isSquare
              onClick={onClose}
              ariaLabel="Close modal"
            >
              <span className="pixel-cross" />
            </PixelButton>
          </div>
        </div>

        {/* 2. Sub-strip Header: Global Polar Bear Tracker */}
        <div className="pokemon-card__strip pokemon-card__strip--tracker">
          <span className="terminal-radar-dot" aria-hidden />
          <span>GLOBAL POLAR BEAR TRACKER</span>
          <span className="terminal-radar-dot" aria-hidden />
        </div>

        {/* 3. Expedition Terminal Body Content */}
        <div className="pokemon-card__body pokemon-card__body--terminal">
          {submitted ? (
            <div className="terminal-feedback">
              {isLimitReached ? (
                <div className="terminal-feedback__box">
                  <div className="terminal-feedback__badge terminal-feedback__badge--limit">
                    LIMIT OF SUBMISSION REACHED
                  </div>
                  <p className="terminal-feedback__text">
                    Daily tracker quota reached! Abei is resting in his arctic den. Maximum 3 Abei creations per day allowed per operator, only on Wed/Sat/Sun/Mon.
                  </p>
                  <p className="terminal-feedback__sub">
                    Come back next <strong>{nextDay}</strong> to hunt more paws!
                  </p>
                </div>
              ) : (
                <div className="terminal-feedback__box">
                  <div className="terminal-feedback__badge terminal-feedback__badge--success">
                    SUBMISSION RECEIVED
                  </div>
                  <p className="terminal-feedback__text">
                    Your sighting report has been beamed to Arctic Satellite HQ!
                  </p>
                  <p className="terminal-feedback__sub">
                    Our polar cartographers are rendering the encounter. Check back soon to hunt Abei’s new paw on the globe.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="terminal-form">
              {/* Question Header */}
              <div className="terminal-form__header">
                <img
                  className="pixel terminal-form__paw"
                  src="/assets/bear-print.png"
                  alt=""
                  aria-hidden
                />
                <label
                  htmlFor="abei-prompt-input"
                  className="terminal-form__question"
                >
                  WHERE DO YOU WANT TO SEE ABEI NEXT?
                </label>
              </div>

              {/* Guidance / Helper Text */}
              <p className="terminal-form__helper">
                Write a complete sentence describing Abei's next journey, activity, or funny scenario:
              </p>

              {/* Dominant Large Multiline AI Prompt Field */}
              <div className="terminal-input-wrapper">
                <textarea
                  id="abei-prompt-input"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  rows={5}
                  placeholder="e.g. Abei eating warm katsu sando under the neon signs of Shibuya Crossing in Tokyo!"
                  required
                  className="terminal-textarea"
                />
                <div className="terminal-input-footer">
                  <span className="terminal-input-status">
                    <span className="terminal-status-blink">●</span> EXPEDITION PROMPT READY
                  </span>
                  <span className="terminal-char-count">
                    {promptText.length} CHARS
                  </span>
                </div>
              </div>

              {/* Action Button */}
              <div className="terminal-form__actions">
                <PixelButton type="submit" variant="orange" disabled={!promptText.trim()}>
                  SUBMIT SIGHTING
                </PixelButton>
              </div>
            </form>
          )}
        </div>

        {/* 4. Footer Action Button */}
        <div className="pokemon-card__footer-action">
          <PixelButton variant="blue" onClick={onClose}>
            {submitted ? 'CLOSE' : 'BACK TO MAP'}
          </PixelButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}
