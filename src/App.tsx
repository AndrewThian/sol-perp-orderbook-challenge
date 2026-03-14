import { useOrderBookSubscription } from './hooks/useOrderBookSubscription'
import { ConnectionStatus } from './components/ConnectionStatus'
import { OrderBookPanel } from './components/OrderBookPanel'

export default function App() {
  const { status } = useOrderBookSubscription()

  return (
    <div className="flex h-screen flex-col bg-background text-foreground dark">
      <ConnectionStatus status={status} />
      <OrderBookPanel />
    </div>
  )
}
