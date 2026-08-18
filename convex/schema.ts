import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    hostPlayerId: v.string(),
    status: v.union(v.literal("waiting"), v.literal("playing"), v.literal("awaitingDraw"), v.literal("roundComplete"), v.literal("gameComplete")),
    revision: v.number(),
    gameState: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_code", ["code"]),
  seats: defineTable({
    roomId: v.id("rooms"),
    playerId: v.string(),
    name: v.string(),
    token: v.string(),
    joinedAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_token", ["roomId", "token"]),
});
