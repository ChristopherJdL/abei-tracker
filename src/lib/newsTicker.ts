export type NewsTickerLabel =
  | 'BREAKING'
  | 'ALERT'
  | 'EXCLUSIVE'
  | 'UPDATE'
  | 'URGENT'
  | 'LIVE'

export interface NewsTickerItem {
  label: NewsTickerLabel
  text: string
}

/** Shocking-but-cute wire copy — hints at sightings without naming Abei outright. */
export const NEWS_TICKER_ITEMS: NewsTickerItem[] = [
  {
    label: 'BREAKING',
    text: 'Whale spotted asking directions to Iceland. Locals unconvinced',
  },
  {
    label: 'ALERT',
    text: 'Sahara taco cart reports unpaid customer. Description: fluffy, red scarf',
  },
  {
    label: 'EXCLUSIVE',
    text: 'Shibuya scramble halted. One commuter refused to drop katsu sando',
  },
  {
    label: 'UPDATE',
    text: 'Table Mountain guide: tourist ate entire bunny chow. Zero regrets',
  },
  {
    label: 'URGENT',
    text: 'Baie des Sirènes grill empty. Poisson grillé gone. Paw prints on sand',
  },
  {
    label: 'LIVE',
    text: 'Vieux-Port witnesses: cagoule gang fled one white suspect at full sprint',
  },
  {
    label: 'BREAKING',
    text: 'Qatar oil slick: seagull pulled free mid-ocean. Engineers watched from the plant',
  },
  {
    label: 'EXCLUSIVE',
    text: 'Nouvelle Zemble ice floe: seal escaped. Penguin still screaming',
  },
]
