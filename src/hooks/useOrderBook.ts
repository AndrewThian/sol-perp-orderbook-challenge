import { useQuery } from '@tanstack/react-query'
import { QUERY_KEY } from './useOrderBookSubscription'
import { MAX_DISPLAY_LEVELS, OUTLIER_THRESHOLD } from '../constants'
import type { OrderBookData } from '../lib/orderbook'

export interface DisplayLevel {
  price: number
  size: number
  total: number // cumulative size
  depthRatio: number // 0–1, for scaleX depth bar
}

export function selectSortedBids(data: OrderBookData): DisplayLevel[] {
  const sorted = [...data.bids.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, MAX_DISPLAY_LEVELS)

  return padLevels(addCumulativeDepth(sorted))
}

export function selectSortedAsks(data: OrderBookData): DisplayLevel[] {
  const filtered = [...data.asks.entries()]
    .filter(([price]) => price < OUTLIER_THRESHOLD)
    .sort((a, b) => a[0] - b[0])
    .slice(0, MAX_DISPLAY_LEVELS)

  return padLevels(addCumulativeDepth(filtered))
}

export function selectSpread(data: OrderBookData) {
  const allBids = [...data.bids.keys()]
  const validAsks = [...data.asks.keys()].filter((p) => p < OUTLIER_THRESHOLD)

  if (allBids.length === 0 || validAsks.length === 0) {
    return { absolute: 0, percentage: 0, bestBid: 0, bestAsk: 0 }
  }

  const bestBid = Math.max(...allBids)
  const bestAsk = Math.min(...validAsks)
  const absolute = bestAsk - bestBid

  return {
    absolute,
    percentage: bestAsk > 0 ? (absolute / bestAsk) * 100 : 0,
    bestBid,
    bestAsk,
  }
}

export function selectTotalSizes(data: OrderBookData) {
  return {
    totalBidSize: [...data.bids.values()].reduce((s, v) => s + v, 0),
    totalAskSize: [...data.asks.values()].reduce((s, v) => s + v, 0),
  }
}

function addCumulativeDepth(levels: [number, number][]): DisplayLevel[] {
  let cumulative = 0
  const withTotals = levels.map(([price, size]) => {
    cumulative += size
    return { price, size, total: cumulative, depthRatio: 0 }
  })

  const maxTotal = cumulative
  for (const level of withTotals) {
    level.depthRatio = maxTotal > 0 ? level.total / maxTotal : 0
  }

  return withTotals
}

const EMPTY_LEVEL: DisplayLevel = { price: 0, size: 0, total: 0, depthRatio: 0 }

function padLevels(levels: DisplayLevel[]): DisplayLevel[] {
  if (levels.length >= MAX_DISPLAY_LEVELS) return levels
  return levels.concat(
    Array.from({ length: MAX_DISPLAY_LEVELS - levels.length }, () => ({
      ...EMPTY_LEVEL,
    })),
  )
}

export function useSortedBids() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => undefined as unknown as OrderBookData,
    staleTime: Infinity,
    enabled: false,
    select: selectSortedBids,
  })
}

export function useSortedAsks() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => undefined as unknown as OrderBookData,
    staleTime: Infinity,
    enabled: false,
    select: selectSortedAsks,
  })
}

export function useSpread() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => undefined as unknown as OrderBookData,
    staleTime: Infinity,
    enabled: false,
    select: selectSpread,
  })
}

export function useTotalSizes() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => undefined as unknown as OrderBookData,
    staleTime: Infinity,
    enabled: false,
    select: selectTotalSizes,
  })
}
