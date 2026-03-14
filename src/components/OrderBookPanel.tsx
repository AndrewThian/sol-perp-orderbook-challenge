import {
  useSortedBids,
  useSortedAsks,
  useTotalSizes,
} from '../hooks/useOrderBook'
import { PriceTable } from './PriceTable'
import { SpreadRow } from './SpreadRow'
import { ConnectionStatus } from './ConnectionStatus'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/card'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { THROTTLE_OPTIONS, type ThrottleMs } from '../constants'
import type { ConnectionStatus as ConnectionStatusType } from '../hooks/useOrderBookSubscription'
import '../styles/orderbook.css'

export function OrderBookPanel({
  throttleMs,
  onThrottleChange,
  status,
}: {
  throttleMs: ThrottleMs
  onThrottleChange: (ms: ThrottleMs) => void
  status: ConnectionStatusType
}) {
  const { data: asks } = useSortedAsks()
  const { data: bids } = useSortedBids()
  const { data: totals } = useTotalSizes()

  return (
    <Card className="flex-1 min-h-0 rounded-none border-0 ring-0 bg-[#0d1117] py-0">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-3">
        <CardTitle className="text-sm font-semibold text-[#e6edf3] flex items-center gap-2">
          SOL-PERP Order Book
          <ConnectionStatus status={status} />
        </CardTitle>
        <ToggleGroup
          variant="outline"
          size="sm"
          value={[String(throttleMs)]}
          onValueChange={(value) => {
            if (value.length > 0) {
              onThrottleChange(Number(value[value.length - 1]) as ThrottleMs)
            }
          }}
        >
          {THROTTLE_OPTIONS.map((opt) => (
            <ToggleGroupItem key={opt.ms} value={String(opt.ms)}>
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>
      <CardContent className="flex flex-col min-h-0 flex-1 p-0">
        <div className="grid grid-cols-3 px-4 py-0.5 text-xs font-semibold text-muted-foreground border-b border-border">
          <span>Price</span>
          <span className="text-right">Size</span>
          <span className="text-right">Total</span>
        </div>
        {asks && <PriceTable levels={asks} side="ask" />}
        <SpreadRow />
        {bids && <PriceTable levels={bids} side="bid" />}
      </CardContent>
      {totals && (
        <CardFooter className="justify-between rounded-none text-xs text-muted-foreground px-4 py-2">
          <span>
            Bid Total:{' '}
            {totals.totalBidSize.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
          </span>
          <span>
            Ask Total:{' '}
            {totals.totalAskSize.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
          </span>
        </CardFooter>
      )}
    </Card>
  )
}
