import { describe, expect, it } from "vitest";
import { createDeck } from "./deck";
import { classifyRound, isLegalPlay, trickWinner } from "./rules";
import { createMatch, dealInitial, playCard } from "./state";
import type { Card, DehlaGameState, PlayedCard, PlayerId, Rank, Suit } from "./types";

const c = (suit: Suit, rank: Rank, suffix = ""): Card => ({ id: `${suit}-${rank}${suffix}`, suit, rank });
const play = (playerId: PlayerId, card: Card): PlayedCard => ({ playerId, card });

function random(seed = 12345) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 2 ** 32; };
}

function activeState(): DehlaGameState {
  const initial = createMatch(["P1", "P2", "P3", "P4"], random(), "TEST01");
  const dealt = dealInitial(initial, initial.dealer, random(88));
  if (!dealt.ok) throw new Error(dealt.error);
  return dealt.state;
}

function resolvePreparedTrick(state: DehlaGameState, winner: PlayerId = "player-1", containsTen = false) {
  state.phase = "roundPlay";
  state.hukum = "clubs";
  state.hukumDeclarer = "player-2";
  state.hukumHandNumber = 1;
  if (state.handsCompleted === 0) state.handsCompleted = 1;
  state.currentPlayerId = "player-4";
  state.currentTrick = [
    play(winner, c("hearts", 14, "a")),
    play(winner === "player-2" ? "player-1" : "player-2", c("hearts", containsTen ? 10 : 3, "b")),
    play(winner === "player-3" ? "player-1" : "player-3", c("hearts", 4, "c")),
  ];
  state.hands["player-4"] = [c("hearts", 2, "d")];
  const result = playCard(state, "player-4", state.hands["player-4"][0].id);
  if (!result.ok) throw new Error(result.error);
  return result;
}

function resolveSequentialTrick(state: DehlaGameState, winner: PlayerId, containsTen = false) {
  const handNumber = state.handsCompleted + 1;
  state.phase = "roundPlay";
  state.hukum = "clubs";
  state.hukumDeclarer = "player-2";
  state.hukumHandNumber = 1;
  state.currentPlayerId = "player-4";
  state.currentTrick = [
    play(winner, c("hearts", 14, `h${handNumber}a`)),
    play(winner === "player-2" ? "player-1" : "player-2", c("hearts", containsTen ? 10 : 3, `h${handNumber}b`)),
    play(winner === "player-3" ? "player-1" : "player-3", c("hearts", 4, `h${handNumber}c`)),
  ];
  state.hands["player-4"] = [c("hearts", 2, `h${handNumber}d`)];
  const result = playCard(state, "player-4", state.hands["player-4"][0].id);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function cards(count: number, tens: number, prefix: string): Card[] {
  const result: Card[] = [];
  const nonTens: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14];
  for (let index = 0; index < count; index += 1) result.push(c(index % 2 ? "clubs" : "spades", index < tens ? 10 : nonTens[index % nonTens.length], `${prefix}${index}`));
  return result;
}

