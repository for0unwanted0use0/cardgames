import type { GameState } from "../games/declare/engine/state";

const ACTIVE_KEY = "declare-playable-active-v1";
const HISTORY_KEY = "declare-playable-history-v1";

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameState>;
  return candidate.version === 1 && typeof candidate.id === "string"
    && Array.isArray(candidate.players) && Array.isArray(candidate.stock)
    && Array.isArray(candidate.playerOrder) && typeof candidate.status === "string";
}

export function loadActiveGame(): GameState | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isGameState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadGameHistory(): GameState[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isGameState) : [];
  } catch {
    return [];
  }
}

export function saveGame(state: GameState): void {
  if (state.status !== "gameComplete") {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(state));
    return;
  }
  const history = loadGameHistory().filter((game) => game.id !== state.id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify([state, ...history].slice(0, 50)));
  localStorage.removeItem(ACTIVE_KEY);
}

export function clearActiveGame(): void {
  localStorage.removeItem(ACTIVE_KEY);
}
