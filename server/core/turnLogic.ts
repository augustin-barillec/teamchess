import { Chess } from "chess.js";
import { GameStatus, EndReason } from "../shared_types.js";
import type { PlayerSide } from "../types.js";
import { INCREMENT_THRESHOLD, TIME_INCREMENT } from "../constants.js";

export interface TurnState {
  status: GameStatus;
  side: PlayerSide;
  moveNumber: number;
  whiteTime: number;
  blackTime: number;
  proposals: Map<string, { lan: string; san: string; name: string }>;
}

export interface OnlinePlayerInfo {
  activeTeamPids: Set<string>;
}

/**
 * Determines if a turn should be finalized based on current state.
 * Pure function - no side effects.
 */
export function shouldFinalizeTurn(
  state: TurnState,
  online: OnlinePlayerInfo
): boolean {
  if (state.status !== GameStatus.AwaitingProposals) return false;
  if (online.activeTeamPids.size === 0) return false;

  const onlineProposalCount = [...state.proposals.keys()].filter((pid) =>
    online.activeTeamPids.has(pid)
  ).length;

  return onlineProposalCount === online.activeTeamPids.size;
}

/**
 * Calculates time increment based on current time.
 * Returns 10 seconds if time is 60 or less, 0 otherwise.
 */
export function calculateIncrement(currentTime: number): number {
  return currentTime <= INCREMENT_THRESHOLD ? TIME_INCREMENT : 0;
}

export interface SelectedMove {
  lan: string;
  /** True when the engine could not be trusted and a candidate was drawn at random. */
  fallback: boolean;
}

/**
 * Decides which candidate to play from the engine's answer.
 *
 * The engine is only an adviser: candidates were validated as legal when submitted, so any
 * of them can be played. When its answer is unusable — no engine, no answer in time, or a
 * move that is not one of the proposals — a candidate is drawn at random and `fallback` is
 * set so the caller can warn the players. Returns null when there is nothing to play.
 *
 * Pure function - `rng` is injected for testing.
 */
export function resolveSelectedMove(
  engineMove: string | null,
  candidates: string[],
  rng: () => number = Math.random
): SelectedMove | null {
  if (candidates.length === 0) return null;

  if (engineMove && candidates.includes(engineMove)) {
    return { lan: engineMove, fallback: false };
  }

  // Math.min guards against an rng returning exactly 1.
  const index = Math.min(
    Math.floor(rng() * candidates.length),
    candidates.length - 1
  );
  return { lan: candidates[index], fallback: true };
}

export interface GameOverResult {
  isOver: boolean;
  reason?: string;
  winner?: PlayerSide | null;
}

/**
 * Detects if the game is over and determines the reason/winner.
 * Pure function - only reads from chess instance.
 */
export function detectGameOver(
  chess: Chess,
  currentSide: PlayerSide
): GameOverResult {
  if (!chess.isGameOver()) return { isOver: false };

  if (chess.isCheckmate()) {
    return { isOver: true, reason: EndReason.Checkmate, winner: currentSide };
  }
  if (chess.isStalemate()) {
    return { isOver: true, reason: EndReason.Stalemate, winner: null };
  }
  if (chess.isThreefoldRepetition()) {
    return { isOver: true, reason: EndReason.Threefold, winner: null };
  }
  if (chess.isInsufficientMaterial()) {
    return { isOver: true, reason: EndReason.Insufficient, winner: null };
  }
  return { isOver: true, reason: EndReason.DrawRule, winner: null };
}
