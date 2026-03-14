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
  return (
    <div
      className="price-row"
      style={{ '--depth': depthRatio } as React.CSSProperties}
    >
      <div className={`depth-bar depth-bar--${side}`} />
      <span className={`price--${side}`}>{price.toFixed(2)}</span>
      <span className="size-text">{size.toFixed(2)}</span>
      <span className="total-text">{total.toFixed(2)}</span>
    </div>
  )
})
