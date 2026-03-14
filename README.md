# Sol Perp Orderbook

## Design Decisions

### `useOrderBookSubscription`: react-query as subscription manager vs cache-only store

**Decision: Cache-only store (current approach)**

The WebSocket lifecycle is managed in a `useEffect`, and data is pushed into react-query via `queryClient.setQueryData`. The `useQuery` call is disabled (`enabled: false`) and exists only so consumers get reactive reads from the cache.

**Alternative considered: `useQuery` manages the subscription**

In this approach, `queryFn` would open the WebSocket and resolve with the initial snapshot. Subsequent deltas would still use `setQueryData`, but react-query would own the connection lifecycle (refetch on mount, window focus, etc.).

**Why cache-only wins here:**

- **Subscription ≠ request/response.** `useQuery` models a fetch-return cycle. A WebSocket is a persistent stream — forcing it into `queryFn` means fighting react-query's retry, refetch, and garbage-collection defaults rather than leveraging them.
- **Explicit reconnect control.** The orderbook needs sequence-aware reconnection (gap detection → `socket.reconnect()`). This is simpler in a `useEffect` than inside `queryFn` callbacks, where react-query's own retry/refetch logic could conflict.
- **No stale/refetch semantics.** Orderbook data is never "stale" in the HTTP sense — it's continuously pushed. Setting `staleTime: Infinity` and `enabled: false` effectively opts out of every `useQuery` feature except the cache, which signals that `useQuery` isn't the right abstraction for the lifecycle.
- **Cleaner teardown.** `useEffect` cleanup naturally disposes the socket. With `queryFn`, teardown requires an `AbortSignal` or external ref, adding complexity for no benefit.

react-query still provides value as the cache layer: reactive updates, shared reads across components, and devtools visibility — without coupling the subscription lifecycle to its fetch model.
