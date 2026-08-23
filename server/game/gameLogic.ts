import {
  getGameState,
  getIO,
  getActiveTeamPids,
  resetGameState,
} from "../state.js";
import { GameStatus, EndReason, Proposal } from "../types.js";
import { reasonMessages, gameOverFallback, MSG } from "../shared_messages.js";
import { getCleanPgn } from "../utils/pgn.js";
import { broadcastPlayers, sendSystemMessage } from "../utils/messaging.js";
import { clearActiveVote, broadcastVote } from "../voting.js";
import { startClock, stopClock } from "./clock.js";
import { chooseBestMove, createEngine } from "../engine/stockfish.js";
import {
  shouldFinalizeTurn,
  calculateIncrement,
  detectGameOver,
  resolveSelectedMove,
} from "../core/turnLogic.js";
import { shouldEndDueToAbandonment } from "../core/playerLogic.js";
import { DEFAULT_CLOCK_TIME } from "../constants.js";

/**
 * Ends the game with a given reason and optional winner.
 */
export function endGame(reason: string, winner: string | null = null): void {
  const gameState = getGameState();
  const io = getIO();

  if (gameState.status === GameStatus.Over) return;
  // Invalidate any in-flight engine callback (see tryFinalizeTurn)
  gameState.generation++;
  stopClock();

  // A team vote is meaningless once the game is over
  clearActiveVote();

  gameState.engine.quit();
  gameState.status = GameStatus.Over;
  gameState.endReason = reason;
  gameState.endWinner = winner;

  const message = reasonMessages[reason]
    ? reasonMessages[reason](winner)
    : gameOverFallback(winner);
  gameState.endMessage = message;

  sendSystemMessage(message);
  broadcastPlayers();

  gameState.drawOffer = undefined;
  const pgn = getCleanPgn(gameState.chess);
  io.emit("game_over", { reason, winner, pgn, message });
  io.emit("draw_offer_update", { side: null });
}

/**
 * Resets the game in place (same GameState object) with a fresh engine.
 */
export function executeGameReset(): void {
  const gameState = getGameState();
  const io = getIO();

  // The old engine may still be running (reset mid-game): kill it before replacing
  gameState.engine.quit();
  resetGameState(createEngine());

  sendSystemMessage(MSG.gameReset);
  io.emit("game_reset");
  io.emit("clock_update", {
    whiteTime: DEFAULT_CLOCK_TIME,
    blackTime: DEFAULT_CLOCK_TIME,
  });
  broadcastVote();
}

/**
 * Attempts to finalize the current turn if all active players have submitted moves.
 */
export function tryFinalizeTurn(): void {
  const gameState = getGameState();
  const io = getIO();

  const activeTeamPids = getActiveTeamPids(gameState.side);
  if (
    !shouldFinalizeTurn(
      gameState.status,
      activeTeamPids,
      gameState.proposals.keys()
    )
  ) {
    return;
  }

  gameState.status = GameStatus.FinalizingTurn;
  io.emit("game_status_update", { status: gameState.status });

  stopClock();

  const allEntries = [...gameState.proposals.entries()];
  const candidatesStr = allEntries.map(([, { lan }]) => lan);
  const candidatesObjs: Proposal[] = allEntries.map(([id, val]) => ({
    id,
    name: val.name,
    moveNumber: gameState.moveNumber,
    side: gameState.side,
    lan: val.lan,
    san: val.san,
  }));

  const currentFen = gameState.chess.fen();

  // A game end or reset during the engine search bumps `generation`: the position
  // this search was started on no longer exists, so its answer must be dropped.
  const generation = gameState.generation;
  const isStale = () =>
    gameState.generation !== generation ||
    gameState.status !== GameStatus.FinalizingTurn;

  chooseBestMove(gameState.engine, currentFen, candidatesStr)
    .then((engineMove) => {
      if (isStale()) return;

      const selected = resolveSelectedMove(engineMove, candidatesStr);

      if (!selected) {
        // Nothing to play: hand the turn back instead of freezing on FinalizingTurn.
        gameState.status = GameStatus.AwaitingProposals;
        io.emit("game_status_update", { status: gameState.status });
        startClock();
        return;
      }

      if (selected.fallback) sendSystemMessage(MSG.engineFallback);

      const selLan = selected.lan;
      const from = selLan.slice(0, 2);
      const to = selLan.slice(2, 4);

      const params: { from: string; to: string; promotion?: string } = {
        from,
        to,
      };
      if (selLan.length === 5) params.promotion = selLan[4];

      const move = gameState.chess.move(params);
      if (!move) {
        console.error(
          `CRITICAL: Illegal move. FEN: ${currentFen}, Move: ${selLan}`
        );
        return;
      }
      const fen = gameState.chess.fen();

      const currentTime =
        gameState.side === "white" ? gameState.whiteTime : gameState.blackTime;
      const increment = calculateIncrement(currentTime);

      if (gameState.side === "white") gameState.whiteTime += increment;
      else gameState.blackTime += increment;

      io.emit("clock_update", {
        whiteTime: gameState.whiteTime,
        blackTime: gameState.blackTime,
      });

      const winnerEntry = allEntries.find(([, val]) => val.lan === selLan);
      const winnerId = winnerEntry ? winnerEntry[0] : "unknown";
      const winnerName = winnerEntry ? winnerEntry[1].name : "TeamChess";

      io.emit("move_selected", {
        id: winnerId,
        name: winnerName,
        moveNumber: gameState.moveNumber,
        side: gameState.side,
        lan: selLan,
        san: move.san,
        fen,
        candidates: candidatesObjs,
      });

      const gameOverResult = detectGameOver(gameState.chess, gameState.side);

      if (gameOverResult.isOver) {
        endGame(gameOverResult.reason!, gameOverResult.winner ?? null);
      } else {
        gameState.proposals.clear();
        gameState.side = gameState.side === "white" ? "black" : "white";
        gameState.moveNumber++;
        gameState.status = GameStatus.AwaitingProposals;
        io.emit("turn_change", {
          moveNumber: gameState.moveNumber,
          side: gameState.side,
        });
        io.emit("game_status_update", { status: gameState.status });
        io.emit("position_update", { fen });
        startClock();
      }
    })
    .catch((e) => {
      console.error(
        `CRITICAL: Engine error. FEN: ${currentFen}, Candidates: ${candidatesStr}`,
        e
      );
      if (isStale()) return;
      gameState.status = GameStatus.AwaitingProposals;
      gameState.proposals.clear();
      io.emit("game_status_update", { status: gameState.status });
      sendSystemMessage(MSG.systemError);
    });
}

/**
 * Ends the game if one side has no remaining players.
 */
export function endIfOneSided(): void {
  const gameState = getGameState();

  if (
    gameState.status === GameStatus.Setup ||
    gameState.status === GameStatus.Over
  )
    return;

  const result = shouldEndDueToAbandonment(
    gameState.whiteIds,
    gameState.blackIds
  );

  if (result.shouldEnd) {
    endGame(EndReason.Abandonment, result.winner ?? null);
  }
}
