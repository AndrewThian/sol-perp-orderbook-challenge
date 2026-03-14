import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  buildBookFromSnapshot,
  applyDelta,
  type OrderBookData,
} from '@/lib/orderbook'
import { OrderBookSocket } from '@/lib/orderbook-socket'
import { WS_URL } from '../constants'
import type { ThrottleMs } from '../constants'

export const QUERY_KEY = ['orderbook', 'SOL-PERP'] as const

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export function useOrderBookSubscription({
  throttleMs,
}: {
  throttleMs: ThrottleMs
}) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [retryCount, setRetryCount] = useState(0)

  const bookRef = useRef<OrderBookData | undefined>(undefined)
  const dirtyRef = useRef(false)
  const throttleMsRef = useRef(throttleMs)

  useEffect(() => {
    throttleMsRef.current = throttleMs
  }, [throttleMs])

  useEffect(() => {
    const socket = new OrderBookSocket({
      url: WS_URL,
      onMessage: (msgs) => {
        let book = bookRef.current
        for (const msg of msgs) {
          if (msg.type === 'snapshot') {
            book = buildBookFromSnapshot(msg)
          } else {
            if (!book) continue
            const result = applyDelta(book, msg)
            switch (result.status) {
              case 'applied':
                book = result.book
                break
              case 'stale':
                break
              case 'gap':
                socket.reconnect()
                bookRef.current = book
                return
            }
          }
        }
        bookRef.current = book
        dirtyRef.current = true

        if (throttleMsRef.current === 0) {
          queryClient.setQueryData<OrderBookData>(QUERY_KEY, book)
          dirtyRef.current = false
        }
      },
      onConnectionChange: (connected) => {
        if (connected) {
          setStatus('connected')
          setRetryCount(0)
        } else {
          setStatus('disconnected')
          setRetryCount((n) => n + 1)
        }
      },
    })

    return () => socket.dispose()
  }, [queryClient])

  useEffect(() => {
    if (throttleMs === 0) return

    const id = setInterval(() => {
      if (dirtyRef.current) {
        queryClient.setQueryData<OrderBookData>(QUERY_KEY, bookRef.current)
        dirtyRef.current = false
      }
    }, throttleMs)

    return () => clearInterval(id)
  }, [throttleMs, queryClient])

  return { status, retryCount }
}
