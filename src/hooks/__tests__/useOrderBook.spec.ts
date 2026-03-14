import { describe, it, expect } from 'vitest'
import {
  selectSortedBids,
  selectSortedAsks,
  selectSpread,
  selectTotalSizes,
} from '@/hooks/useOrderBook'
import { MAX_DISPLAY_LEVELS, OUTLIER_THRESHOLD } from '@/constants'
import type { OrderBookData } from '@/lib/orderbook'

function makeBook(overrides?: Partial<OrderBookData>): OrderBookData {
  return {
    bids: new Map([
      [110, 10],
      [109, 20],
      [108, 30],
      [-500, 5], // negative — should be filtered
    ]),
    asks: new Map([
      [111, 15],
      [112, 25],
      [113, 35],
      [900_000, 100], // outlier — should be filtered (>= OUTLIER_THRESHOLD)
    ]),
    sequence: 100,
    symbol: 'SOL-PERP',
    lastUpdated: 1000,
    ...overrides,
  }
}

describe('selectSortedBids', () => {
  it('sorts bids descending (highest price first)', () => {
    const bids = selectSortedBids(makeBook())
    expect(bids[0].price).toBe(110)
    expect(bids[1].price).toBe(109)
    expect(bids[2].price).toBe(108)
  })

  it('filters out negative prices', () => {
    const bids = selectSortedBids(makeBook())
    const prices = bids.map((b) => b.price)
    expect(prices).not.toContain(-500)
  })

  it('computes cumulative totals', () => {
    const bids = selectSortedBids(makeBook())
    // sorted desc: 110(10), 109(20), 108(30)
    expect(bids[0].total).toBe(10)
    expect(bids[1].total).toBe(30) // 10 + 20
    expect(bids[2].total).toBe(60) // 10 + 20 + 30
  })

  it('computes depthRatio between 0 and 1', () => {
    const bids = selectSortedBids(makeBook())
    expect(bids[0].depthRatio).toBeCloseTo(10 / 60)
    expect(bids[2].depthRatio).toBeCloseTo(1) // last level = max
  })

  it('includes size field on each level', () => {
    const bids = selectSortedBids(makeBook())
    expect(bids[0].size).toBe(10)
    expect(bids[1].size).toBe(20)
    expect(bids[2].size).toBe(30)
  })

  it('returns empty array for empty bids', () => {
    const bids = selectSortedBids(makeBook({ bids: new Map() }))
    expect(bids).toEqual([])
  })

  it('caps at MAX_DISPLAY_LEVELS', () => {
    const manyBids: [number, number][] = Array.from({ length: 30 }, (_, i) => [
      100 + i,
      1,
    ])
    const book = makeBook({ bids: new Map(manyBids) })
    expect(selectSortedBids(book).length).toBe(MAX_DISPLAY_LEVELS)
  })

  it('returns all levels when fewer than MAX_DISPLAY_LEVELS', () => {
    const bids = selectSortedBids(makeBook())
    expect(bids.length).toBe(3) // 3 valid prices after filtering negative
  })

  it('handles single bid', () => {
    const book = makeBook({ bids: new Map([[50, 7]]) })
    const bids = selectSortedBids(book)
    expect(bids).toHaveLength(1)
    expect(bids[0]).toEqual({ price: 50, size: 7, total: 7, depthRatio: 1 })
  })
})

describe('selectSortedAsks', () => {
  it('sorts asks ascending (lowest price first)', () => {
    const asks = selectSortedAsks(makeBook())
    expect(asks[0].price).toBe(111)
    expect(asks[1].price).toBe(112)
    expect(asks[2].price).toBe(113)
  })

  it('filters out outlier prices above OUTLIER_THRESHOLD', () => {
    const asks = selectSortedAsks(makeBook())
    const prices = asks.map((a) => a.price)
    expect(prices).not.toContain(900_000)
  })

  it('computes cumulative totals', () => {
    const asks = selectSortedAsks(makeBook())
    // sorted asc: 111(15), 112(25), 113(35)
    expect(asks[0].total).toBe(15)
    expect(asks[1].total).toBe(40) // 15 + 25
    expect(asks[2].total).toBe(75) // 15 + 25 + 35
  })

  it('computes depthRatio correctly', () => {
    const asks = selectSortedAsks(makeBook())
    expect(asks[0].depthRatio).toBeCloseTo(15 / 75)
    expect(asks[2].depthRatio).toBeCloseTo(1)
  })

  it('includes size field on each level', () => {
    const asks = selectSortedAsks(makeBook())
    expect(asks[0].size).toBe(15)
    expect(asks[1].size).toBe(25)
    expect(asks[2].size).toBe(35)
  })

  it('returns empty array for empty asks', () => {
    const asks = selectSortedAsks(makeBook({ asks: new Map() }))
    expect(asks).toEqual([])
  })

  it('caps at MAX_DISPLAY_LEVELS', () => {
    const manyAsks: [number, number][] = Array.from({ length: 30 }, (_, i) => [
      200 + i,
      1,
    ])
    const book = makeBook({ asks: new Map(manyAsks) })
    expect(selectSortedAsks(book).length).toBe(MAX_DISPLAY_LEVELS)
  })

  it('handles single ask', () => {
    const book = makeBook({ asks: new Map([[200, 12]]) })
    const asks = selectSortedAsks(book)
    expect(asks).toHaveLength(1)
    expect(asks[0]).toEqual({ price: 200, size: 12, total: 12, depthRatio: 1 })
  })

  it('keeps prices just below OUTLIER_THRESHOLD', () => {
    const book = makeBook({
      asks: new Map([[OUTLIER_THRESHOLD - 1, 5]]),
    })
    const asks = selectSortedAsks(book)
    expect(asks[0].price).toBe(OUTLIER_THRESHOLD - 1)
  })

  it('filters price exactly at OUTLIER_THRESHOLD', () => {
    const book = makeBook({
      asks: new Map([[OUTLIER_THRESHOLD, 5]]),
    })
    const asks = selectSortedAsks(book)
    expect(asks).toEqual([])
  })
})

