interface IntroScreenProps {
  onEnter: () => void
}

export function IntroScreen({ onEnter }: IntroScreenProps) {
  return (
    <div className="intro" role="dialog" aria-label="Welcome to Abei Tracker">
      <div className="intro-card">
        <img
          className="intro-abei pixel"
          src="/assets/abei.png"
          alt="Abei the polar bear waving"
        />
        <h1>
          ABEI <span>FINDER</span>
        </h1>
        <p>
          Frost scan online. Tap an ice print on the globe to catch Abei mid-adventure.
        </p>
        <div className="intro-actions">
          <button type="button" className="pixel-btn" onClick={onEnter}>
            OPEN TRACKER
          </button>
        </div>
      </div>
    </div>
  )
}
