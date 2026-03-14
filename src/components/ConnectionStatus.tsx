import { useOrderBookSubscription } from '@/hooks/useOrderBookSubscription'

export function ConnectionStatus() {
  const { status, retryCount } = useOrderBookSubscription()

  if (status === 'connected') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="rounded-md bg-green-100 px-4 py-2 text-green-800 dark:bg-green-950 dark:text-green-300">
          Connected to SOL-PERP feed
        </p>
      </div>
    )
  }

  if (status === 'disconnected') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="rounded-md bg-red-100 px-4 py-2 text-red-800 dark:bg-red-950 dark:text-red-300">
          Disconnected — retrying ({retryCount})…
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="rounded-md bg-zinc-100 px-4 py-2 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        Connecting to SOL-PERP feed…
      </p>
    </div>
  )
}
