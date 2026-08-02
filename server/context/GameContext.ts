import { Chess } from "chess.js";
import type { Session, GameState, Engine, PlayerSide } from "../types.js";
import { GameStatus } from "../shared_types.js";
import { DEFAULT_CLOCK_TIME } from "../constants.js";

/**
 * Minimal socket interface for dependency injection.
 * Allows both real Socket.io sockets and mock sockets in tests.
 */
export interface ISocket {
  data: { pid?: string; side?: string; name?: string };
  emit: (event: string, data?: unknown) => void;
}

/**
 * Minimal IO interface for dependency injection.
 */
export interface IIO {
  emit: (event: string, data?: unknown) => void;
  sockets: {
    sockets: Map<string, ISocket>;
  };
  // Handler parameter is broad to accept both real Socket.IO sockets and ISocket in tests
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: (event: string, handler: (socket: any) => void) => void;
}

/**
 * Interface for the game context - the central dependency injection container.
 * All modules that need access to game state, sessions, or IO should depend on this interface.
 */
export interface IGameContext {
  readonly sessions: Map<string, Session>;
  readonly gameState: GameState;
  readonly io: IIO;

  updateGameState(updates: Partial<GameState>): void;
  resetGame(engine: Engine): void;
  getOnlinePids(): Set<string>;
  getActiveTeamPids(side: PlayerSide): Set<string>;
  getSocketsBySide(side: PlayerSide): ISocket[];
  getAllSockets(): ISocket[];
}

/**
 * Clears all active timers on a game state to prevent leaked callbacks.
 */
export function clearGameStateTimers(state: GameState): void {
  if (state.timerInterval) clearInterval(state.timerInterval);
  if (state.activeVote?.timer) clearTimeout(state.activeVote.timer);
}

/**
 * Creates initial game state for a new game.
 */
export function createInitialGameState(engine: Engine): GameState {
  return {
    whiteIds: new Set(),
    blackIds: new Set(),
    moveNumber: 1,
    side: "white",
    proposals: new Map(),
    whiteTime: DEFAULT_CLOCK_TIME,
    blackTime: DEFAULT_CLOCK_TIME,
    timerInterval: undefined,
    engine,
    chess: new Chess(),
    status: GameStatus.Setup,
    endReason: undefined,
    endWinner: undefined,
    drawOffer: undefined,
    activeVote: undefined,
    blacklist: new Set(),
  };
}
