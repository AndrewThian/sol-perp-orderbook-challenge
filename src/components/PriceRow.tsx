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
      <span className={`price--${side}`}>
        {isEmpty ? '' : price.toFixed(2)}
      </span>
      <span className="size-text">{isEmpty ? '' : size.toFixed(2)}</span>
      <span className="total-text">{isEmpty ? '' : total.toFixed(2)}</span>
    </div>
  )
})
