import { describe, expect, it } from "vitest";
import {
  applyNetAward,
  assertSettledDealerInvariant,
  compareStandings,
  resolveNextDealerState,
  updateMatchStandings,
  type DealerState,
} from "./match";
import type { MatchStandings, RoundResult, Team } from "./types";

function standings(): MatchStandings {
  return {
    bavaniyas: { A: 0, B: 0 },
    coats: { A: 0, B: 0 },
    cumulativeTens: { A: 0, B: 0 },
    lifetime: {
      roundsWon: { A: 0, B: 0 },
      coats: { A: 0, B: 0 },
      bavaniyas: { A: 0, B: 0 },
      draws: 0,
    },
  };
}

function roundResult(resultType: RoundResult["resultType"], winningTeam: Team | null): RoundResult {
  return {
    roundNumber: 1,
    dealer: "player-1",
    dealingTeam: "A",
    winningTeam,
    resultType,
    hukum: "clubs",
    hukumDeclarer: "player-2",
    hukumHandNumber: 1,
    tensCaptured: { A: 2, B: 2 },
    cardsCaptured: { A: 26, B: 26 },
    handsWon: { "player-1": 0, "player-2": 0, "player-3": 0, "player-4": 0 },
    lotHistory: [],
  };
}

function dealerState(): DealerState {
  return { dealer: "player-1", dealingTeam: "A", nextDealerByTeam: { A: "player-3", B: "player-2" } };
}

describe("match standings", () => {
  it("cancels Coat independently", () => expect(applyNetAward({ A: 2, B: 0 }, "B")).toEqual({ A: 1, B: 0 }));
  it("cancels Bavaniya independently", () => expect(applyNetAward({ A: 0, B: 1 }, "A")).toEqual({ A: 0, B: 0 }));
  it("ranks Bavaniya above any Coat or tens total", () => {
    const value = standings(); value.bavaniyas.A = 1; value.coats.B = 9; value.cumulativeTens.B = 99;
    expect(compareStandings(value)).toBe(1);
  });
  it("ranks Coat above cumulative tens", () => {
    const value = standings(); value.coats.B = 1; value.cumulativeTens.A = 99;
    expect(compareStandings(value)).toBe(-1);
  });
  it("uses cumulative tens when higher standings are level", () => {
    const value = standings(); value.cumulativeTens.A = 7; value.cumulativeTens.B = 5;
    expect(compareStandings(value)).toBe(1);
  });
  it("preserves net gameplay standing and historical totals independently", () => {
    const value = standings();
    value.coats.A = 1;
    value.lifetime.coats.A = 3;
    const updated = updateMatchStandings(value, { ...roundResult("coat", "B"), tensCaptured: { A: 0, B: 4 }, cardsCaptured: { A: 12, B: 40 } });
    expect(updated.coats).toEqual({ A: 0, B: 0 });
    expect(updated.lifetime.coats).toEqual({ A: 3, B: 1 });
    expect(updated.lifetime.roundsWon.B).toBe(1);
    expect(updated.cumulativeTens).toEqual({ A: 0, B: 4 });
  });
  it("never lets a Coat cancel a Bavaniya", () => {
    const value = standings(); value.bavaniyas.A = 1;
    const updated = updateMatchStandings(value, roundResult("coat", "B"));
    expect(updated.bavaniyas).toEqual({ A: 1, B: 0 });
    expect(updated.coats).toEqual({ A: 0, B: 1 });
  });
  it("records exact draws historically without changing net awards", () => {
    const updated = updateMatchStandings(standings(), roundResult("draw", null));
    expect(updated.lifetime.draws).toBe(1);
    expect(updated.bavaniyas).toEqual({ A: 0, B: 0 });
    expect(updated.coats).toEqual({ A: 0, B: 0 });
  });
});

