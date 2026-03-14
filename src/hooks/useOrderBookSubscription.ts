import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  buildBookFromSnapshot,
  applyDelta,
  type OrderBookData,
} from '@/lib/orderbook'
import { OrderBookSocket } from '@/lib/orderbook-socket'
import { WS_URL } from '../constants'

export const QUERY_KEY = ['orderbook', 'SOL-PERP'] as const

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export function useOrderBookSubscription() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const socket = new OrderBookSocket({
      url: WS_URL,
      onMessage: (msgs) => {
        queryClient.setQueryData<OrderBookData>(QUERY_KEY, (prev) => {
          let book = prev
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
                  return book
              }
            }
          }
          return book
        })
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

  return { status, retryCount }
}
