import { useOrderBookSubscription } from '@/hooks/useOrderBookSubscription'

const statusLabels: Record<string, string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  disconnected: 'Disconnected',
}

export function ConnectionStatus() {
  const { status } = useOrderBookSubscription()

  return (
    <div
      className={`connection-dot connection-dot--${status}`}
      title={statusLabels[status] ?? status}
    />
  )
}
