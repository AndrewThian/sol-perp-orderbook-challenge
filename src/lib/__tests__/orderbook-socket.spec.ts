import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OrderBookSocket } from '../orderbook-socket'

let mockInstances: MockWebSocket[]

class MockWebSocket {
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  send = vi.fn()
  close = vi.fn()

  constructor() {
    mockInstances.push(this)
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  mockInstances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.stubGlobal(
    'requestAnimationFrame',
    (cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0) as unknown as number,
  )
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const URL = 'wss://test.example.com/ws'

function createSocket(
  overrides: Partial<ConstructorParameters<typeof OrderBookSocket>[0]> = {},
) {
  return new OrderBookSocket({
    url: URL,
    onMessage: vi.fn(),
    ...overrides,
  })
}

describe('OrderBookSocket', () => {
  it('connects on construction', () => {
    createSocket()
    expect(mockInstances).toHaveLength(1)
  })

  it('sends subscribe on open', () => {
    createSocket()
    const ws = mockInstances[0]
    ws.onopen!()
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe' }))
  })

  it('parses and dispatches valid snapshot messages', () => {
    const onMessage = vi.fn()
    createSocket({ onMessage })
    const ws = mockInstances[0]
    ws.onopen!()

    const snapshot = {
      type: 'snapshot',
      symbol: 'SOL-PERP',
      timestamp: 1000,
      sequence: 1,
      bids: [[100, 10]],
      asks: [[101, 5]],
    }
    ws.onmessage!({ data: JSON.stringify(snapshot) })
    vi.advanceTimersToNextTimer()
    expect(onMessage).toHaveBeenCalledWith([snapshot])
  })

  it('parses and dispatches valid delta messages', () => {
    const onMessage = vi.fn()
    createSocket({ onMessage })
    const ws = mockInstances[0]

    const delta = {
      type: 'delta',
      symbol: 'SOL-PERP',
      timestamp: 1001,
      sequence: 2,
      bids: [[100, 12]],
      asks: [],
    }
    ws.onmessage!({ data: JSON.stringify(delta) })
    vi.advanceTimersToNextTimer()
    expect(onMessage).toHaveBeenCalledWith([delta])
  })

  it('ignores invalid JSON', () => {
    const onMessage = vi.fn()
    createSocket({ onMessage })
    mockInstances[0].onmessage!({ data: 'not json' })
    vi.advanceTimersToNextTimer()
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('ignores messages that fail schema validation', () => {
    const onMessage = vi.fn()
    createSocket({ onMessage })
    mockInstances[0].onmessage!({ data: JSON.stringify({ type: 'unknown' }) })
    vi.advanceTimersToNextTimer()
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('batches multiple messages into a single onMessage call', () => {
    const onMessage = vi.fn()
    createSocket({ onMessage })
    const ws = mockInstances[0]
    ws.onopen!()

    const snapshot = {
      type: 'snapshot',
      symbol: 'SOL-PERP',
      timestamp: 1000,
      sequence: 1,
      bids: [[100, 10]],
      asks: [[101, 5]],
    }
    const delta = {
      type: 'delta',
      symbol: 'SOL-PERP',
      timestamp: 1001,
      sequence: 2,
      bids: [[100, 12]],
      asks: [],
    }

    ws.onmessage!({ data: JSON.stringify(snapshot) })
    ws.onmessage!({ data: JSON.stringify(delta) })
    expect(onMessage).not.toHaveBeenCalled()

    vi.advanceTimersToNextTimer()
    expect(onMessage).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith([snapshot, delta])
  })

  it('reconnects on close with exponential backoff', () => {
    const socket = createSocket()
    const ws0 = mockInstances[0]

    // First close → 1s delay
    ws0.onclose!()
    expect(mockInstances).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(mockInstances).toHaveLength(2)

    // Second close → 2s delay
    mockInstances[1].onclose!()
    vi.advanceTimersByTime(1999)
    expect(mockInstances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(mockInstances).toHaveLength(3)

    // Third close → 4s delay
    mockInstances[2].onclose!()
    vi.advanceTimersByTime(4000)
    expect(mockInstances).toHaveLength(4)

    socket.dispose()
  })

  it('caps backoff at 30 seconds', () => {
    const socket = createSocket()

    // Simulate many closes to exceed cap
    for (let i = 0; i < 10; i++) {
      mockInstances[i].onclose!()
      vi.advanceTimersByTime(30_000)
    }

    // After 10 attempts, delay should be capped at 30s
    const lastWs = mockInstances[mockInstances.length - 1]
    lastWs.onclose!()
    vi.advanceTimersByTime(29_999)
    const countBefore = mockInstances.length
    vi.advanceTimersByTime(1)
    expect(mockInstances).toHaveLength(countBefore + 1)

    socket.dispose()
  })

  it('resets backoff on successful open', () => {
    const socket = createSocket()

    // Close → reconnect after 1s
    mockInstances[0].onclose!()
    vi.advanceTimersByTime(1000)
    expect(mockInstances).toHaveLength(2)

    // Close again → reconnect after 2s (backoff grows)
    mockInstances[1].onclose!()
    vi.advanceTimersByTime(2000)
    expect(mockInstances).toHaveLength(3)

    // Open successfully → resets backoff
    mockInstances[2].onopen!()

    // Close again → should be back to 1s
    mockInstances[2].onclose!()
    vi.advanceTimersByTime(999)
    expect(mockInstances).toHaveLength(3)
    vi.advanceTimersByTime(1)
    expect(mockInstances).toHaveLength(4)

    socket.dispose()
  })

  it('reconnect() closes WS to trigger reconnect flow', () => {
    const socket = createSocket()
    const ws = mockInstances[0]
    socket.reconnect()
    expect(ws.close).toHaveBeenCalled()
    socket.dispose()
  })

  it('dispose() prevents reconnection after close', () => {
    const socket = createSocket()
    socket.dispose()

    // Simulate onclose firing after dispose
    mockInstances[0].onclose!()
    vi.advanceTimersByTime(60_000)
    expect(mockInstances).toHaveLength(1) // no new connections
  })

  it('dispose() clears pending reconnect timer', () => {
    const socket = createSocket()

    // Trigger close to schedule reconnect
    mockInstances[0].onclose!()
    // Dispose before timer fires
    socket.dispose()
    vi.advanceTimersByTime(60_000)
    expect(mockInstances).toHaveLength(1) // no new connections
  })

  it('calls onConnectionChange on open and close', () => {
    const onConnectionChange = vi.fn()
    const socket = createSocket({ onConnectionChange })
    const ws = mockInstances[0]

    ws.onopen!()
    expect(onConnectionChange).toHaveBeenCalledWith(true)

    ws.onclose!()
    expect(onConnectionChange).toHaveBeenCalledWith(false)

    socket.dispose()
  })
})
