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

describe("room leaving", () => {
  it("removes a lobby seat and transfers hosting", async () => {
    const t = await roomWithGuest();
    await t.mutation(api.rooms.leave, { code: "AB12CD", seatToken: hostToken });
    const view = await t.query(api.rooms.view, { code: "AB12CD", seatToken: guestToken });
    expect(view.kind).toBe("lobby");
    expect(view.hostPlayerId).toBe("player-2");
    expect(view.players).toEqual([{ id: "player-2", name: "Bob" }]);
  });

  it("reuses an available player number without colliding after the host leaves", async () => {
    const t = await roomWithGuest();
    await t.mutation(api.rooms.leave, { code: "AB12CD", seatToken: hostToken });
    const result = await t.mutation(api.rooms.join, {
      code: "AB12CD", playerName: "Cara", seatToken: "cara-seat-token-123456789012",
    });
    expect(result.playerId).toBe("player-1");
    const view = await t.query(api.rooms.view, { code: "AB12CD", seatToken: guestToken });
    expect(view.kind).toBe("lobby");
    if (view.kind !== "lobby") throw new Error("Expected a lobby view.");
    expect(view.players.map((player) => player.id)).toEqual(["player-2", "player-1"]);
  });

  it("ends a two-player game by walkover when one player leaves", async () => {
    const t = await roomWithGuest();
    await t.mutation(api.rooms.start, { code: "AB12CD", seatToken: hostToken });
    await t.mutation(api.rooms.leave, { code: "AB12CD", seatToken: guestToken });
    const view = await t.query(api.rooms.view, { code: "AB12CD", seatToken: hostToken });
    expect(view.kind).toBe("game");
    if (view.kind !== "game") throw new Error("Expected a game view.");
    expect(view.status).toBe("gameComplete");
    expect(view.completionReason).toBe("walkover");
    expect(view.winnerIds).toEqual(["player-1"]);
    expect(view.lastEvent?.message).toBe("Bob left the table.");
  });
});
