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
    text: 'Machu Picchu summit: llama startled by fluffy white tourist attempting yoga pose',
  },
  {
    label: 'ALERT',
    text: 'Venice gondolier in tears: bear passenger steered gondola straight into gelato parlor',
  },
  {
    label: 'LIVE',
    text: 'Seoul karaoke room booked for 12 hours straight. Only cheerful bear roars echoing out',
  },
  {
    label: 'EXCLUSIVE',
    text: 'Taj Mahal marble gardens: security baffled by cozy red scarf draped over fountain',
  },
  {
    label: 'URGENT',
    text: 'Swiss Alps chalet fondue pot emptied in 20 seconds. Suspect fled downhill on a wooden sled',
  },
  {
    label: 'UPDATE',
    text: 'Amsterdam canals: runaway yellow paddle boat spotted with oversized polar captain at helm',
  },
  {
    label: 'BREAKING',
    text: 'Great Sphinx shadow photobombed by mint-green shirt. Archaeologists thoroughly charmed',
  },
  {
    label: 'ALERT',
    text: 'Singapore hawker center: entire stall of chili crab cleared out. 5-star review left in paw print',
  },
  {
    label: 'LIVE',
    text: 'Banff National Park: local grizzly bear reported completely intimidated by polite polar visitor',
  },
  {
    label: 'EXCLUSIVE',
    text: 'Bangkok tuk-tuk breaks speed record through night market. Passenger wore mint shirt and scarf',
  },
]
