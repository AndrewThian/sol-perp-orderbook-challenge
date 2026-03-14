# ADR-001: Real-Time Order Book — Architecture & Implementation

**Status:** Accepted
**Date:** 2026-03-14
**Authors:** Engineering
**Scope:** Frontend take-home — SOL-PERP Order Book

---

## 1. Context

We need to build a performant, real-time order book UI that consumes streaming price data from a WebSocket server at `wss://orderbook-ws-server.opennext-test.workers.dev/ws`. The order book must display bids, asks, spread, and total sizes for the SOL-PERP instrument. Data arrives as an initial snapshot followed by incremental deltas, each tagged with a monotonically increasing `sequence` number.

### 1.1 Data Shape Observations

A sample snapshot reveals several characteristics that directly inform architecture decisions:

- **Negative bid prices exist** (e.g. `-438.40`, `-439.32`). These are almost certainly test/fuzz data or far-out-of-the-money synthetic levels. The UI must either filter or gracefully handle them.
- **Ask prices contain an extreme gap** — the first 28 levels sit in the `167–172` range, then jump to `715+`. This suggests outlier levels that a production book would typically truncate.
- **Floating-point noise** — prices like `113.57000000000001` and `716.5500000000001` confirm IEEE 754 artifacts. All price display must round/format to a fixed precision (2 decimal places for SOL-PERP).
- **Entries are `[price, size]` tuples** where `size = 0` means removal.
- **Sequence numbers** enforce causal ordering; we must discard any delta with `sequence ≤ lastAppliedSequence`.

### 1.2 Requirements Summary

| Requirement                               | Priority |
| ----------------------------------------- | -------- |
| Display bids and asks with price and size | P0       |
| Show the spread (best ask − best bid)     | P0       |
| Show total size on each side              | P0       |
| Performance under high-frequency updates  | P0       |
| Resilience (reconnection, sequence gaps)  | P1       |
| Clean separation of data and UI layers    | P1       |

---

## 2. Technology Choices

| Concern                               | Choice                             | Rationale                                                                                                                                        |
| ------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bundler**                           | Vite 7                             | Fast HMR, native ESM, TailwindCSS 4 plugin support                                                                                               |
| **UI**                                | React 19                           | Concurrent rendering primitives (`useDeferredValue`, `startTransition`) are ideal for high-frequency data                                        |
| **Server state + derived views**      | React Query (TanStack Query v5)    | Manages WebSocket lifecycle, holds the materialised book as query data, and supports `select` for derived views — no separate state layer needed |
| **Runtime + compile-time validation** | Zod 4                              | Single schema source of truth for TS types and runtime parsing of untrusted WebSocket payloads                                                   |
| **Styling**                           | TailwindCSS 4 + custom CSS         | Utility classes for layout, custom CSS for depth bar transforms and animations                                                                   |
| **Testing**                           | Vitest 4.1 + React Testing Library | Vite-native, same transform pipeline, fast watch mode                                                                                            |

---

## 3. Decision: Data Layer Architecture

### 3.1 Zod Schemas — Single Source of Truth

All WebSocket messages are validated at the boundary before entering the application. This prevents malformed data from corrupting state.

**Location:** `src/schemas/orderbook.ts`

```
schemas/
  orderbook.ts
    ├── PriceLevelSchema        z.tuple([z.number(), z.number()])
    ├── SnapshotMessageSchema   z.object({ type: z.literal("snapshot"), symbol, timestamp, sequence, bids, asks })
    ├── DeltaMessageSchema      z.object({ type: z.literal("delta"), symbol, timestamp, sequence, bids, asks })
    └── ServerMessageSchema     z.discriminatedUnion("type", [SnapshotMessageSchema, DeltaMessageSchema])
```

**Decision:** Use `z.discriminatedUnion` on the `type` field so parsing is O(1) dispatch rather than try-each. Infer TypeScript types with `z.infer<typeof Schema>` — no manual interface duplication.

**Decision:** Parse with `.safeParse()`, not `.parse()`. On failure, log and discard the message rather than throwing into the WebSocket `onmessage` handler.

**Implementation note:** `DeltaMessageSchema` defaults `bids` and `asks` to `[]` via `.default([])`, allowing deltas that only update one side.

**Coverage:** 100% statement coverage — 18 tests covering parse/reject cases for all schemas.

### 3.2 React Query as the Single State Layer

**Decision: No Zustand. React Query owns both the WebSocket lifecycle and the materialised book.**

