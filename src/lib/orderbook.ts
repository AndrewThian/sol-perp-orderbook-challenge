import type {
  SnapshotMessage,
  DeltaMessage,
  PriceLevel,
} from '@/schemas/orderbook'

function applyLevels(
  book: Map<number, number>,
  levels: PriceLevel[],
): Map<number, number> {
  // needs to immutable because react query uses shallow equal to detect changes
  const next = new Map(book)
  for (const [price, size] of levels) {
    if (size === 0) next.delete(price)
    else next.set(price, size)
  }
  return next
}

// data layer exports
export interface OrderBookData {
  bids: Map<number, number> // price → size
  asks: Map<number, number> // price → size
  sequence: number
  symbol: string
  lastUpdated: number
}

export function buildBookFromSnapshot(msg: SnapshotMessage): OrderBookData {
  return {
    bids: new Map(msg.bids.filter(([, size]) => size !== 0)),
    asks: new Map(msg.asks.filter(([, size]) => size !== 0)),
    sequence: msg.sequence,
    symbol: msg.symbol,
    lastUpdated: msg.timestamp,
  }
}

export type DeltaResult =
  | { status: 'applied'; book: OrderBookData }
  | { status: 'stale' }
  | { status: 'gap' }

// enriches with so we can perform filtering later
export function applyDelta(
  prev: OrderBookData,
  msg: DeltaMessage,
): DeltaResult {
  // Stale — already seen this sequence
  if (msg.sequence <= prev.sequence) {
    return { status: 'stale' }
  }

  // Gap — missed one or more deltas
  if (msg.sequence !== prev.sequence + 1) {
    return { status: 'gap' }
  }

  return {
    status: 'applied',
    book: {
      ...prev,
      bids: applyLevels(prev.bids, msg.bids),
      asks: applyLevels(prev.asks, msg.asks),
      sequence: msg.sequence,
      lastUpdated: msg.timestamp,
    },
  }
}