describe("follow suit and Hukum", () => {
  it("requires the lead suit when the player holds it", () => expect(isLegalPlay([c("hearts", 2), c("clubs", 3)], "clubs-3", "hearts")).toBe(false));
  it("allows any card when the player is void in the lead suit", () => expect(isLegalPlay([c("clubs", 3), c("spades", 4)], "clubs-3", "hearts")).toBe(true));
  it("uses the highest Hukum card", () => expect(trickWinner([play("player-1", c("hearts", 14)), play("player-2", c("clubs", 2)), play("player-3", c("clubs", 13)), play("player-4", c("hearts", 10))], "clubs")).toBe("player-3"));
  it("uses the highest lead card without Hukum in the hand", () => expect(trickWinner([play("player-1", c("hearts", 9)), play("player-2", c("spades", 14)), play("player-3", c("hearts", 13)), play("player-4", c("diamonds", 10))], null)).toBe("player-3"));
  it("establishes Hukum and applies it immediately", () => {
    const state = activeState();
    state.currentPlayerId = "player-4";
    state.currentTrick = [play("player-1", c("hearts", 14)), play("player-2", c("hearts", 13)), play("player-3", c("hearts", 12))];
    state.hands["player-4"] = [c("clubs", 2)];
    state.undealt = createDeck().slice(0, 32);
    const next = playCard(state, "player-4", "clubs-2");
    expect(next.ok && next.state.hukum).toBe("clubs");
    expect(next.ok && next.state.lastTrick?.winner).toBe("player-4");
  });
  it("resets the declaration-hand winner streak to one", () => {
    const state = activeState(); state.streakPlayer = "player-4"; state.streakCount = 7;
    state.currentPlayerId = "player-4"; state.currentTrick = [play("player-1", c("hearts", 14)), play("player-2", c("hearts", 13)), play("player-3", c("hearts", 12))]; state.hands["player-4"] = [c("clubs", 2)]; state.undealt = createDeck().slice(0, 32);
    const next = playCard(state, "player-4", "clubs-2");
    expect(next.ok && next.state.streakCount).toBe(1);
  });
  it("deals exactly eight more cards per player after the declaration hand", () => {
    const state = activeState(); state.currentPlayerId = "player-4"; state.currentTrick = [play("player-1", c("hearts", 14)), play("player-2", c("hearts", 13)), play("player-3", c("hearts", 12))]; state.hands = { "player-1": [], "player-2": [], "player-3": [], "player-4": [c("clubs", 2)] }; state.undealt = createDeck().slice(0, 32);
    const next = playCard(state, "player-4", "clubs-2");
    expect(next.ok && Object.values(next.state.hands).map((hand) => hand.length)).toEqual([8, 8, 8, 8]);
    expect(next.ok && next.state.phase).toBe("roundPlay");
  });
  it("fully aborts hand five without Hukum while preserving match and dealer state", () => {
    const state = activeState();
    const standingBefore = structuredClone(state.standings);
    const dealerBefore = { dealer: state.dealer, dealingTeam: state.dealingTeam, nextDealerByTeam: structuredClone(state.nextDealerByTeam) };
    state.handsCompleted = 4;
    state.currentPlayerId = "player-4";
    state.currentTrick = [play("player-1", c("hearts", 14)), play("player-2", c("hearts", 13)), play("player-3", c("hearts", 12))];
    state.hands["player-4"] = [c("hearts", 2)];
    state.pendingLot = cards(12, 1, "pending");
    state.captured.A = cards(8, 1, "captured");
    state.streakPlayer = "player-1";
    state.streakCount = 3;
    state.handsWon["player-1"] = 4;
    state.lotHistory = [{ handNumber: 2, playerId: "player-1", team: "A", cardCount: 8, reason: "streak" }];
    const next = playCard(state, "player-4", "hearts-2");
    expect(next.ok && next.roundReset).toBe(true);
    if (!next.ok) throw new Error(next.error);
    expect(next.state).toMatchObject({
      phase: "awaitingInitialDeal", roundNumber: 1, roundAttempt: 1,
      ...dealerBefore, standings: standingBefore,
      currentPlayerId: null, currentTrick: [], lastTrick: null, handsCompleted: 0,
      hukum: null, hukumDeclarer: null, hukumHandNumber: null,
      pendingLot: [], captured: { A: [], B: [] }, streakPlayer: null, streakCount: 0,
      handsWon: { "player-1": 0, "player-2": 0, "player-3": 0, "player-4": 0 }, lotHistory: [], completedRound: null,
    });
    expect(Object.values(next.state.hands).every((hand) => hand.length === 0)).toBe(true);
    expect(next.state.undealt).toEqual([]);
  });
});

