import { describe, it, expect } from 'vitest'
import {
  selectSortedBids,
  selectSortedAsks,
  selectSpread,
  selectTotalSizes,
} from '@/hooks/useOrderBook'
import { MAX_DISPLAY_LEVELS } from '@/constants'
import type { OrderBookData } from '@/lib/orderbook'

function makeBook(
  bids: [number, number][],
  asks: [number, number][],
): OrderBookData {
  return {
    bids: new Map(bids),
    asks: new Map(asks),
    sequence: 1,
    symbol: 'SOL-PERP',
    lastUpdated: Date.now(),
  }
}

const fixture = makeBook(
  [
    [130, 10],
    [129, 20],
    [128, 30],
    [127, 15],
    [-5, 50], // negative — should be filtered
  ],
  [
    [131, 5],
    [132, 10],
    [133, 25],
    [134, 8],
    [999_999, 100], // outlier — should be filtered
  ],
)

describe('selectSortedBids', () => {
  it('sorts bids descending by price', () => {
    const bids = selectSortedBids(fixture)
    const prices = bids.map((l) => l.price)
    expect(prices).toEqual([130, 129, 128, 127])
  })

  it('filters out negative prices', () => {
    const bids = selectSortedBids(fixture)
    expect(bids.every((l) => l.price > 0)).toBe(true)
  })

  it('caps at MAX_DISPLAY_LEVELS', () => {
    const manyBids: [number, number][] = Array.from({ length: 30 }, (_, i) => [
      100 + i,
      1,
    ])
    const book = makeBook(manyBids, [])
    expect(selectSortedBids(book).length).toBe(MAX_DISPLAY_LEVELS)
  })

  it('computes cumulative totals correctly', () => {
    const bids = selectSortedBids(fixture)
    // sorted desc: 130(10), 129(20), 128(30), 127(15)
    expect(bids.map((l) => l.total)).toEqual([10, 30, 60, 75])
  })

  it('computes depthRatio between 0 and 1 with last === 1', () => {
    const bids = selectSortedBids(fixture)
    expect(bids[bids.length - 1].depthRatio).toBe(1)
    expect(bids[0].depthRatio).toBeGreaterThan(0)
    expect(bids[0].depthRatio).toBeLessThan(1)
  })
})

describe('selectSortedAsks', () => {
  it('sorts asks ascending by price', () => {
    const asks = selectSortedAsks(fixture)
    const prices = asks.map((l) => l.price)
    expect(prices).toEqual([131, 132, 133, 134])
  })

  it('filters out outlier prices', () => {
    const asks = selectSortedAsks(fixture)
    expect(asks.every((l) => l.price < 500_000)).toBe(true)
  })

  it('caps at MAX_DISPLAY_LEVELS', () => {
    const manyAsks: [number, number][] = Array.from({ length: 30 }, (_, i) => [
      200 + i,
      1,
    ])
    const book = makeBook([], manyAsks)
    expect(selectSortedAsks(book).length).toBe(MAX_DISPLAY_LEVELS)
  })

  it('computes cumulative totals correctly', () => {
    const asks = selectSortedAsks(fixture)
    // sorted asc: 131(5), 132(10), 133(25), 134(8)
    expect(asks.map((l) => l.total)).toEqual([5, 15, 40, 48])
  })
})

describe('selectSpread', () => {
  it('computes absolute and percentage spread', () => {
    const spread = selectSpread(fixture)
    expect(spread.bestBid).toBe(130)
    expect(spread.bestAsk).toBe(131)
    expect(spread.absolute).toBe(1)
    expect(spread.percentage).toBeCloseTo((1 / 131) * 100)
  })

  it('returns zeros for empty maps', () => {
    const empty = makeBook([], [])
    const spread = selectSpread(empty)
    expect(spread).toEqual({
      absolute: 0,
      percentage: 0,
      bestBid: 0,
      bestAsk: 0,
    })
  })

  it('ignores negative bids and outlier asks', () => {
    const book = makeBook([[-10, 5]], [[999_999, 10]])
    const spread = selectSpread(book)
    expect(spread.absolute).toBe(0)
  })
})

describe('selectTotalSizes', () => {
  it('sums all bid and ask sizes', () => {
    const totals = selectTotalSizes(fixture)
    // bids: 10+20+30+15+50 = 125 (includes negative price entry)
    expect(totals.totalBidSize).toBe(125)
    // asks: 5+10+25+8+100 = 148 (includes outlier entry)
    expect(totals.totalAskSize).toBe(148)
  })

  it('returns 0 for empty maps', () => {
    const empty = makeBook([], [])
    expect(selectTotalSizes(empty)).toEqual({
      totalBidSize: 0,
      totalAskSize: 0,
    })
  })
})
