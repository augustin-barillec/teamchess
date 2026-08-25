import path from "path";

export const DISCONNECT_GRACE_MS = 20000;
export const STOCKFISH_SEARCH_DEPTH = 15;
/** How long a search may run before the engine is considered unusable for this turn. */
export const ENGINE_MOVE_TIMEOUT_MS = 10000;
export const TEAM_VOTE_DURATION_MS = 20000;

// Re-exported so server code has a single constants module to import from; the
// definitions live next door where the browser client can reach them too.
export {
  DEFAULT_CLOCK_TIME,
  INCREMENT_THRESHOLD,
  TIME_INCREMENT,
} from "./shared_constants.js";

export const stockfishPath = path.join(
  process.cwd(),
  "node_modules",
  "stockfish",
  "bin",
  "stockfish-18.js"
);
