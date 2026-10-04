/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { PLAYER_IDS, teamForPlayer, type Card, type DehlaGameState, type PlayerId, type Suit, type Team } from "../src/games/dehla-pakad/engine/types";
import { createDeck } from "../src/games/dehla-pakad/engine/deck";

const modules = import.meta.glob("./**/*.ts");
const tokens = [
  "dehla-seat-token-player-one-123456",
  "dehla-seat-token-player-two-123456",
  "dehla-seat-token-player-three-1234",
  "dehla-seat-token-player-four-12345",
];

type TestPlayer = { id: string; cardCount: number; hand?: Array<{ id: string; suit?: Suit; rank?: number }> };
type TestGameView = {
  kind: "game"; dealer: string; revision: number; viewerPlayerId: string; currentPlayerId: string | null; players: TestPlayer[];
  phase: DehlaGameState["phase"]; roundAttempt: number; currentTrick: DehlaGameState["currentTrick"];
  hukum: Suit | null; pendingLotCount: number;
  pendingLotHands: Array<{
    handNumber: number; winner: PlayerId | null; winningTeam: Team | null;
    plays: Array<{ playerId: PlayerId | null; card: Card }>;
  }>;
  streakPlayer: PlayerId | null; streakCount: number;
  captured: { A: { cardCount: number }; B: { cardCount: number } };
  history: unknown[];
};
type TestHarness = TestConvex<typeof schema>;

function asGame(view: unknown): TestGameView {
  if (!view || typeof view !== "object" || (view as { kind?: string }).kind !== "game") throw new Error("Expected a game view.");
  return view as TestGameView;
}

async function startedRoom() {
  const t = convexTest(schema, modules);
  await t.mutation(api.dehlaRooms.create, { code: "DEH123", playerName: "Asha", seatToken: tokens[0] });
  await t.mutation(api.dehlaRooms.join, { code: "DEH123", playerName: "Bina", seatToken: tokens[1] });
  await t.mutation(api.dehlaRooms.join, { code: "DEH123", playerName: "Chet", seatToken: tokens[2] });
  await t.mutation(api.dehlaRooms.join, { code: "DEH123", playerName: "Dev", seatToken: tokens[3] });
  await t.mutation(api.dehlaRooms.start, { code: "DEH123", seatToken: tokens[0] });
  const initial = asGame(await t.query(api.dehlaRooms.view, { code: "DEH123", seatToken: tokens[0] }));
  const dealerNumber = Number(initial.dealer.split("-")[1]);
  await t.mutation(api.dehlaRooms.deal, { code: "DEH123", seatToken: tokens[dealerNumber - 1], expectedRevision: initial.revision });
  return t;
}

async function roomWaitingForDeal(code = "WAIT12") {
  const t = convexTest(schema, modules);
  await t.mutation(api.dehlaRooms.create, { code, playerName: "Asha", seatToken: tokens[0] });
  for (let index = 1; index < 4; index += 1) await t.mutation(api.dehlaRooms.join, { code, playerName: `P${index + 1}`, seatToken: tokens[index] });
  await t.mutation(api.dehlaRooms.start, { code, seatToken: tokens[0] });
  return t;
}

async function patchGame(t: TestHarness, code: string, update: (state: DehlaGameState) => void) {
  await t.run(async (ctx) => {
    const room = await ctx.db.query("rooms").withIndex("by_code", (q) => q.eq("code", code)).unique();
    if (!room) throw new Error("Expected room fixture.");
    const game = await ctx.db.query("dehlaGames").withIndex("by_room", (q) => q.eq("roomId", room._id)).unique();
    if (!game) throw new Error("Expected game fixture.");
    const state = structuredClone(game.state) as DehlaGameState;
    update(state);
    await ctx.db.patch("dehlaGames", game._id, { state });
  });
}

function expectPrivateProjection(view: TestGameView, viewerId: PlayerId) {
  expect(view.viewerPlayerId).toBe(viewerId);
  for (const player of view.players) {
    expect(Object.hasOwn(player, "hand")).toBe(player.id === viewerId);
  }
}