Rationale: There is no application-level state here — the order book is purely server-owned data. Introducing Zustand would create a second source of truth that must be kept in sync with the query cache, adding indirection with no benefit. React Query already provides everything we need: cache storage, `select` for derived views, `structuralSharing` for re-render avoidance, lifecycle states, retry, and devtools.

The architecture collapses to:

```
WebSocket → queryClient.setQueryData() → useQuery({ select }) → Component
```

#### Query Data Shape

**Location:** `src/lib/orderbook.ts`

The query cache holds the materialised book as a plain object with `Map` semantics:

```typescript
interface OrderBookData {
  bids: Map<number, number> // price → size
  asks: Map<number, number> // price → size
  sequence: number
  symbol: string
  lastUpdated: number
}
```

**Decision: Use `Map<number, number>` instead of a sorted array.**

Deltas update individual price levels. With an array, every update requires a binary search + splice — O(log n + n). With a Map, updates are O(1). Sorting is deferred to `select` transforms at the render boundary.

#### WebSocket → Query Cache Flow

**Location:** `src/hooks/useOrderBookSubscription.ts`

**Implementation decision: Cache-only store pattern (useEffect, not queryFn).**

Unlike the original ADR draft which proposed embedding WebSocket in `queryFn`, the implementation uses a dedicated `OrderBookSocket` class (`src/lib/orderbook-socket.ts`) managed via `useEffect`. This separation provides:

- Cleaner teardown via `socket.dispose()`
- Class-based reconnection with exponential backoff
- Connection status tracking via local `useState`
- `useQuery` runs with `enabled: false` — it serves only as a reactive read lens

```typescript
// Actual implementation pattern
const QUERY_KEY = ['orderbook', 'SOL-PERP'] as const

// useEffect creates OrderBookSocket, pushes data via setQueryData
// useQuery({ enabled: false }) provides reactive reads only
```

#### Delta Application

**Location:** `src/lib/orderbook.ts`

The `applyDelta` function returns a discriminated result:

```typescript
type DeltaResult =
  | { status: 'applied'; book: OrderBookData }
  | { status: 'stale' }
  | { status: 'gap' }
```

- Creates new `Map` instances on each update (immutable for React Query change detection)
- Size `0` entries are deleted from the map
- Gap detection triggers `socket.reconnect()` in the subscription hook

**Coverage:** 100% statement coverage — 11 tests covering snapshot building, delta application, gap detection, stale detection, and immutability.

#### Derived Views via `select`

**Location:** `src/hooks/useOrderBook.ts`

Components consume derived slices through `useQuery` with a `select` function. React Query's `structuralSharing` ensures that if the `select` output is referentially equal (e.g. a delta touched an off-screen level), the component does not re-render.

**Exported pure functions (testable without React):**

```typescript
selectSortedBids(data) // Filters price > 0, sorts desc, caps at 20, adds cumulative depth
selectSortedAsks(data) // Filters price < OUTLIER_THRESHOLD, sorts asc, caps at 20, adds cumulative depth
selectSpread(data) // Returns {absolute, percentage, bestBid, bestAsk}
selectTotalSizes(data) // Sums all bid/ask sizes (raw, including filtered-out entries)
```

**Display type returned by bid/ask selectors:**

```typescript
interface DisplayLevel {
  price: number
  size: number
  total: number // cumulative size
  depthRatio: number // 0–1, for depth bar visualization
}
```

Results are padded to `MAX_DISPLAY_LEVELS` (20) with empty entries to maintain consistent table height.

**Decision: Filter anomalous data in `select`, not on ingest.**

The query cache stores raw server state. Display-time filters (negative prices, outlier asks) live in `select` transforms. This keeps the cache a faithful mirror of the server and avoids data loss if heuristics are wrong.

**Coverage:** 88.23% statement coverage — 56 tests covering sorting, filtering, padding, edge cases, cumulative depth, and spread calculation.

#### Reconnection Strategy

**Location:** `src/lib/orderbook-socket.ts`

| Event                 | Action                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `onclose` / `onerror` | `OrderBookSocket` schedules reconnect with exponential backoff (1s → 2s → 4s… capped at 30s) |
| Sequence gap detected | `socket.reconnect()` called from subscription hook → fresh snapshot                          |
| `dispose()` called    | Handlers nulled, timers cancelled, no further reconnections                                  |

