import { useOrderBookSubscription } from './hooks/useOrderBookSubscription'
import { ConnectionStatus } from './components/ConnectionStatus'
import { OrderBookPanel } from './components/OrderBookPanel'

export default function App() {
  const { status } = useOrderBookSubscription()

  return (
    <div className="app">
      <ConnectionStatus status={status} />
      <OrderBookPanel />
    </div>
  )
}
