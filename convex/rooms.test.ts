/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const hostToken = "host-seat-token-123456789012";
const guestToken = "guest-seat-token-12345678901";

async function roomWithGuest(code = "AB12CD") {
  const t = convexTest(schema, modules);
  await t.mutation(api.rooms.create, {
    code, playerName: "Alice", seatToken: hostToken, discardVisibility: "public",
  });
  await t.mutation(api.rooms.join, {
    code, playerName: "Bob", seatToken: guestToken,
  });
  return t;
}

describe("voice seat authorization", () => {
  it("returns only the authoritative room, player ID, and display name for a valid member", async () => {
    const t = await roomWithGuest();
    await expect(t.query(api.rooms.voiceIdentity, { code: "ab12cd", seatToken: guestToken }))
      .resolves.toEqual({ roomCode: "AB12CD", playerId: "player-2", playerName: "Bob" });
  });

  it("rejects an invalid or guessed seat token", async () => {
    const t = await roomWithGuest();
    await expect(t.query(api.rooms.voiceIdentity, {
      code: "AB12CD", seatToken: "guessed-seat-token-123456789",
    })).rejects.toThrow("does not hold a seat");
  });

  it("rejects a valid seat token when paired with another room", async () => {
    const t = await roomWithGuest();
    await t.mutation(api.rooms.create, {
      code: "ZZ99ZZ", playerName: "Cara", seatToken: "cara-seat-token-123456789012", discardVisibility: "public",
    });
    await expect(t.query(api.rooms.voiceIdentity, { code: "ZZ99ZZ", seatToken: guestToken }))
      .rejects.toThrow("does not hold a seat");
  });

  it("rejects a missing room", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.rooms.voiceIdentity, { code: "NO12RM", seatToken: hostToken }))
      .rejects.toThrow("Room not found");
  });
});
