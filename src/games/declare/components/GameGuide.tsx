"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "../../../lib/analytics";

const GUIDE_KEY = "declare-guide-v1";

const sections = [
  ["Start together", "Create a private table, share its six-character code, and wait for 2–6 players. New players cannot join after the host starts."],
  ["Discard, then draw", "On your turn, discard a single card, a matching-rank group, or a sequence of three or more. Then take one eligible previous-discard card or draw from stock."],
  ["Use Jokers", "Jokers can fill missing ranks in a sequence of three or more cards. They cannot form a two-card pair."],
  ["Declare and score", "Declare only when your hand is below 10 points. A uniquely lowest hand succeeds; otherwise the declarer receives the highest hand score."],
  ["Rounds and privacy", "The lowest-hand winner starts the next round. Score history is shared, while opponents’ cards stay private until the round ends."],
  ["Voice, alerts, and leaving", "Voice and turn alerts are optional. Leaving is a forfeit: in two-player games the opponent wins; larger games continue and host control transfers."],
] as const;

export default function GameGuide() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (localStorage.getItem(GUIDE_KEY) !== "seen") {
      setOpen(true);
      trackEvent("tutorial_begin", { source: "first_visit" });
    }
  }, []);
  function showGuide() { setOpen(true); trackEvent("tutorial_begin", { source: "help_button" }); }
  function close() { localStorage.setItem(GUIDE_KEY, "seen"); setOpen(false); trackEvent("tutorial_complete"); }
  return <>
    <button className="guide-launch" type="button" onClick={showGuide}>How to play</button>
    {open && <section className="guide-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <article className="game-guide" role="dialog" aria-modal="true" aria-labelledby="game-guide-title">
        <p className="eyebrow">New to Declare?</p><h2 id="game-guide-title">You’ll learn it in one round</h2>
        <div className="guide-steps">{sections.map(([title, copy], index) => <section key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{copy}</p></div></section>)}</div>
        <div className="actions"><button type="button" onClick={close}>Got it — let’s play</button></div>
      </article>
    </section>}
  </>;
}