describe("resolveNextDealerState", () => {
  it("keeps the same dealer while the dealing team remains behind", () => {
    const value = standings(); value.cumulativeTens.B = 4;
    expect(resolveNextDealerState(dealerState(), value, roundResult("normal", "B"))).toMatchObject({ dealer: "player-1", dealingTeam: "A", reason: "behindContinues" });
  });
  it("keeps the same dealer after an opposing Coat while still behind", () => {
    const value = standings(); value.coats.B = 1;
    expect(resolveNextDealerState(dealerState(), value, roundResult("coat", "B"))).toMatchObject({ dealer: "player-1", dealingTeam: "A", reason: "behindContinues" });
  });
  it("switches to the partner after an opposing Bavaniya", () => {
    const value = standings(); value.bavaniyas.B = 1;
    expect(resolveNextDealerState(dealerState(), value, roundResult("bavaniya", "B"))).toEqual({
      dealer: "player-3", dealingTeam: "A", nextDealerByTeam: { A: "player-1", B: "player-2" },
      reason: "opposingBavaniyaPartnerSwitch",
    });
  });
  it("crosses when the dealing team wins an ordinary round and becomes ahead", () => {
    const value = standings(); value.cumulativeTens.A = 1;
    expect(resolveNextDealerState(dealerState(), value, roundResult("normal", "A"))).toMatchObject({ dealer: "player-2", dealingTeam: "B", reason: "aheadInvariantCrosses" });
  });
  it("crosses when the dealing team wins a Coat and becomes ahead", () => {
    const value = standings(); value.coats.A = 1;
    expect(resolveNextDealerState(dealerState(), value, roundResult("coat", "A"))).toMatchObject({ dealer: "player-2", dealingTeam: "B", reason: "aheadInvariantCrosses" });
  });
  it("keeps the deal after an ordinary win when still behind on Coat", () => {
    const value = standings(); value.coats.B = 1; value.cumulativeTens.A = 20;
    expect(resolveNextDealerState(dealerState(), value, roundResult("normal", "A"))).toMatchObject({ dealer: "player-1", dealingTeam: "A", reason: "behindContinues" });
  });
  it("keeps the deal after an ordinary win when still behind on Bavaniya", () => {
    const value = standings(); value.bavaniyas.B = 1; value.coats.A = 5; value.cumulativeTens.A = 20;
    expect(resolveNextDealerState(dealerState(), value, roundResult("normal", "A"))).toMatchObject({ dealer: "player-1", dealingTeam: "A", reason: "behindContinues" });
  });
  it("keeps the deal after winning a Coat when still behind on Bavaniya", () => {
    const value = standings(); value.bavaniyas.B = 1; value.coats.A = 1;
    expect(resolveNextDealerState(dealerState(), value, roundResult("coat", "A"))).toMatchObject({ dealer: "player-1", dealingTeam: "A", reason: "behindContinues" });
  });
  it("keeps the deal when the opposing team wins and the dealing team remains behind", () => {
    const value = standings(); value.cumulativeTens.B = 3;
    expect(resolveNextDealerState(dealerState(), value, roundResult("normal", "B"))).toMatchObject({ dealer: "player-1", dealingTeam: "A", reason: "behindContinues" });
  });
  it("uses the receiving team's stored next dealer and advances its sequence", () => {
    const value = standings(); value.cumulativeTens.A = 1;
    const transition = resolveNextDealerState({ ...dealerState(), nextDealerByTeam: { A: "player-3", B: "player-4" } }, value, roundResult("normal", "A"));
    expect(transition).toEqual({ dealer: "player-4", dealingTeam: "B", nextDealerByTeam: { A: "player-3", B: "player-2" }, reason: "aheadInvariantCrosses" });
  });
  it("keeps the dealing team on an exact draw while it remains behind", () => {
    const value = standings(); value.coats.B = 1;
    expect(resolveNextDealerState(dealerState(), value, roundResult("draw", null))).toMatchObject({ dealer: "player-1", dealingTeam: "A", reason: "behindContinues" });
  });
  it("crosses on an exact draw while overall standing is level", () => {
    expect(resolveNextDealerState(dealerState(), standings(), roundResult("draw", null))).toEqual({
      dealer: "player-2", dealingTeam: "B", nextDealerByTeam: { A: "player-3", B: "player-4" },
      reason: "exactDrawLevelCrosses",
    });
  });
  it("crosses after a level ordinary result because the current team is not behind", () => {
    expect(resolveNextDealerState(dealerState(), standings(), roundResult("normal", "A"))).toMatchObject({
      dealer: "player-2", dealingTeam: "B", reason: "levelStandingCrosses",
    });
  });
  it("crosses after a level Coat result because the current team is not behind", () => {
    expect(resolveNextDealerState(dealerState(), standings(), roundResult("coat", "A"))).toMatchObject({
      dealer: "player-2", dealingTeam: "B", reason: "levelStandingCrosses",
    });
  });
  it("does not mutate the supplied dealer sequence", () => {
    const current = dealerState(); const before = structuredClone(current); const value = standings(); value.cumulativeTens.A = 1;
    resolveNextDealerState(current, value, roundResult("normal", "A"));
    expect(current).toEqual(before);
  });
  it("rejects a completed round from a different dealer state", () => {
    expect(() => resolveNextDealerState(
      { dealer: "player-3", dealingTeam: "A", nextDealerByTeam: { A: "player-1", B: "player-2" } },
      standings(),
      roundResult("draw", null),
    )).toThrow("does not match");
  });
  it("rejects an opposing-Bavaniya state that contradicts its behind-team rule", () => {
    expect(() => resolveNextDealerState(dealerState(), standings(), roundResult("bavaniya", "B"))).toThrow("must leave the dealing team behind");
  });
  it("detects any settled state whose dealing team is ahead", () => {
    const value = standings(); value.bavaniyas.A = 1;
    expect(() => assertSettledDealerInvariant(dealerState(), value)).toThrow("cannot be ahead");
  });
});
