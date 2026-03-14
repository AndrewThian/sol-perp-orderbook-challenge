import React from 'react'

interface PriceRowProps {
  price: number
  size: number
  total: number
  depthRatio: number
  side: 'bid' | 'ask'
}

export const PriceRow = React.memo(function PriceRow({
  price,
  size,
  total,
  depthRatio,
  side,
}: PriceRowProps) {
  const isEmpty = price === 0 && size === 0

  return (
    <div
      className="price-row"
      style={{ '--depth': depthRatio } as React.CSSProperties}
    >
      <div className={`depth-bar depth-bar--${side}`} />
      <span className={side === 'bid' ? 'text-emerald-500' : 'text-red-500'}>
        {isEmpty ? '' : price.toFixed(2)}
      </span>
      <span className="text-right text-[#e6edf3]">
        {isEmpty ? '' : size.toFixed(2)}
      </span>
      <span className="text-right text-muted-foreground">
        {isEmpty ? '' : total.toFixed(2)}
      </span>
    </div>
  )
})