describe("Dehla Pakad multiplayer privacy and replay safety", () => {
  it("restores the same lobby seat before the match starts", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.dehlaRooms.create, { code: "LOBB12", playerName: "Asha", seatToken: tokens[0] });
    await t.mutation(api.dehlaRooms.join, { code: "LOBB12", playerName: "Bina", seatToken: tokens[1] });
    const first = await t.query(api.dehlaRooms.view, { code: "LOBB12", seatToken: tokens[1] });
    const reconnected = await t.query(api.dehlaRooms.view, { code: "lobb12", seatToken: tokens[1] });
    expect(reconnected).toEqual(first);
    expect(reconnected).toMatchObject({ kind: "lobby", viewerPlayerId: "player-2" });
  });

  it("never includes opponents' hands in a player view", async () => {
    const t = await startedRoom();
    const view = asGame(await t.query(api.dehlaRooms.view, { code: "DEH123", seatToken: tokens[0] }));
    const viewer = view.players.find((player) => player.id === view.viewerPlayerId);
    expect(viewer?.hand).toHaveLength(5);
    for (const player of view.players.filter((candidate) => candidate.id !== view.viewerPlayerId)) {
      expect(Object.hasOwn(player, "hand")).toBe(false);
      expect(player.cardCount).toBe(5);
    }
    expect(Object.hasOwn(view, "undealt")).toBe(false);
  });

  it("projects all five public pending-lot hands to every seat, clears them, and starts fresh", async () => {
    const t = await startedRoom();
    const suits: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
    const publicHands = Array.from({ length: 5 }, (_, index) => {
      const handNumber = index + 2;
      const playOrder = PLAYER_IDS.map((_, offset) => PLAYER_IDS[(index + offset) % PLAYER_IDS.length]);
      const plays = playOrder.map((playerId, playIndex) => ({
        playerId,
        card: { id: `public-h${handNumber}-${playerId}`, suit: suits[playIndex], rank: (14 - playIndex) as Card["rank"] },
      }));
      const winner = plays[(index + 1) % plays.length].playerId;
      return { handNumber, plays, winner };
    });
    const pendingCards = publicHands.flatMap((hand) => hand.plays.map((play) => play.card));
    const privateIds: Record<PlayerId, string> = {
      "player-1": "private-player-1",
      "player-2": "private-player-2",
      "player-3": "private-player-3",
      "player-4": "private-player-4",
    };
    await patchGame(t, "DEH123", (state) => {
      state.phase = "roundPlay";
      state.handsCompleted = 6;
      state.pendingLot = pendingCards;
      state.pendingLotHands = publicHands;
      state.hands = {
        "player-1": [{ id: privateIds["player-1"], suit: "clubs", rank: 2 }],
        "player-2": [{ id: privateIds["player-2"], suit: "clubs", rank: 3 }],
        "player-3": [{ id: privateIds["player-3"], suit: "clubs", rank: 4 }],
        "player-4": [{ id: privateIds["player-4"], suit: "clubs", rank: 5 }],
      };
      state.undealt = [{ id: "private-undealt-order", suit: "diamonds", rank: 2 }];
    });

    const views = await Promise.all(tokens.map((seatToken) => t.query(api.dehlaRooms.view, { code: "DEH123", seatToken }).then(asGame)));
    const expectedHands = publicHands.map((hand) => ({ ...hand, winningTeam: teamForPlayer(hand.winner) }));
    for (const [index, view] of views.entries()) {
      expect(view.pendingLotCount).toBe(20);
      expect(view.pendingLotHands).toEqual(expectedHands);
      expect(view.pendingLotHands.map((hand) => hand.handNumber)).toEqual([2, 3, 4, 5, 6]);
      expect(view.pendingLotHands.flatMap((hand) => hand.plays.map((play) => play.card.id)))
        .toEqual(pendingCards.map((card) => card.id));
      expectPrivateProjection(view, `player-${index + 1}` as PlayerId);
      const serialized = JSON.stringify(view);
      for (const [playerId, privateId] of Object.entries(privateIds)) {
        expect(serialized.includes(privateId)).toBe(playerId === `player-${index + 1}`);
      }
      expect(serialized).not.toContain("private-undealt-order");
      expect(Object.hasOwn(view, "undealt")).toBe(false);
      expect(Object.hasOwn(view, "hands")).toBe(false);
      expect(Object.hasOwn(view, "nextDealerByTeam")).toBe(false);
    }

    await patchGame(t, "DEH123", (state) => {
      state.captured.A.push(...state.pendingLot);
      state.pendingLot = [];
      state.pendingLotHands = [];
      state.streakPlayer = null;
      state.streakCount = 0;
    });
    const cleared = await Promise.all(tokens.map((seatToken) => t.query(api.dehlaRooms.view, { code: "DEH123", seatToken }).then(asGame)));
    for (const view of cleared) {
      expect(view.pendingLotCount).toBe(0);
      expect(view.pendingLotHands).toEqual([]);
    }

    const freshPlays = PLAYER_IDS.map((playerId, index) => ({
      playerId,
      card: { id: `fresh-h7-${playerId}`, suit: suits[index], rank: (9 - index) as Card["rank"] },
    }));
    await patchGame(t, "DEH123", (state) => {
      state.handsCompleted = 7;
      state.pendingLot = freshPlays.map((play) => play.card);
      state.pendingLotHands = [{ handNumber: 7, plays: freshPlays, winner: "player-3" }];
    });
    const fresh = asGame(await t.query(api.dehlaRooms.view, { code: "DEH123", seatToken: tokens[0] }));
    expect(fresh.pendingLotCount).toBe(4);
    expect(fresh.pendingLotHands).toEqual([{ handNumber: 7, plays: freshPlays, winner: "player-3", winningTeam: "A" }]);
    expect(JSON.stringify(fresh)).not.toContain("public-h2-");
  });

  it("restores the same private view when the seat token reconnects", async () => {
    const t = await startedRoom();
    const first = asGame(await t.query(api.dehlaRooms.view, { code: "DEH123", seatToken: tokens[2] }));
    const reconnected = asGame(await t.query(api.dehlaRooms.view, { code: "deh123", seatToken: tokens[2] }));
    expect(reconnected.viewerPlayerId).toBe("player-3");
    expect(reconnected.players.find((player) => player.id === "player-3")?.hand)
      .toEqual(first.players.find((player) => player.id === "player-3")?.hand);
  });

  it("rejects a replayed deal at a stale revision", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.dehlaRooms.create, { code: "REV123", playerName: "Asha", seatToken: tokens[0] });
    for (let index = 1; index < 4; index += 1) await t.mutation(api.dehlaRooms.join, { code: "REV123", playerName: `P${index + 1}`, seatToken: tokens[index] });
    await t.mutation(api.dehlaRooms.start, { code: "REV123", seatToken: tokens[0] });
    const view = asGame(await t.query(api.dehlaRooms.view, { code: "REV123", seatToken: tokens[0] }));
    const dealerToken = tokens[Number(view.dealer.split("-")[1]) - 1];
    await t.mutation(api.dehlaRooms.deal, { code: "REV123", seatToken: dealerToken, expectedRevision: 0 });
    await expect(t.mutation(api.dehlaRooms.deal, { code: "REV123", seatToken: dealerToken, expectedRevision: 0 })).rejects.toThrow("Game state changed");
  });

  it("rejects a duplicated card action without corrupting state", async () => {
    const t = await startedRoom();
    const observer = asGame(await t.query(api.dehlaRooms.view, { code: "DEH123", seatToken: tokens[0] }));
    if (!observer.currentPlayerId) throw new Error("Expected a current player.");
    const actorNumber = Number(observer.currentPlayerId.split("-")[1]);
    const actorToken = tokens[actorNumber - 1];
    const actorView = asGame(await t.query(api.dehlaRooms.view, { code: "DEH123", seatToken: actorToken }));
    const actor = actorView.players.find((player) => player.id === actorView.viewerPlayerId);
    const cardId = actor?.hand?.[0].id;
    if (!cardId) throw new Error("Expected the current player to have a card.");
    await t.mutation(api.dehlaRooms.play, { code: "DEH123", seatToken: actorToken, expectedRevision: actorView.revision, cardId });
    await expect(t.mutation(api.dehlaRooms.play, { code: "DEH123", seatToken: actorToken, expectedRevision: actorView.revision, cardId })).rejects.toThrow("Game state changed");
    const after = asGame(await t.query(api.dehlaRooms.view, { code: "DEH123", seatToken: actorToken }));
    expect(after.players.find((player) => player.id === actorView.viewerPlayerId)?.cardCount).toBe(4);
  });

  it("cannot distribute the Hukum second deal twice on a replay", async () => {
    const t = await startedRoom();
    const before = asGame(await t.query(api.dehlaRooms.view, { code: "DEH123", seatToken: tokens[3] }));
    await patchGame(t, "DEH123", (state) => {
      state.phase = "playingForHukum";
      state.hands = { "player-1": [], "player-2": [], "player-3": [], "player-4": [{ id: "declare-club-2", suit: "clubs", rank: 2 }] };
      state.undealt = createDeck().slice(0, 32);
      state.currentPlayerId = "player-4";
      state.currentTrick = [
        { playerId: "player-1", card: { id: "declare-heart-a", suit: "hearts", rank: 14 } },
        { playerId: "player-2", card: { id: "declare-heart-k", suit: "hearts", rank: 13 } },
        { playerId: "player-3", card: { id: "declare-heart-q", suit: "hearts", rank: 12 } },
      ];
    });
    const action = { code: "DEH123", seatToken: tokens[3], expectedRevision: before.revision, cardId: "declare-club-2" };
    await t.mutation(api.dehlaRooms.play, action);
    await expect(t.mutation(api.dehlaRooms.play, action)).rejects.toThrow("Game state changed");
    const after = asGame(await t.query(api.dehlaRooms.view, { code: "DEH123", seatToken: tokens[3] }));
    expect(after.phase).toBe("roundPlay");
    expect(after.hukum).toBe("clubs");
    expect(after.players.map((player) => player.cardCount)).toEqual([8, 8, 8, 8]);
  });

  it("restores private projections throughout dealer, Hukum, trick, reset, and round-complete phases", async () => {
    const code = "PHAS12";
    const t = await roomWaitingForDeal(code);
    const reconnect = async (expectedPhase: DehlaGameState["phase"]) => {
      const first = asGame(await t.query(api.dehlaRooms.view, { code, seatToken: tokens[2] }));
      const second = asGame(await t.query(api.dehlaRooms.view, { code: code.toLowerCase(), seatToken: tokens[2] }));
      expect(first.phase).toBe(expectedPhase);
      expect(second).toEqual(first);
      expectPrivateProjection(second, "player-3");
      return second;
    };

    const waiting = await reconnect("awaitingInitialDeal");
    const dealerToken = tokens[Number(waiting.dealer.split("-")[1]) - 1];
    await t.mutation(api.dehlaRooms.deal, { code, seatToken: dealerToken, expectedRevision: waiting.revision });
    const finding = await reconnect("playingForHukum");

    if (!finding.currentPlayerId) throw new Error("Expected a current player while finding Hukum.");
    const actorToken = tokens[Number(finding.currentPlayerId.split("-")[1]) - 1];
    const actorView = asGame(await t.query(api.dehlaRooms.view, { code, seatToken: actorToken }));
    const actorCard = actorView.players.find((player) => player.id === actorView.viewerPlayerId)?.hand?.[0];
    if (!actorCard) throw new Error("Expected a card for the active player.");
    await t.mutation(api.dehlaRooms.play, { code, seatToken: actorToken, expectedRevision: actorView.revision, cardId: actorCard.id });
    const midTrick = await reconnect("playingForHukum");
    expect(midTrick.currentTrick).toHaveLength(1);

    await patchGame(t, code, (state) => {
      state.phase = "roundPlay";
      state.hukum = "clubs";
      state.hukumDeclarer = "player-2";
      state.hukumHandNumber = 1;
    });
    const established = await reconnect("roundPlay");
    expect(established.hukum).toBe("clubs");

    await patchGame(t, code, (state) => {
      state.pendingLot = [];
      state.captured.A = [{ id: "captured-after-lift", suit: "diamonds", rank: 10 }];
      state.streakPlayer = null;
      state.streakCount = 0;
    });
    const afterLotCapture = await reconnect("roundPlay");
    expect(afterLotCapture.captured.A.cardCount).toBe(1);

    await patchGame(t, code, (state) => {
      state.phase = "awaitingInitialDeal";
      state.roundAttempt = 1;
      state.hands = { "player-1": [], "player-2": [], "player-3": [], "player-4": [] };
      state.undealt = [];
      state.currentPlayerId = null;
      state.currentTrick = [];
      state.lastTrick = null;
      state.handsCompleted = 0;
      state.hukum = null;
      state.hukumDeclarer = null;
      state.hukumHandNumber = null;
      state.pendingLot = [];
      state.captured = { A: [], B: [] };
      state.streakPlayer = null;
      state.streakCount = 0;
    });
    const reset = await reconnect("awaitingInitialDeal");
    expect(reset.roundAttempt).toBe(1);

    await patchGame(t, code, (state) => {
      state.phase = "roundComplete";
      state.currentPlayerId = null;
      state.hukum = "spades";
      state.hukumDeclarer = "player-4";
      state.hukumHandNumber = 2;
    });
    await reconnect("roundComplete");
  });

  it("fully resets a no-Hukum attempt without creating round history", async () => {
    const t = await startedRoom();
    const before = asGame(await t.query(api.dehlaRooms.view, { code: "DEH123", seatToken: tokens[0] }));
    const standingsBefore = await t.run(async (ctx) => {
      const [game] = await ctx.db.query("dehlaGames").take(1);
      if (!game) throw new Error("Expected game fixture.");
      return structuredClone((game.state as DehlaGameState).standings);
    });
    await patchGame(t, "DEH123", (state) => {
      state.phase = "playingForHukum";
      state.handsCompleted = 4;
      state.currentPlayerId = "player-4";
      state.currentTrick = [
        { playerId: "player-1", card: { id: "reset-heart-a", suit: "hearts", rank: 14 } },
        { playerId: "player-2", card: { id: "reset-heart-k", suit: "hearts", rank: 13 } },
        { playerId: "player-3", card: { id: "reset-heart-q", suit: "hearts", rank: 12 } },
      ];
      state.hands["player-4"] = [{ id: "reset-heart-2", suit: "hearts", rank: 2 }];
      state.pendingLot = [{ id: "reset-pending", suit: "clubs", rank: 10 }];
      state.captured.A = [{ id: "reset-captured", suit: "diamonds", rank: 10 }];
      state.streakPlayer = "player-1";
      state.streakCount = 3;
      state.handsWon["player-1"] = 4;
      state.lotHistory = [{ handNumber: 2, playerId: "player-1", team: "A", cardCount: 8, reason: "streak" }];
    });
    await t.mutation(api.dehlaRooms.play, { code: "DEH123", seatToken: tokens[3], expectedRevision: before.revision, cardId: "reset-heart-2" });
    const after = asGame(await t.query(api.dehlaRooms.view, { code: "DEH123", seatToken: tokens[3] }));
    expect(after).toMatchObject({ phase: "awaitingInitialDeal", roundAttempt: 1, currentPlayerId: null, currentTrick: [], pendingLotCount: 0, captured: { A: { cardCount: 0 }, B: { cardCount: 0 } }, history: [] });
    expect(after.players.every((player) => player.cardCount === 0)).toBe(true);
    const standingsAfter = await t.run(async (ctx) => {
      const [game] = await ctx.db.query("dehlaGames").take(1);
      if (!game) throw new Error("Expected game fixture.");
      return (game.state as DehlaGameState).standings;
    });
    expect(standingsAfter).toEqual(standingsBefore);
  });

  it("rejects unauthorized capabilities and a non-host start", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.dehlaRooms.create, { code: "AUTH12", playerName: "Asha", seatToken: tokens[0] });
    for (let index = 1; index < 4; index += 1) await t.mutation(api.dehlaRooms.join, { code: "AUTH12", playerName: `P${index + 1}`, seatToken: tokens[index] });
    await expect(t.mutation(api.dehlaRooms.start, { code: "AUTH12", seatToken: tokens[1] })).rejects.toThrow("Only the host");
    expect(await t.query(api.dehlaRooms.view, { code: "AUTH12", seatToken: "invalid-capability-token-123456" })).toEqual({ kind: "unavailable", code: "AUTH12" });
    await expect(t.mutation(api.dehlaRooms.start, { code: "AUTH12", seatToken: "invalid-capability-token-123456" })).rejects.toThrow("does not hold a seat");
  });

  it("rejects replayed start and advance-round actions", async () => {
    const code = "REPL12";
    const t = await roomWaitingForDeal(code);
    await expect(t.mutation(api.dehlaRooms.start, { code, seatToken: tokens[0] })).rejects.toThrow("not waiting to start");
    await patchGame(t, code, (state) => {
      state.phase = "roundComplete";
      state.currentPlayerId = null;
    });
    const completed = asGame(await t.query(api.dehlaRooms.view, { code, seatToken: tokens[0] }));
    await t.mutation(api.dehlaRooms.advanceRound, { code, seatToken: tokens[0], expectedRevision: completed.revision });
    await expect(t.mutation(api.dehlaRooms.advanceRound, { code, seatToken: tokens[0], expectedRevision: completed.revision })).rejects.toThrow("Game state changed");
    const next = asGame(await t.query(api.dehlaRooms.view, { code, seatToken: tokens[0] }));
    expect(next.phase).toBe("awaitingInitialDeal");
  });
});
