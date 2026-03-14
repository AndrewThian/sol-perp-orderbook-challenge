import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  buildBookFromSnapshot,
  applyDelta,
  type OrderBookData,
} from '@/lib/orderbook'
import { OrderBookSocket } from '@/lib/orderbook-socket'
import { WS_URL } from '../constants'

export const QUERY_KEY = ['orderbook', 'SOL-PERP'] as const

export function useOrderBookSubscription() {
  const queryClient = useQueryClient()

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
    })

    return () => socket.dispose()
  }, [queryClient])

  return useQuery<OrderBookData>({
    queryKey: QUERY_KEY,
    queryFn: () => new Promise<OrderBookData>(() => {}),
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}
