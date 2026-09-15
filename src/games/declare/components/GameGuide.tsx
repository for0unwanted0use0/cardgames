"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

export default function GameGuide({ settingsAvailable = true }: { settingsAvailable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const guideRef = useRef<HTMLElement>(null);
  const guideReturnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (localStorage.getItem(GUIDE_KEY) !== "seen") {
      setOpen(true);
      trackEvent("tutorial_begin", { source: "first_visit" });
    }
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    function dismiss(event: MouseEvent) { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuTriggerRef.current?.focus();
    }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", dismiss); document.removeEventListener("keydown", escape); };
  }, [menuOpen]);
  useEffect(() => {
    if (!open) return;
    const returnFocus = guideReturnFocusRef.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    guideReturnFocusRef.current = null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusableSelector = "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";
    const focusTimer = window.setTimeout(() => guideRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus());
    function handleDialogKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(guideRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleDialogKeydown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleDialogKeydown);
      document.body.style.overflow = previousOverflow;
      (returnFocus?.isConnected ? returnFocus : menuTriggerRef.current)?.focus();
    };
  }, [open]);
  function closeMenu() { setMenuOpen(false); }
  function showGuide() { guideReturnFocusRef.current = menuTriggerRef.current; closeMenu(); setOpen(true); trackEvent("tutorial_begin", { source: "help_button" }); }
  function showSettings() {
    closeMenu();
    const gameDetails = document.querySelector<HTMLDetailsElement>(".game-details");
    if (gameDetails) gameDetails.open = true;
    const target = gameDetails ?? document.querySelector<HTMLElement>(".visibility-options");
    target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  }
  function close() { localStorage.setItem(GUIDE_KEY, "seen"); setOpen(false); trackEvent("tutorial_complete"); }
  return <>
    <div className="app-menu" ref={menuRef}>
      <button ref={menuTriggerRef} className="menu-trigger" type="button" aria-label="Open app menu" aria-controls="app-menu-panel" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><span aria-hidden="true">☰</span><span className="menu-label">Menu</span></button>
      {menuOpen && <div className="app-menu-panel" id="app-menu-panel">
        <div className="menu-profile"><span aria-hidden="true">G</span><div><strong>Guest player</strong><small>Profile arrives with sign-in</small></div></div>
        <button type="button" onClick={showGuide}><span className="menu-item-icon" aria-hidden="true">?</span><span><strong>How to play</strong><small>Rules and a quick walkthrough</small></span></button>
        <button type="button" onClick={showSettings} disabled={!settingsAvailable}><span className="menu-item-icon" aria-hidden="true">⚙</span><span><strong>Game settings</strong><small>{settingsAvailable ? "Table options and turn alerts" : "Available in Online Declare"}</small></span></button>
        <button type="button" disabled><span className="menu-item-icon" aria-hidden="true">♙</span><span><strong>Player profile</strong><small>Coming with Google sign-in</small></span></button>
      </div>}
    </div>
    {open && createPortal(<section className="guide-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <article ref={guideRef} className="game-guide" role="dialog" aria-modal="true" aria-labelledby="game-guide-title">
        <header className="guide-header"><div><p className="eyebrow">New to Declare?</p><h2 id="game-guide-title">You’ll learn it in one round</h2></div><button className="guide-close" type="button" aria-label="Close how to play" onClick={close}>×</button></header>
        <div className="guide-steps">{sections.map(([title, copy], index) => <section key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{copy}</p></div></section>)}</div>
        <div className="guide-actions"><button type="button" onClick={close}>Got it — let’s play</button></div>
      </article>
    </section>, document.body)}
  </>;
}
