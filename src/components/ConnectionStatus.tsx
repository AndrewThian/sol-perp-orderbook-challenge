import type { ConnectionStatus as ConnectionStatusType } from '../hooks/useOrderBookSubscription'

const statusLabels: Record<string, string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  disconnected: 'Disconnected',
}

interface ConnectionStatusProps {
  status: ConnectionStatusType
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  return (
    <div
      className={`connection-dot connection-dot--${status}`}
      title={statusLabels[status] ?? status}
    />
  )
}
