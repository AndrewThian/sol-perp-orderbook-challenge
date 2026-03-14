import { z } from 'zod';

// A single price level: [price, size]
export const PriceLevelSchema = z.tuple([z.number(), z.number()]);
export type PriceLevel = z.infer<typeof PriceLevelSchema>;

// Snapshot — full state of the book
export const SnapshotMessageSchema = z.object({
    type: z.literal('snapshot'),
    symbol: z.string(),
    timestamp: z.number(),
    sequence: z.number().int(),
    bids: z.array(PriceLevelSchema),
    asks: z.array(PriceLevelSchema),
});
export type SnapshotMessage = z.infer<typeof SnapshotMessageSchema>;

// Delta — incremental update
export const DeltaMessageSchema = z.object({
    type: z.literal('delta'),
    symbol: z.string(),
    timestamp: z.number(),
    sequence: z.number().int(),
    bids: z.array(PriceLevelSchema),
    asks: z.array(PriceLevelSchema),
});
export type DeltaMessage = z.infer<typeof DeltaMessageSchema>;

// Discriminated union for parsing any server message
// We're using discriminated union here for zod O(1) check on the type attribute
export const ServerMessageSchema = z.discriminatedUnion('type', [
    SnapshotMessageSchema,
    DeltaMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;