import Link from "next/link";
import type { ReactNode } from "react";

export default function SiteNav({ current, children }: { current?: "declare" | "dehla" | "scorecard"; children?: ReactNode }) {
  return <nav className="site-nav" aria-label="Cardgames">
    <Link className="brand" href="/">Cardgames</Link>
    <Link className={current === "declare" ? "active" : ""} href="/games/declare">Declare</Link>
    <Link className={current === "dehla" ? "active" : ""} href="/games/dehla-pakad">Dehla Pakad</Link>
    <Link className={current === "scorecard" ? "active" : ""} href="/scorecard">Scorecards</Link>
    {children}
  </nav>;
}
