"use client";

import { useState } from "react";
import OnlineDeclareGame from "../games/declare/components/OnlineDeclareGame";
import GameGuide from "../games/declare/components/GameGuide";

export default function Home() {
  const [view, setView] = useState<"online" | "scorepad">("online");
  return <main>
    <nav className="site-nav" aria-label="Card games">
      <span className="brand">Card Table</span>
      <button className={view === "online" ? "active" : ""} onClick={() => setView("online")}>Online Declare</button>
      <button className={view === "scorepad" ? "active" : ""} onClick={() => setView("scorepad")}>Scorepads</button>
      <GameGuide settingsAvailable={view === "online"} />
    </nav>
    {view === "online" ? <OnlineDeclareGame /> : <iframe className="scorepad" src="/card-table.html" title="Declare and Judgement scorepads" />}
  </main>;
}
