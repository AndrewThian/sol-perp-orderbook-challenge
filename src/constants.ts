export const WS_URL = 'wss://orderbook-ws-server.opennext-test.workers.dev/ws'

export const MAX_DISPLAY_LEVELS = 20
export const OUTLIER_THRESHOLD = 500_000

export const THROTTLE_OPTIONS = [
  { label: '1s', ms: 1000 },
  { label: '500ms', ms: 500 },
  { label: '300ms', ms: 300 },
  { label: '200ms', ms: 200 },
  { label: 'Max', ms: 0 },
] as const

export type ThrottleMs = (typeof THROTTLE_OPTIONS)[number]['ms']
