import { Engine } from "../types.js";
import {
  stockfishPath,
  STOCKFISH_SEARCH_DEPTH,
  ENGINE_MOVE_TIMEOUT_MS,
} from "../constants.js";
import { loadEngine } from "./engine-loader.js";

export function createEngine(): Engine {
  const engine = loadEngine(stockfishPath);
  engine.send("uci");
  return engine;
}

/**
 * Asks the engine which candidate to play. Resolves null when it cannot answer — silent
 * past ENGINE_MOVE_TIMEOUT_MS — leaving the choice to the caller.
 */
export async function chooseBestMove(
  engine: Engine,
  fen: string,
  candidates: string[]
): Promise<string | null> {
  if (new Set(candidates).size <= 1) {
    return candidates[0] ?? null;
  }
  return new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => {
      // Unblock the search so its late bestmove cannot answer the next one.
      engine.send("stop");
      resolve(null);
    }, ENGINE_MOVE_TIMEOUT_MS);

    engine.send(`position fen ${fen}`);
    const goCommand = `go depth ${STOCKFISH_SEARCH_DEPTH} searchmoves ${candidates.join(
      " "
    )}`;
    engine.send(goCommand, (output: string) => {
      if (output.startsWith("bestmove")) {
        clearTimeout(timer);
        resolve(output.split(" ")[1]);
      }
    });
  });
}
