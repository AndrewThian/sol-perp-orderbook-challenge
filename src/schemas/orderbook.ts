import { z } from 'zod'

export const PriceLevelSchema = z.tuple([z.number(), z.number()])
export type PriceLevel = z.infer<typeof PriceLevelSchema>

export const SnapshotMessageSchema = z.object({
  type: z.literal('snapshot'),
  symbol: z.string(),
  timestamp: z.number(),
  sequence: z.number().int(),
  bids: z.array(PriceLevelSchema),
  asks: z.array(PriceLevelSchema),
})
export type SnapshotMessage = z.infer<typeof SnapshotMessageSchema>

export const DeltaMessageSchema = z.object({
  type: z.literal('delta'),
  symbol: z.string(),
  timestamp: z.number(),
  sequence: z.number().int(),
  // the websocket may provide one side of ask/bid pair only.
  bids: z.array(PriceLevelSchema).default([]),
  asks: z.array(PriceLevelSchema).default([]),
})
export type DeltaMessage = z.infer<typeof DeltaMessageSchema>

// zod discriminatedUnion gives O(1) dispatch on the type field
export const ServerMessageSchema = z.discriminatedUnion('type', [
  SnapshotMessageSchema,
  DeltaMessageSchema,
])
export type ServerMessage = z.infer<typeof ServerMessageSchema>