**Coverage:** 94.87% statement coverage — 18 tests covering connection, subscribe, parsing, backoff, reconnect, and dispose.

### 3.3 Sequence Enforcement

Sequence logic lives inside `applyDelta` (`src/lib/orderbook.ts`). Three cases:

1. **`delta.sequence <= prev.sequence`** — Stale. Return `{ status: 'stale' }` (no state change).
2. **`delta.sequence === prev.sequence + 1`** — Expected. Apply mutations, return `{ status: 'applied', book }`.
3. **`delta.sequence > prev.sequence + 1`** — Gap. Return `{ status: 'gap' }`. Subscription hook closes socket to trigger reconnect.

---

## 4. Decision: UI Layer Architecture

### 4.1 Component Tree

```
<App>                                    src/App.tsx
  <QueryClientProvider>                  src/main.tsx
    <ConnectionStatus />                 src/components/ConnectionStatus.tsx
    <Column Headers />                   inline in App.tsx
    <AsksSection />                      useSortedAsks() → reversed display
      <PriceRow />[]                     src/components/PriceRow.tsx (memoized)
    <SpreadRow />                        src/components/SpreadRow.tsx
    <BidsSection />                      useSortedBids()
      <PriceRow />[]                     src/components/PriceRow.tsx (memoized)
  </QueryClientProvider>
</App>
```

### 4.2 Rendering Performance

**Mitigations (implemented):**

1. **React Query `select` with structural sharing** — Each component subscribes via `useQuery({ select })`. A delta that touches an off-screen price level produces no render for the `useSortedBids` consumer.

2. **`React.memo` on `PriceRow`** — Each `<PriceRow price={p} size={s} total={t} depthRatio={d} side={s} />` is memoised. Primitive props enable cheap shallow comparison.

3. **Compositor-only CSS for depth visualisation** — `transform: scaleX(var(--depth))` skips layout and paint entirely.

### 4.3 Display Formatting

| Field              | Format                                               | Notes                      |
| ------------------ | ---------------------------------------------------- | -------------------------- |
| Price              | `toFixed(2)`                                         | Rounds away IEEE 754 noise |
| Size               | `toFixed(2)`                                         | Consistent decimal places  |
| Total (cumulative) | `toFixed(2)`                                         | Per-row cumulative size    |
| Spread             | `${absolute.toFixed(2)} (${percentage.toFixed(2)}%)` | Both absolute and relative |

### 4.4 Depth Visualisation — Compositor-Only CSS

**Location:** `src/styles/orderbook.css`

**Decision: Use `transform: scaleX()` instead of `width` for depth bars.**

| Property              | Layout | Paint | Composite | Used for        |
| --------------------- | ------ | ----- | --------- | --------------- |
| `width`               | yes    | yes   | yes       | Avoid           |
| `transform: scaleX()` | no     | no    | yes       | Depth bars      |
| `opacity`             | no     | no    | yes       | Flash on update |

**Implementation:**

Each row sets a CSS custom property `--depth` (0–1). A pseudo-element-like `<div>` scales horizontally:

```css
.depth-bar {
  position: absolute;
  inset: 0;
  transform-origin: right; /* bids: grow from right to left */
  transform: scaleX(var(--depth));
  will-change: transform;
}
```

```tsx
// PriceRow.tsx
<div
  className="price-row"
  style={{ '--depth': depthRatio } as React.CSSProperties}
>
  <div className={`depth-bar depth-bar--${side}`} />
  ...
</div>
```

**Flash animation defined but not yet wired:**

```css
@keyframes row-flash {
  from {
    opacity: 0.5;
  }
  to {
    opacity: 1;
  }
}
```

The `row-flash` animation is defined in CSS but not yet applied to `PriceRow` on updates. This is a future enhancement.

---

## 5. Decision: Project Structure