describe('selectSpread', () => {
  it('computes absolute spread as bestAsk - bestBid', () => {
    const spread = selectSpread(makeBook())
    expect(spread.absolute).toBeCloseTo(1) // 111 - 110
  })

  it('computes percentage spread', () => {
    const spread = selectSpread(makeBook())
    expect(spread.percentage).toBeCloseTo((1 / 111) * 100)
  })

  it('returns bestBid and bestAsk', () => {
    const spread = selectSpread(makeBook())
    expect(spread.bestBid).toBe(110)
    expect(spread.bestAsk).toBe(111)
  })

  it('ignores negative bid prices for best bid', () => {
    const book = makeBook({
      bids: new Map([
        [-500, 100],
        [50, 10],
      ]),
    })
    const spread = selectSpread(book)
    expect(spread.bestBid).toBe(50)
  })

  it('ignores outlier asks for best ask', () => {
    const book = makeBook({
      asks: new Map([
        [900_000, 100],
        [115, 10],
      ]),
    })
    const spread = selectSpread(book)
    expect(spread.bestAsk).toBe(115)
  })

  it('returns zeros when no valid bids', () => {
    const book = makeBook({ bids: new Map([[-100, 5]]) })
    const spread = selectSpread(book)
    expect(spread.absolute).toBe(0)
    expect(spread.percentage).toBe(0)
    expect(spread.bestBid).toBe(0)
    expect(spread.bestAsk).toBe(0)
  })

  it('returns zeros when no valid asks', () => {
    const book = makeBook({ asks: new Map([[900_000, 5]]) })
    const spread = selectSpread(book)
    expect(spread.absolute).toBe(0)
    expect(spread.percentage).toBe(0)
    expect(spread.bestBid).toBe(0)
    expect(spread.bestAsk).toBe(0)
  })

  it('returns zeros for empty maps', () => {
    const empty = makeBook({ bids: new Map(), asks: new Map() })
    const spread = selectSpread(empty)
    expect(spread).toEqual({
      absolute: 0,
      percentage: 0,
      bestBid: 0,
      bestAsk: 0,
    })
  })

  it('handles wide spread correctly', () => {
    const book = makeBook({
      bids: new Map([[10, 1]]),
      asks: new Map([[1000, 1]]),
    })
    const spread = selectSpread(book)
    expect(spread.absolute).toBe(990)
    expect(spread.bestBid).toBe(10)
    expect(spread.bestAsk).toBe(1000)
    expect(spread.percentage).toBeCloseTo((990 / 1000) * 100)
  })
})

describe('selectTotalSizes', () => {
  it('sums all bid sizes (including negative price entries)', () => {
    const { totalBidSize } = selectTotalSizes(makeBook())
    expect(totalBidSize).toBe(10 + 20 + 30 + 5) // includes negative price's size
  })

  it('sums all ask sizes (including outlier entries)', () => {
    const { totalAskSize } = selectTotalSizes(makeBook())
    expect(totalAskSize).toBe(15 + 25 + 35 + 100) // includes outlier's size
  })

  it('returns 0 for empty maps', () => {
    const empty = makeBook({ bids: new Map(), asks: new Map() })
    expect(selectTotalSizes(empty)).toEqual({
      totalBidSize: 0,
      totalAskSize: 0,
    })
  })

  it('handles single entry', () => {
    const book = makeBook({
      bids: new Map([[100, 42]]),
      asks: new Map([[200, 99]]),
    })
    expect(selectTotalSizes(book)).toEqual({
      totalBidSize: 42,
      totalAskSize: 99,
    })
  })
})
