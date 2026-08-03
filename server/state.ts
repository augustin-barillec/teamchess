import { Server, Socket } from "socket.io";
import { Chess } from "chess.js";
import type { Session, GameState, Engine, PlayerSide } from "./types.js";
import { GameStatus } from "./shared_types.js";
import { DEFAULT_CLOCK_TIME } from "./constants.js";

/**
 * The server hosts exactly one game, so the whole state lives in this module:
 * the sessions map, the game state and the Socket.IO server instance.
 */

export const sessions = new Map<string, Session>();

let gameState: GameState;
let io: Server;

export function getGameState(): GameState {
  return gameState;
}

export function setGameState(state: GameState): void {
  gameState = state;
}

export function getIO(): Server {
  return io;
}

export function setIO(server: Server): void {
  io = server;
}

export function createInitialGameState(engine: Engine): GameState {
  return {
    generation: 0,
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
    endMessage: undefined,
    drawOffer: undefined,
    activeVote: undefined,
    blacklist: new Set(),
  };
}

/**
 * Resets the game in place: the GameState object identity is preserved, so any
 * closure still holding a reference (e.g. a pending engine callback) observes
 * the reset instead of a stale pre-reset copy. `generation` is bumped so such
 * callbacks can detect that their turn no longer exists; `blacklist` survives
 * so kicked players stay kicked across resets.
 */
export function resetGameState(engine: Engine): void {
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);
  if (gameState.activeVote) clearTimeout(gameState.activeVote.timer);

  const fresh = createInitialGameState(engine);
  fresh.generation = gameState.generation + 1;
  fresh.blacklist = gameState.blacklist;
  Object.assign(gameState, fresh);
}

// --- Presence helpers ---

export function getOnlinePids(): Set<string> {
  const pids = new Set<string>();
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.pid) pids.add(socket.data.pid);
  }
  return pids;
}

export function getActiveTeamPids(side: PlayerSide): Set<string> {
  const onlinePids = getOnlinePids();
  const teamIds = side === "white" ? gameState.whiteIds : gameState.blackIds;
  return new Set([...teamIds].filter((pid) => onlinePids.has(pid)));
}

export function getAllSockets(): Socket[] {
  return [...io.sockets.sockets.values()];
}
