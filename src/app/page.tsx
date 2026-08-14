"use client";

import { useState } from "react";
import DeclareGame from "../games/declare/components/DeclareGame";

export default function Home() {
  const [view, setView] = useState<"play" | "scorepad">("play");
  return <main>
    <nav className="site-nav" aria-label="Card games">
      <span className="brand">Card Table</span>
      <button className={view === "play" ? "active" : ""} onClick={() => setView("play")}>Play Declare</button>
      <button className={view === "scorepad" ? "active" : ""} onClick={() => setView("scorepad")}>Scorepads</button>
    </nav>
    {view === "play" ? <DeclareGame /> : <iframe className="scorepad" src="/card-table.html" title="Declare and Judgement scorepads" />}
  </main>;
}
