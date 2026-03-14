import { Badge } from './ui/badge'
import type { ConnectionStatus as ConnectionStatusType } from '../hooks/useOrderBookSubscription'

const statusConfig = {
  connected: {
    label: 'Connected',
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
  connecting: {
    label: 'Connecting…',
    className:
      'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 animate-pulse',
  },
  disconnected: {
    label: 'Disconnected',
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
} as const

interface ConnectionStatusProps {
  status: ConnectionStatusType
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  const config = statusConfig[status]

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  )
}