```
sol-perp-orderbook-challenge/
├── public/
├── src/
│   ├── schemas/
│   │   ├── orderbook.ts              # Zod schemas + inferred types
│   │   └── __tests__/
│   │       └── orderbook.spec.ts     # 18 tests — parse/reject validation
│   ├── lib/
│   │   ├── orderbook.ts              # OrderBookData type, buildBookFromSnapshot, applyDelta
│   │   ├── orderbook-socket.ts       # WebSocket wrapper with reconnection logic
│   │   ├── utils.ts                  # Utility functions
│   │   └── __tests__/
│   │       ├── orderbook.spec.ts     # 11 tests — snapshot, delta, sequence
│   │       └── orderbook-socket.spec.ts # 18 tests — connect, backoff, dispose
│   ├── hooks/
│   │   ├── useOrderBookSubscription.ts  # WebSocket lifecycle + setQueryData
│   │   ├── useOrderBook.ts           # select-based hooks: useSortedBids, useSpread, etc.
│   │   └── __tests__/
│   │       └── useOrderBook.spec.ts  # 56 tests — sorting, filtering, depth, spread
│   ├── components/
│   │   ├── PriceRow.tsx              # Memoised row with CSS transform depth bar
│   │   ├── SpreadRow.tsx             # Spread display component
│   │   ├── ConnectionStatus.tsx      # WebSocket connection indicator
│   │   └── __tests__/
│   │       ├── PriceRow.spec.tsx     # 8 tests — formatting, CSS, memo
│   │       └── SpreadRow.spec.tsx    # 8 tests — rendering, formatting
│   ├── sample/                       # Sample WebSocket data for testing
│   │   ├── snapshot.json
│   │   └── delta-{1..5}.json
│   ├── styles/
│   │   └── orderbook.css             # Depth bar transforms, flash animations
│   ├── constants.ts                  # MAX_DISPLAY_LEVELS, WS_URL, OUTLIER_THRESHOLD
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   └── test-setup.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.test.json
├── eslint.config.js
├── package.json
└── ADR.md                            # This document
```

**Key principle:** `schemas/` and `lib/` have zero React imports — they're pure TypeScript modules testable without `jsdom`. The `select` functions in `hooks/useOrderBook.ts` are exported as standalone pure functions too, enabling direct unit testing without React Query overhead.

---

## 6. Decision: Testing Strategy

### 6.1 Current Coverage

**82 tests passing — 74.4% statement coverage overall**

| Layer      | File                                | Statements | Tests | Status                 |
| ---------- | ----------------------------------- | ---------- | ----- | ---------------------- |
| Schemas    | `schemas/orderbook.ts`              | 100%       | 18    | Complete               |
| Lib        | `lib/orderbook.ts`                  | 100%       | 11    | Complete               |
| Lib        | `lib/orderbook-socket.ts`           | 94.87%     | 18    | Near-complete          |
| Hooks      | `hooks/useOrderBook.ts`             | 88.23%     | 56    | Padding logic untested |
| Hooks      | `hooks/useOrderBookSubscription.ts` | 3.7%       | 0     | Not tested             |
| Components | `components/PriceRow.tsx`           | 100%       | 8     | Complete               |
| Components | `components/SpreadRow.tsx`          | 100%       | 8     | Complete               |

### 6.2 Unit Tests (Vitest)

| Layer                    | What we test                                                                                                                                         | How                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **Schemas**              | Valid snapshot parses, valid delta parses, rejects malformed payloads, rejects missing fields                                                        | `safeParse` assertions                        |
| **lib/orderbook**        | `buildBookFromSnapshot` builds maps correctly, `applyDelta` updates/removes levels, stale sequence returns prev, gap detection                       | Direct function calls with sample JSON data   |
| **lib/orderbook-socket** | Connection, subscribe, message parsing, exponential backoff, reconnect, dispose                                                                      | MockWebSocket + fake timers                   |
| **select functions**     | Sorted output order, negative price filtering, outlier filtering, spread calculation, total size summation, depth ratios, cumulative totals, padding | Pure function calls with mock `OrderBookData` |
| **Components**           | Formatting, CSS classes, CSS custom properties, memo behavior                                                                                        | React Testing Library                         |

### 6.3 Coverage Gaps

- **`useOrderBookSubscription`** (3.7%) — React hook with WebSocket side effects. Hardest to unit test; would benefit from integration tests.
- **Padding logic** in `useOrderBook.ts` (lines 84–96) — Array fill operation for empty rows.

### 6.4 What We Skip (2-hour scope)

- E2E tests against the real WebSocket server
- Visual regression
- Performance benchmarking

---

## 7. Decision: Resilience Patterns

| Failure Mode             | Detection                                  | Recovery                                                      |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------- |
| **WebSocket disconnect** | `onclose` / `onerror` events               | `OrderBookSocket` exponential backoff reconnection            |
| **Sequence gap**         | `applyDelta` returns `{ status: 'gap' }`   | Subscription hook calls `socket.reconnect()` → fresh snapshot |
| **Malformed message**    | Zod `safeParse` failure                    | Log warning, discard message, continue                        |
| **Stale delta**          | `applyDelta` returns `{ status: 'stale' }` | No state change, no re-render                                 |

