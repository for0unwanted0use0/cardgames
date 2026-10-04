import Link from "next/link";
import SiteNav from "../components/SiteNav";

const games = [
  { href: "/games/declare", eyebrow: "2–6 players", title: "Declare", description: "The original live multiplayer table, preserved with private hands, reconnect, scoring, and optional voice.", action: "Play Declare" },
  { href: "/games/dehla-pakad", eyebrow: "4 players · 2 teams", title: "Dehla Pakad", description: "Capture the four tens through dynamic Hukum, consecutive-hand streaks, and the pending-lot strategy.", action: "Play Dehla Pakad" },
];

const tools = [
  { href: "/scorecard", eyebrow: "Local companion", title: "Scorecards", description: "Keep Declare and Judgement scores together on one shared screen.", action: "Open scorecards" },
];

export default function Home() {
  return <main>
    <SiteNav />
    <section className="platform-home">
      <div className="platform-hero"><p className="eyebrow">One table, more ways to play</p><h1>Cardgames</h1><p>Choose a game, gather your players, and keep every hand at the same familiar table.</p></div>
      <section className="catalog-section"><div className="catalog-heading"><p className="eyebrow">Play online</p><h2>Choose your table</h2></div><div className="game-catalog online-catalog">{games.map((game, index) => <article className="game-tile" key={game.href}><span className="game-tile-number">0{index + 1}</span><p className="eyebrow">{game.eyebrow}</p><h2>{game.title}</h2><p>{game.description}</p><Link href={game.href}>{game.action} <span aria-hidden="true">→</span></Link></article>)}</div></section>
      <section className="catalog-section tools-section"><div className="catalog-heading"><p className="eyebrow">Tools</p><h2>Keep score locally</h2></div><div className="game-catalog tools-catalog">{tools.map((tool) => <article className="game-tile tool-tile" key={tool.href}><p className="eyebrow">{tool.eyebrow}</p><h2>{tool.title}</h2><p>{tool.description}</p><Link href={tool.href}>{tool.action} <span aria-hidden="true">→</span></Link></article>)}</div></section>
    </section>
  </main>;
}
