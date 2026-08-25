// Game constants shared by the server and the browser client. Kept apart from
// `constants.ts` because that one reaches for `path` to locate Stockfish, which
// no bundle for the browser can follow — the client imports this file directly.

/** Default clock time per side in seconds (10 minutes) */
export const DEFAULT_CLOCK_TIME = 600;

/**
 * Time threshold (seconds) at or below which increment is awarded — and, on the
 * client, at or below which the clock switches to its low-time styling. One
 * number, so the warning can never appear on a clock that is not yet earning.
 */
export const INCREMENT_THRESHOLD = 60;

/** Seconds added per move when time is at or below INCREMENT_THRESHOLD */
export const TIME_INCREMENT = 10;
