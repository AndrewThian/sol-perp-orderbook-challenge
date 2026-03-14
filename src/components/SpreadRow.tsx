import { useSpread } from '../hooks/useOrderBook'

export function SpreadRow() {
  const { data } = useSpread()

  if (!data) return null

  return (
    <div className="grid grid-cols-3 px-4 py-1 bg-[#161b22] text-muted-foreground font-mono text-xs leading-6 border-y border-border">
      <span>Spread</span>
      <span>{data.absolute.toFixed(2)}</span>
      <span>{data.percentage.toFixed(2)}%</span>
    </div>
  )
}
