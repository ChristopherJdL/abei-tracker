import { NEWS_TICKER_ITEMS } from '../lib/newsTicker'

function TickerGroup({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <div className="news-ticker__group" aria-hidden={ariaHidden || undefined}>
      {NEWS_TICKER_ITEMS.map((item, i) => (
        <span className="news-ticker__item" key={`${item.label}-${i}`}>
          <span className={`news-ticker__tag news-ticker__tag--${item.label.toLowerCase()}`}>
            {item.label}
          </span>
          <span className="news-ticker__text">{item.text}</span>
          <span className="news-ticker__sep" aria-hidden>▪</span>
        </span>
      ))}
    </div>
  )
}

export function NewsTicker() {
  return (
    <div className="news-ticker" role="region" aria-label="Tracker news feed">
      <div className="news-ticker__label" aria-hidden>
        <div className="news-ticker__live-badge">
          <span className="news-ticker__live-dot" />
          <span className="news-ticker__live">LIVE</span>
        </div>
        <span className="news-ticker__brand">TRACKER FEED</span>
      </div>
      <div className="news-ticker__viewport">
        <div className="news-ticker__track">
          <TickerGroup />
          <TickerGroup ariaHidden />
        </div>
      </div>
    </div>
  )
}
