import type { DisplayLevel } from '../hooks/useOrderBook'
import { PriceRow } from './PriceRow'

interface PriceTableProps {
  levels: DisplayLevel[]
  side: 'bid' | 'ask'
}

export function PriceTable({ levels, side }: PriceTableProps) {
  return (
    <div className={`price-table price-table--${side}`}>
      {levels.map((level) => (
        <PriceRow key={level.price} {...level} side={side} />
      ))}
    </div>
  )
}
