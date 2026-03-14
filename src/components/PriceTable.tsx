import { useDeferredValue } from 'react'
import type { DisplayLevel } from '../hooks/useOrderBook'
import { PriceRow } from './PriceRow'

interface PriceTableProps {
  levels: DisplayLevel[]
  side: 'bid' | 'ask'
}

export function PriceTable({ levels, side }: PriceTableProps) {
  const deferredLevels = useDeferredValue(levels)
  return (
    <div
      className={`flex overflow-y-auto ${side === 'ask' ? 'flex-col-reverse' : 'flex-col'}`}
    >
      {deferredLevels.map((level, i) => (
        // key to index so react reuses the dom nodes instead of unmounting/mounting
        <PriceRow key={i} {...level} side={side} />
      ))}
    </div>
  )
}