describe("pending lot", () => {
  it("lifts after the same player wins two consecutive hands", () => { const state = activeState(); state.streakPlayer = "player-1"; state.streakCount = 1; state.pendingLot = cards(4, 0, "old"); const next = resolvePreparedTrick(state); expect(next.state.captured.A).toHaveLength(8); });
  it("does not count partners as one streak", () => { const state = activeState(); state.streakPlayer = "player-3"; state.streakCount = 1; state.pendingLot = cards(4, 0, "old"); const next = resolvePreparedTrick(state, "player-1"); expect(next.state.pendingLot).toHaveLength(8); expect(next.state.streakCount).toBe(1); });
  it("postpones a qualifying lift when the hand contains a ten", () => { const state = activeState(); state.streakPlayer = "player-1"; state.streakCount = 1; const next = resolvePreparedTrick(state, "player-1", true); expect(next.state.pendingLot).toHaveLength(4); expect(next.state.streakCount).toBe(2); });
  it("repeated tens repeatedly postpone a lift", () => { const state = activeState(); state.streakPlayer = "player-1"; state.streakCount = 2; state.pendingLot = cards(8, 1, "old"); const next = resolvePreparedTrick(state, "player-1", true); expect(next.state.pendingLot).toHaveLength(12); expect(next.state.streakCount).toBe(3); });
  it("a different individual breaks the streak but leaves the lot", () => { const state = activeState(); state.streakPlayer = "player-2"; state.streakCount = 3; state.pendingLot = cards(8, 1, "old"); const next = resolvePreparedTrick(state, "player-1"); expect(next.state.pendingLot).toHaveLength(12); expect(next.state.streakPlayer).toBe("player-1"); expect(next.state.streakCount).toBe(1); });
  it("a successful lift resets the streak", () => { const state = activeState(); state.streakPlayer = "player-1"; state.streakCount = 1; const next = resolvePreparedTrick(state); expect(next.state.streakPlayer).toBeNull(); expect(next.state.streakCount).toBe(0); });
  it("hand thirteen captures the remaining lot regardless of streak or ten", () => { const state = activeState(); state.handsCompleted = 12; state.pendingLot = cards(48, 3, "old"); state.streakPlayer = "player-2"; state.streakCount = 1; const next = resolvePreparedTrick(state, "player-1", true); expect(next.state.pendingLot).toHaveLength(0); expect(next.state.captured.A).toHaveLength(52); expect(next.state.completedRound?.resultType).toBe("bavaniya"); });

  it("starts a new same-player streak immediately after collection and collects its second hand", () => {
    let state = activeState();
    state = resolveSequentialTrick(state, "player-1");
    expect(state).toMatchObject({ streakPlayer: "player-1", streakCount: 1 });
    expect(state.pendingLot).toHaveLength(4);
    state = resolveSequentialTrick(state, "player-1");
    expect(state).toMatchObject({ streakPlayer: null, streakCount: 0 });
    expect(state.pendingLot).toHaveLength(0);
    expect(state.captured.A).toHaveLength(8);

    state = resolveSequentialTrick(state, "player-1");
    expect(state).toMatchObject({ streakPlayer: "player-1", streakCount: 1 });
    expect(state.pendingLot).toHaveLength(4);
    state = resolveSequentialTrick(state, "player-1");
    expect(state).toMatchObject({ streakPlayer: null, streakCount: 0 });
    expect(state.pendingLot).toHaveLength(0);
    expect(state.captured.A).toHaveLength(16);
  });

  it("starts a different player's new streak immediately after collection", () => {
    let state = activeState();
    state = resolveSequentialTrick(state, "player-1");
    state = resolveSequentialTrick(state, "player-1");
    expect(state.pendingLot).toHaveLength(0);

    state = resolveSequentialTrick(state, "player-2");
    expect(state).toMatchObject({ streakPlayer: "player-2", streakCount: 1 });
    expect(state.pendingLot).toHaveLength(4);
    state = resolveSequentialTrick(state, "player-2");
    expect(state).toMatchObject({ streakPlayer: null, streakCount: 0 });
    expect(state.pendingLot).toHaveLength(0);
    expect(state.captured.B).toHaveLength(8);
  });

  it("restarts an interrupted post-collection streak for the new individual", () => {
    let state = activeState();
    state = resolveSequentialTrick(state, "player-1");
    state = resolveSequentialTrick(state, "player-1");
    state = resolveSequentialTrick(state, "player-1");
    expect(state).toMatchObject({ streakPlayer: "player-1", streakCount: 1 });

    state = resolveSequentialTrick(state, "player-2");
    expect(state).toMatchObject({ streakPlayer: "player-2", streakCount: 1 });
    expect(state.pendingLot).toHaveLength(8);
    expect(state.captured.B).toHaveLength(0);
    state = resolveSequentialTrick(state, "player-2");
    expect(state).toMatchObject({ streakPlayer: null, streakCount: 0 });
    expect(state.pendingLot).toHaveLength(0);
    expect(state.captured.B).toHaveLength(12);
  });

  it("carries a new cycle through a ten and collects on the next ten-free win", () => {
    let state = activeState();
    state = resolveSequentialTrick(state, "player-1");
    state = resolveSequentialTrick(state, "player-1");
    state = resolveSequentialTrick(state, "player-1");
    expect(state).toMatchObject({ streakPlayer: "player-1", streakCount: 1 });

    state = resolveSequentialTrick(state, "player-1", true);
    expect(state).toMatchObject({ streakPlayer: "player-1", streakCount: 2 });
    expect(state.pendingLot).toHaveLength(8);
    state = resolveSequentialTrick(state, "player-1");
    expect(state).toMatchObject({ streakPlayer: null, streakCount: 0 });
    expect(state.pendingLot).toHaveLength(0);
    expect(state.captured.A).toHaveLength(20);
  });

  it("does not let a partner continue the individual post-collection streak", () => {
    let state = activeState();
    state = resolveSequentialTrick(state, "player-1");
    state = resolveSequentialTrick(state, "player-1");
    state = resolveSequentialTrick(state, "player-1");
    expect(state).toMatchObject({ streakPlayer: "player-1", streakCount: 1 });

    state = resolveSequentialTrick(state, "player-3");
    expect(state).toMatchObject({ streakPlayer: "player-3", streakCount: 1 });
    expect(state.pendingLot).toHaveLength(8);
    expect(state.captured.A).toHaveLength(8);
  });

  it("retains every completed hand in a five-hand lot, then clears and starts fresh", () => {
    let state = activeState();
    const winners: PlayerId[] = ["player-1", "player-2", "player-1", "player-2", "player-1"];
    for (const winner of winners) state = resolveSequentialTrick(state, winner);

    expect(state.pendingLot).toHaveLength(20);
    expect(state.pendingLotHands).toHaveLength(5);
    expect(state.pendingLotHands?.map((hand) => hand.handNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(state.pendingLotHands?.map((hand) => hand.winner)).toEqual(winners);
    expect(state.pendingLotHands?.every((hand) => hand.plays.length === 4)).toBe(true);
    expect(state.pendingLotHands?.flatMap((hand) => hand.plays.map((play) => play.card.id)))
      .toEqual(state.pendingLot.map((card) => card.id));

    state = resolveSequentialTrick(state, "player-1");
    expect(state.pendingLot).toEqual([]);
    expect(state.pendingLotHands).toEqual([]);

    state = resolveSequentialTrick(state, "player-3");
    expect(state.pendingLot).toHaveLength(4);
    expect(state.pendingLotHands).toHaveLength(1);
    expect(state.pendingLotHands?.[0]).toMatchObject({ handNumber: 7, winner: "player-3" });
    expect(state.pendingLotHands?.[0].plays).toHaveLength(4);
  });
});

describe("round scoring", () => {
  it("scores a 3–1 normal win", () => expect(classifyRound({ A: cards(28, 3, "a"), B: cards(24, 1, "b") })).toMatchObject({ winningTeam: "A", resultType: "normal" }));
  it("uses captured-card count for 2–2", () => expect(classifyRound({ A: cards(36, 2, "a"), B: cards(16, 2, "b") })).toMatchObject({ winningTeam: "A", resultType: "normal" }));
  it("recognizes an exact 2–2 and 26–26 draw", () => expect(classifyRound({ A: cards(26, 2, "a"), B: cards(26, 2, "b") })).toMatchObject({ winningTeam: null, resultType: "draw" }));
  it("recognizes Coat when all tens but not all cards are captured", () => expect(classifyRound({ A: cards(40, 4, "a"), B: cards(12, 0, "b") })).toMatchObject({ winningTeam: "A", resultType: "coat" }));
  it("recognizes Bavaniya above Coat", () => expect(classifyRound({ A: cards(52, 4, "a"), B: [] })).toMatchObject({ winningTeam: "A", resultType: "bavaniya" }));
});
