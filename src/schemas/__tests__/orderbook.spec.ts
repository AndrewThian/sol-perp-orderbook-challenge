import {
  PriceLevelSchema,
  SnapshotMessageSchema,
  DeltaMessageSchema,
  ServerMessageSchema,
} from '@/schemas/orderbook'
import snapshot from '../../sample/snapshot.json'
import delta1 from '../../sample/delta-1.json'
import delta2 from '../../sample/delta-2.json'
import delta3 from '../../sample/delta-3.json'
import delta4 from '../../sample/delta-4.json'
import delta5 from '../../sample/delta-5.json'

describe('PriceLevelSchema', () => {
  it('parses a valid [price, size] tuple', () => {
    expect(PriceLevelSchema.parse([127.77, 35.69])).toEqual([127.77, 35.69])
  })

  it('accepts negative prices', () => {
    expect(PriceLevelSchema.parse([-120.67, 56.38])).toEqual([-120.67, 56.38])
  })

  it('accepts zero size (removal signal)', () => {
    expect(PriceLevelSchema.parse([127.67, 0])).toEqual([127.67, 0])
  })

  it('rejects a tuple with missing elements', () => {
    expect(() => PriceLevelSchema.parse([127.77])).toThrow()
  })

  it('rejects non-numeric values', () => {
    expect(() => PriceLevelSchema.parse(['abc', 35.69])).toThrow()
  })
})

describe('SnapshotMessageSchema', () => {
  it('parses the sample snapshot', () => {
    const result = SnapshotMessageSchema.parse(snapshot)
    expect(result.type).toBe('snapshot')
    expect(result.symbol).toBe('SOL-PERP')
    expect(result.sequence).toBe(185680)
    expect(result.bids.length).toBeGreaterThan(0)
    expect(result.asks.length).toBeGreaterThan(0)
  })

  it('rejects a snapshot missing required fields', () => {
    const { bids: _, ...incomplete } = snapshot
    expect(() => SnapshotMessageSchema.parse(incomplete)).toThrow()
  })

  it('rejects non-integer sequence', () => {
    expect(() =>
      SnapshotMessageSchema.parse({ ...snapshot, sequence: 1.5 }),
    ).toThrow()
  })
})

describe('DeltaMessageSchema', () => {
  it('parses delta-1 (has both bids and asks)', () => {
    const result = DeltaMessageSchema.parse(delta1)
    expect(result.type).toBe('delta')
    expect(result.sequence).toBe(185681)
  })

  it('parses delta-2 (bids only, no asks)', () => {
    const result = DeltaMessageSchema.parse(delta2)
    expect(result.type).toBe('delta')
  })

  it('parses delta-3 (asks only, no bids)', () => {
    const result = DeltaMessageSchema.parse(delta3)
    expect(result.type).toBe('delta')
  })

  it('parses delta-4 (has both bids and asks)', () => {
    const result = DeltaMessageSchema.parse(delta4)
    expect(result.type).toBe('delta')
  })

  it('parses delta-5 (bids only, no asks)', () => {
    const result = DeltaMessageSchema.parse(delta5)
    expect(result.type).toBe('delta')
  })
})

describe('ServerMessageSchema', () => {
  it('discriminates a snapshot message', () => {
    const result = ServerMessageSchema.parse(snapshot)
    expect(result.type).toBe('snapshot')
  })

  it('discriminates a delta message', () => {
    const result = ServerMessageSchema.parse(delta1)
    expect(result.type).toBe('delta')
  })

  it('rejects an unknown message type', () => {
    expect(() =>
      ServerMessageSchema.parse({ ...snapshot, type: 'unknown' }),
    ).toThrow()
  })
})
