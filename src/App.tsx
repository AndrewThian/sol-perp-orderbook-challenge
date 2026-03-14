import { useState } from 'react'
import { useOrderBookSubscription } from './hooks/useOrderBookSubscription'
import { OrderBookPanel } from './components/OrderBookPanel'
import type { ThrottleMs } from './constants'

export default function App() {
  const [throttleMs, setThrottleMs] = useState<ThrottleMs>(200)
  const { status } = useOrderBookSubscription({ throttleMs })

  return (
    <div className="flex h-screen flex-col bg-background text-foreground dark">
      <OrderBookPanel
        throttleMs={throttleMs}
        onThrottleChange={setThrottleMs}
        status={status}
      />
    </div>
  )
}
