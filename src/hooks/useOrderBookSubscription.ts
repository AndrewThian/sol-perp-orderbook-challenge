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
      onMessage: (msg) => {
        if (msg.type === 'snapshot') {
          queryClient.setQueryData<OrderBookData>(
            QUERY_KEY,
            buildBookFromSnapshot(msg),
          )
          return
        }

        queryClient.setQueryData<OrderBookData>(QUERY_KEY, (prev) => {
          if (!prev) return prev

          const result = applyDelta(prev, msg)
          switch (result.status) {
            case 'applied':
              return result.book
            case 'stale':
              return prev
            case 'gap':
              socket.reconnect()
              return prev
          }
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
