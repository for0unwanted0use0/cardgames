# Dehla Pakad implementation notes

## Routes

- `/` is the Cardgames platform selector.
- `/games/declare` preserves the existing Online Declare experience.
- `/games/dehla-pakad` hosts the four-player Dehla Pakad table.
- `/scorecard` keeps the existing scorecard as a separate experience.

## Persistence and compatibility

The Convex change is additive. Existing Declare rooms have no `gameType` and are treated as Declare rooms. New rooms set `gameType` explicitly. Dehla Pakad uses separate `dehlaGames` and `dehlaRoundHistory` tables, while both games reuse the existing capability-token seats and LiveKit authorization path.

Player views are projections: only the requesting seat receives its hand. Undealt cards and opponents' hands never leave the server. Cards already played into the public pending lot are intentionally projected to every seat, grouped by completed hand with exact play order, player attribution, winner, and winning team, and disappear from that projection as soon as the lot is collected. Mutations validate the seat token, expected revision, turn, ownership, and follow-suit rule.

No data backfill is required. Deploy the schema and functions before using the new route.

## Dealer-transition boundary

Dealer transition is isolated from trick and round resolution in `engine/match.ts`. `resolveNextDealerState(...)` receives only the current dealer sequence, the settled post-round standings, and the completed-round result. It returns a new immutable dealer state plus a machine-readable reason.

The resolver implements the authoritative cases directly:

- a dealing team that remains behind keeps the same dealer;
- if the dealing team becomes ahead, responsibility crosses to the other team's stored next dealer because that team is now behind;
- an opposing Bavaniya keeps the same dealing team but switches its dealer to their partner;
- an exact draw keeps a behind dealing team, or crosses teams when the standings are level.

The latest round winner is not itself the transition rule. The resolver first applies the completed round to the match standings, compares net Bavaniya, then net Coat, then cumulative tens, and selects the next dealing team from that settled hierarchy. If an ordinary, Coat, or non-opposing-Bavaniya result leaves the teams level, dealing crosses just as it does for an exact level draw; only a team that is actually behind retains the deal.

Gameplay uses net/cancelled Bavaniya and Coat values. Lifetime round, Coat, Bavaniya, and draw totals remain separate for statistics, while cumulative captured tens remain raw historical totals.

### Dealer-transition truth table

| Settled post-round condition | Next dealing team | Next individual dealer |
| --- | --- | --- |
| Current dealing team is behind | Same team | Same dealer |
| Current dealing team is ahead after an ordinary win | Opposing (now-behind) team | That team's stored next dealer; advance its partner sequence |
| Current dealing team is ahead after a Coat | Opposing (now-behind) team | That team's stored next dealer; advance its partner sequence |
| Current dealing team won but remains behind on higher-priority Coat/Bavaniya | Same team | Same dealer |
| Opposing team won and current dealing team remains behind | Same team | Same dealer |
| Opponent wins Bavaniya against the current dealing team | Same losing/behind team | Current dealer's partner; advance that team's sequence |
| Exact 2–2 tens / 26–26 cards draw while current dealing team is behind | Same team | Same dealer |
| Exact draw while the overall standing is level | Opposing team | That team's stored next dealer; advance its partner sequence |
| Any other settled level standing | Opposing team | That team's stored next dealer; advance its partner sequence |

The resulting settled between-round state is checked so the dealing team cannot be the team that is ahead.

## Round flow and recovery

The dealer selection reveals all four selection cards, both team totals, automatic tie redraws, the losing/dealing team, and the selected individual dealer. Fixed seats are P1 west, P2 north, P3 east, and P4 south, so both partnerships are visually opposite.

The dealer first deals five cards per player. The phase is labelled **Finding Hukum** until a player cannot follow the lead suit and plays another suit. That card's suit becomes Hukum immediately for the declaration hand. Once the hand resolves, the remaining eight cards per player are dealt and the UI announces the second deal before normal round play continues.

If five hands finish without Hukum, the attempt is aborted completely. The same dealer reshuffles all 52 cards and deals again; cards, captures, the pending lot, trick history, streaks, and hands won are cleared, while round number, dealer state, and match standings remain unchanged. No round-history document is written for the aborted attempt.

Seat credentials are stored locally and every query rehydrates the player's authoritative projected state. Reconnection is covered for the initial dealer phase, mid-Hukum search, mid-trick, Hukum established, no-Hukum reset, and round-complete states.

The local hand is sorted only at render time in Spades, Hearts, Diamonds, Clubs order, with ranks descending within each suit. The authoritative hand array, card IDs, deal order, and server actions are unchanged. The pending-lot stack opens an accessible inspector showing every already-public card from the first uncollected hand through the latest completed hand. There is no three-hand display or projection limit: the inspector maps the complete current lot, while an internally scrolling body keeps its close control reachable and prevents page growth. Each hand identifies its winner and team, preserves actual play order and player attribution, retains Hukum styling, and subtly marks the winning play. All four seats receive identical contents and the inspector becomes empty immediately after collection.

## Privacy and replay safety

- Only the viewer's unplayed hand is present in the projected Convex response and rendered hand. Opponents expose card counts only. The sole card-identity exception is the shared pending lot, whose cards, players, play order, winner, and team are already public.
- `undealt`, the full authoritative state, other hands, and other seat tokens are never returned.
- Capability tokens authorize every query and mutation; invalid tokens receive no room data and cannot act.
- Deal, card-play, and round-advance mutations require the current revision. Retried stale actions fail before applying another state change. Start is also one-shot because only a waiting room can start.
- All rules—turn ownership, card ownership, follow suit, Hukum, captures, scoring, and dealer transition—are enforced by the server-side engine rather than trusted to the browser.

## Local verification

The deterministic engine and `convex-test` suites run without a deployment. `tests/e2e/dehla-pakad.spec.ts` drives four isolated browser contexts through lobby, private hands, legal play, Hukum, second deal, pending-lot inspection and collection, post-collection streak restart, refresh recovery, round completion, result review, and next-round preparation. The integration suite runs against the explicitly configured development deployment; production deployment is a separate, consent-gated action.
