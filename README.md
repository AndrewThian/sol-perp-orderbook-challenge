# SOL-PERP Order Book

Real-time perpetual futures order book viewer for SOL-PERP, built with React 19, TypeScript, and WebSockets.

## Quick Start

```sh
npm install
npm run dev
```

| Command           | Description                    |
| ----------------- | ------------------------------ |
| `npm run dev`     | Start Vite dev server with HMR |
| `npm run build`   | Production build               |
| `npm run preview` | Serve production build locally |
| `npm test`        | Run Vitest in watch mode       |
| `npm run test:ci` | Single run with coverage       |
| `npm run prepush` | Typecheck + lint + format      |

## Architecture

### Data flow

```
WebSocket
  → OrderBookSocket (reconnect, exponential backoff)
    → RAF batch (queues messages, flushes once per animation frame)
      → Zod safeParse (validate/discard malformed)
        → bookRef (mutable Map, apply snapshot/delta with sequence tracking)
          → time-based throttle (setInterval flush, configurable 0–1000ms)
            → queryClient.setQueryData()
              → useQuery({ select }) derived hooks
                → Component
```

### Key decisions

- **OrderBookSocket class** — Encapsulates WebSocket lifecycle: auto-reconnect with exponential backoff (capped at 30s), RAF-batched message dispatch, Zod validation at the boundary. Pure TypeScript, no React dependency.
- **React Query as single state layer** — The order book is server-owned data with no application-level state. React Query holds the materialised book in its cache. Derived views (sorted bids, spread, totals) use `select` transforms with structural sharing.
- **Two-tier throttle** — RAF batching (socket layer) coalesces raw WebSocket messages. Time-based throttle (hook layer) controls React render frequency. Deltas always apply to a mutable ref immediately — no data loss, just fewer renders.
- **`Map<number, number>` for the book** — Deltas update individual price levels. Map gives O(1) updates; sorting is deferred to the render boundary via `select`.
- **Compositor-only CSS** — Depth bars use `transform: scaleX()` instead of width to avoid triggering layout/paint. Update flashes use opacity. Both run on the GPU compositor thread.

### Project structure

```
src/
  schemas/        # Zod schemas — single source of truth for types
  lib/            # Pure TS — OrderBookData, apply functions, socket (no React)
  hooks/          # React Query subscription + select-based derived hooks
  components/     # React components — OrderBookPanel, PriceRow, SpreadRow
  components/ui/  # shadcn/ui primitives — Card, Badge, ToggleGroup
  styles/         # CSS — depth bar transforms, flash animations
```

## Tech Stack

- React 19 + TypeScript
- Vite 7 (bundler)
- TanStack React Query (server state)
- Zod v4 (runtime validation)
- Tailwind CSS v4 + shadcn/ui (styling)
- Vitest (tests)

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

- Outlier asks (above `OUTLIER_THRESHOLD`) are filtered during selection, keeping the raw cache faithful to server data.
- `depthRatio` (cumulative size / max cumulative size) is computed per-level so components receive a 0–1 value ready for depth bar rendering without any local calculation.

### Negative prices as directional encoding

The WebSocket server sends some bid price levels as negative numbers (e.g. `[-121.26, 175.22]`). Analysis of the data shows these are not invalid — they receive active delta updates (size changes, additions, removals) just like positive-price levels.

We interpret the sign as a **directional encoding** for the perpetual futures market:

- **Positive price** = long-side liquidity (standard bid to open a long position)
- **Negative price** = short-side liquidity (bid to buy-to-close a short position)

The actual price level is `Math.abs(price)` in both cases. Normalization happens at the ingest boundary (`applyLevels` in `src/lib/orderbook.ts`) so the rest of the stack — Maps, selectors, components — only ever sees positive prices. This is a single code path shared by both `buildBookFromSnapshot` and `applyDelta`.

Without server documentation this is our best interpretation of the data. If the encoding turns out to mean something different, the fix is isolated to `applyLevels`.

**Connection state via local `useState`:** `useOrderBookSubscription` tracks `status` (`'connecting' | 'connected' | 'disconnected'`) and `retryCount` via local `useState`, driven by `OrderBookSocket`'s `onConnectionChange` callback. This keeps connection awareness in React state without coupling it to the react-query cache.

## Performance

### RAF-batched message processing

WebSocket deltas arrive at high frequency. Rather than triggering a React render per message, `OrderBookSocket` queues incoming messages and flushes the entire batch once per animation frame via `requestAnimationFrame`. A guard (`if (this.rafId != null) return`) prevents duplicate scheduling, so at most one flush runs per frame regardless of message volume.

### Fixed-position keys to prevent reflows

`PriceTable` keys rows by array index (`key={i}`) rather than by price. Because the level arrays are always padded to `MAX_DISPLAY_LEVELS`, each index maps to a stable DOM node. React updates props in place instead of unmounting/remounting rows when prices shift, eliminating layout reflows from changing DOM order.

### `useDeferredValue` for render priority

`PriceTable` wraps its `levels` prop in `useDeferredValue`, allowing React to defer re-rendering the price grid during bursts of rapid cache updates and keep higher-priority interactions responsive.

### Compositor-only depth bars

Depth visualization uses `transform: scaleX(var(--depth))` on absolutely-positioned pseudo-elements with `will-change: transform`. This confines updates to the compositor thread — no layout or paint — so 40 depth bars can update simultaneously without main-thread cost.

### `React.memo` with primitive props

`PriceRow` is wrapped in `React.memo`. All props are primitives (numbers, strings), making shallow comparison cheap and skipping re-renders for unchanged rows.

### Structural sharing via `select`

Derived hooks (`useSortedBids`, `useSortedAsks`, `useSpread`, `useTotalSizes`) use React Query's `select` option. Structural sharing means a component only re-renders when its derived slice actually changes — not on every cache write.
