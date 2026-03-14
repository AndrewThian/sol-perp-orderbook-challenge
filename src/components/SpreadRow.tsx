import { useSpread } from '../hooks/useOrderBook'

export function SpreadRow() {
  const { data } = useSpread()

  if (!data) return null

  return (
    <div className="spread-row">
      <span>Spread</span>
      <span>{data.absolute.toFixed(2)}</span>
      <span>{data.percentage.toFixed(2)}%</span>
    </div>
  )
}