---

## 8. Implementation Deviations from Original ADR Draft

| Area                    | Original ADR                                   | Actual Implementation                                          | Rationale                                                                     |
| ----------------------- | ---------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **WebSocket lifecycle** | Embedded in `queryFn` promise                  | `OrderBookSocket` class in `useEffect`                         | Cleaner teardown, testable class, explicit connection status tracking         |
| **Reconnection**        | `queryFn` rejection triggers React Query retry | `OrderBookSocket` internal exponential backoff                 | Self-contained reconnection logic, no reliance on React Query retry semantics |
| **Connection status**   | Derived from React Query `isLoading`/`isError` | Local `useState` in subscription hook                          | More granular control (connecting/connected/disconnected)                     |
| **`useQuery` role**     | Active fetcher (`enabled: true`)               | Passive reader (`enabled: false`)                              | Cache-only store pattern — WebSocket pushes, query reads                      |
| **Delta application**   | Inline in `setQueryData` callback              | Extracted `applyDelta` function returning discriminated result | Testable pure function, clearer gap/stale handling                            |
| **React version**       | React 18+                                      | React 19                                                       | Latest stable at time of implementation                                       |
| **TanStack Query**      | v4 (implied)                                   | v5                                                             | Latest stable                                                                 |
| **Zod**                 | v3 (implied)                                   | v4                                                             | Latest stable                                                                 |
| **Row flash animation** | Described as implemented                       | CSS defined, not yet wired                                     | Deferred — depth bars are implemented                                         |
| **Total sizes display** | Footer component                               | Not yet rendered in App.tsx                                    | Hook exists, UI pending                                                       |
| **Header component**    | Dedicated `<Header />`                         | Inline column headers in App.tsx                               | Simpler for current scope                                                     |

---

## 9. Remaining Work

| Item                                           | Priority | Status                             |
| ---------------------------------------------- | -------- | ---------------------------------- |
| Wire `useTotalSizes()` into UI (footer)        | P1       | Hook ready, component needed       |
| Wire row flash animation on price changes      | P2       | CSS ready, component wiring needed |
| Test `useOrderBookSubscription`                | P2       | Integration test with mock socket  |
| Remove debug `bifurcate` function from App.tsx | P1       | Cleanup                            |
| Consider `useDeferredValue` for table data     | P2       | Done                               |
| RAF-based delta batching                       | P3       | Only if profiling shows need       |

---

## 10. Running the Application

```bash
# Install
npm install

# Development
npm run dev          # Vite dev server on http://localhost:5173

# Test
npm run test         # Vitest in watch mode
npm run test:ci      # Single run with coverage

# Pre-push checks
npm run prepush      # Type check + lint + format

# Build
npm run build        # Production build to dist/
npm run preview      # Preview production build
```

---

## 11. Summary of Key Architectural Decisions

| #   | Decision                                  | Alternative Considered            | Why We Chose This                                                                                                                  |
| --- | ----------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Map<number, number>` for book state      | Sorted array                      | O(1) updates vs O(n) splice; sort only at render boundary                                                                          |
| 2   | Zod at the WebSocket boundary             | Manual type guards                | Single source for types + runtime validation; discriminated union is clean                                                         |
| 3   | React Query as single state layer         | React Query + Zustand             | No app-level state exists; Zustand would duplicate server-owned data. `select` + `setQueryData` covers derived views and mutations |
| 4   | `select` for derived views                | `useMemo` in components           | Structural sharing built-in; pure functions are testable without React; co-located with query key                                  |
| 5   | Filter anomalies in `select`              | Filter on ingest                  | Preserves raw server state; display logic stays in the view layer                                                                  |
| 6   | `transform: scaleX()` depth bars          | `width` percentage                | Compositor-only — skips layout and paint; 40 simultaneous bar updates at zero main-thread cost                                     |
| 7   | Cache-only store (`enabled: false`)       | `queryFn`-based WebSocket         | Cleaner lifecycle management; WebSocket pushes data, query reads it                                                                |
| 8   | `OrderBookSocket` class                   | Inline WebSocket in hook          | Testable, encapsulated reconnection logic with exponential backoff                                                                 |
| 9   | `applyDelta` returns discriminated result | Inline mutation in `setQueryData` | Testable pure function; explicit gap/stale handling                                                                                |
