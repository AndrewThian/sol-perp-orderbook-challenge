import { describe, it, expect } from 'vitest'
import { buildBookFromSnapshot, applyDelta } from '../orderbook'
import {
  SnapshotMessageSchema,
  DeltaMessageSchema,
  type DeltaMessage,
} from '@/schemas/orderbook'
import snapshotSample from '../../sample/snapshot.json'
import delta1Sample from '../../sample/delta-1.json'
import delta2Sample from '../../sample/delta-2.json'

const snapshot = SnapshotMessageSchema.parse(snapshotSample)
const delta1 = DeltaMessageSchema.parse(delta1Sample)
const delta2 = DeltaMessageSchema.parse(delta2Sample)

describe('buildBookFromSnapshot', () => {
  it('builds bids and asks maps from sample snapshot', () => {
    const book = buildBookFromSnapshot(snapshot)

    expect(book.bids).toBeInstanceOf(Map)
    expect(book.asks).toBeInstanceOf(Map)
    expect(book.bids.size).toBe(snapshot.bids.length)
    expect(book.asks.size).toBe(snapshot.asks.length)
  })

  it('preserves price→size entries from snapshot', () => {
    const book = buildBookFromSnapshot(snapshot)

    // spot-check a few real prices
    expect(book.bids.get(127.77)).toBe(35.69)
    expect(book.asks.get(151.38)).toBe(16.52)
  })

  it('copies sequence, symbol, and timestamp', () => {
    const book = buildBookFromSnapshot(snapshot)

    expect(book.sequence).toBe(185680)
    expect(book.symbol).toBe('SOL-PERP')
    expect(book.lastUpdated).toBe(snapshot.timestamp)
  })

  it('excludes size=0 entries from snapshot', () => {
    const snapshotWithZeros = SnapshotMessageSchema.parse({
      ...snapshotSample,
      bids: [
        [100, 5],
        [200, 0],
        [300, 10],
      ],
      asks: [
        [400, 0],
        [500, 3],
      ],
    })

    const book = buildBookFromSnapshot(snapshotWithZeros)

    expect(book.bids.size).toBe(2)
    expect(book.bids.has(200)).toBe(false)
    expect(book.bids.get(100)).toBe(5)
    expect(book.bids.get(300)).toBe(10)

    expect(book.asks.size).toBe(1)
    expect(book.asks.has(400)).toBe(false)
    expect(book.asks.get(500)).toBe(3)
  })
})

describe('applyDelta', () => {
  const book = buildBookFromSnapshot(snapshot)

  it('applies delta-1: updates existing levels and advances sequence', () => {
    const result = applyDelta(book, delta1)

    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return

    // delta-1 updates bid at 127.75 from 68.39 → 158.11
    expect(result.book.bids.get(127.75)).toBe(158.11)
    // delta-1 updates bid at 125.32.. from 2.73 → 43.45
    expect(result.book.bids.get(delta1.bids[1][0])).toBe(43.45)
    // delta-1 updates ask at 399.65.. from 121.73 → 49.44
    expect(result.book.asks.get(delta1.asks[0][0])).toBe(49.44)

    expect(result.book.sequence).toBe(185681)
    expect(result.book.lastUpdated).toBe(delta1.timestamp)
  })

  it('applies delta-2: removes level with size=0 and adds new level', () => {
    // first apply delta-1 to get the right sequence
    const after1 = applyDelta(book, delta1)
    if (after1.status !== 'applied') throw new Error('expected applied')

    const result = applyDelta(after1.book, delta2)
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return

    // delta-2 sets bid [-121.21..] size=0 → should be removed
    expect(result.book.bids.has(delta2.bids[0][0])).toBe(false)
    // delta-2 updates bid [-120.67] from 56.38 → 105.36
    expect(result.book.bids.get(delta2.bids[1][0])).toBe(105.36)
    // delta-2 adds new bid level 127.66
    expect(result.book.bids.get(127.66)).toBe(57.59)

    expect(result.book.sequence).toBe(185682)
  })

  it('does not mutate the previous book (immutability)', () => {
    const result = applyDelta(book, delta1)
    if (result.status !== 'applied') throw new Error('expected applied')

    // original book should still have old values
    expect(book.bids.get(127.75)).toBe(68.39)
    expect(book.sequence).toBe(185680)
  })

  it('removes levels with size=0 in delta', () => {
    const delta: DeltaMessage = {
      type: 'delta',
      symbol: 'SOL-PERP',
      timestamp: Date.now(),
      sequence: book.sequence + 1,
      bids: [[127.77, 0]], // exists in snapshot with size 35.69
      asks: [[151.38, 0]], // exists in snapshot with size 16.52
    }

    const result = applyDelta(book, delta)
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return

    expect(result.book.bids.has(127.77)).toBe(false)
    expect(result.book.asks.has(151.38)).toBe(false)
  })

  it("returns 'stale' when delta sequence ≤ book sequence", () => {
    const staleDelta: DeltaMessage = { ...delta1, sequence: 185680 }
    expect(applyDelta(book, staleDelta)).toEqual({ status: 'stale' })
  })

  it("returns 'gap' when delta sequence skips ahead", () => {
    const gapDelta: DeltaMessage = { ...delta1, sequence: 185690 }
    expect(applyDelta(book, gapDelta)).toEqual({ status: 'gap' })
  })
})
