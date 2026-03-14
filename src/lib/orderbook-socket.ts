import { ServerMessageSchema, type ServerMessage } from '@/schemas/orderbook'

export interface OrderBookSocketOptions {
  url: string
  onMessage: (msgs: ServerMessage[]) => void
  onConnectionChange?: (connected: boolean) => void
}

export class OrderBookSocket {
  private options: OrderBookSocketOptions
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private attempt = 0
  private disposed = false
  private queue: ServerMessage[] = []
  private rafId: number | null = null

  constructor(options: OrderBookSocketOptions) {
    this.options = options
    this.connect()
  }

  private connect() {
    if (this.disposed) return

    this.ws = new WebSocket(this.options.url)

    this.ws.onopen = () => {
      this.attempt = 0
      this.options.onConnectionChange?.(true)
      this.ws!.send(JSON.stringify({ type: 'subscribe' }))
    }

    this.ws.onmessage = (event: MessageEvent) => this.handleMessage(event)

    this.ws.onclose = () => {
      this.options.onConnectionChange?.(false)
      this.scheduleReconnect()
    }

    this.ws.onerror = () => this.ws?.close()
  }

  private handleMessage(event: MessageEvent) {
    let data: unknown
    try {
      data = JSON.parse(event.data as string)
    } catch {
      return
    }

    const parsed = ServerMessageSchema.safeParse(data)
    if (!parsed.success) return

    this.queue.push(parsed.data)
    this.scheduleFlush()
  }

  private scheduleFlush() {
    if (this.rafId != null) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      this.options.onMessage(this.queue.splice(0))
    })
  }

  private scheduleReconnect() {
    if (this.disposed) return
    const delay = Math.min(1000 * 2 ** this.attempt, 30_000)
    this.attempt++
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  reconnect() {
    this.ws?.close()
  }

  dispose() {
    this.disposed = true
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
  }
}
