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

### `useOrderBook` hooks: derived views via `select`

**Problem:** Components need sorted levels, spread, and totals — but the raw cache holds unsorted `Map<number, number>` entries that update on every WebSocket delta. Re-rendering every component on every cache update is wasteful.

**Solution: `select`-based derived hooks**

React Query's `select` option transforms cached data before it reaches the component. Combined with structural sharing, a component only re-renders when its specific derived slice actually changes — not on every cache write.

Four hooks (`useSortedBids`, `useSortedAsks`, `useSpread`, `useTotalSizes`) each attach a pure `select` function to the same `QUERY_KEY` used by the subscription hook. This means:

- **No data duplication.** There is one cache entry (raw `OrderBookData`). Each hook is a read-only lens over it.
- **Minimal re-renders.** A component using `useSpread()` won't re-render when bid sizes change but the best bid/ask stay the same, because structural sharing detects the output is identical.
- **`staleTime: Infinity` on each hook.** Each `useQuery` call with `select` creates an independent observer. Without infinite stale time, each observer would attempt its own refetch. Since the subscription hook is the sole data producer, derived hooks must be passive consumers.

**Filtering and depth computation happen in `select`, not on ingest:**

- Negative bid prices and outlier asks (above `OUTLIER_THRESHOLD`) are filtered during selection, keeping the raw cache faithful to server data.
- `depthRatio` (cumulative size / max cumulative size) is computed per-level so components receive a 0–1 value ready for depth bar rendering without any local calculation.

**Subscription hook refactored to `void`:** With derived hooks as the consumer API, `useOrderBookSubscription` no longer returns a `useQuery` result. Its role is purely side-effectual — start/stop the WebSocket and populate the cache.
