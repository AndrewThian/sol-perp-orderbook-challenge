import { useSortedBids, useSortedAsks, useTotalSizes } from '../hooks/useOrderBook'
import { PriceTable } from './PriceTable'
import { SpreadRow } from './SpreadRow'
import '../styles/orderbook.css'

export function OrderBookPanel() {
  const { data: asks } = useSortedAsks()
  const { data: bids } = useSortedBids()
  const { data: totals } = useTotalSizes()

  return (
    <div className="orderbook-panel flex-1 min-h-0">
      {/* Header */}
      <div className="orderbook-header">
        <span>SOL-PERP Order Book</span>
      </div>

      {/* Column headers */}
      <div className="price-row column-header">
        <span>Price</span>
        <span>Size</span>
        <span>Total</span>
      </div>

      {/* Asks — reversed so best ask is nearest to spread */}
      {asks && <PriceTable levels={[...asks].reverse()} side="ask" />}

      {/* Spread */}
      <SpreadRow />

      {/* Bids — best bid at top */}
      {bids && <PriceTable levels={bids} side="bid" />}

      {/* Footer — total sizes */}
      {totals && (
        <div className="orderbook-footer">
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
        </div>
      )}
    </div>
  )
}
