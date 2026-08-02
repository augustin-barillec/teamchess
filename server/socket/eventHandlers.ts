import { Socket } from "socket.io";
import { Chess } from "chess.js";
import type { IGameContext } from "../context/GameContext.js";
import { globalContext } from "../context/GlobalContextAdapter.js";
import { GameStatus, VoteType, EndReason } from "../types.js";
import { broadcastPlayers, sendSystemMessage } from "../utils/messaging.js";
import { tryFinalizeTurn, endIfOneSided, endGame } from "../game/gameLogic.js";
import { startClock } from "../game/clock.js";
import {
  broadcastVote,
  clearActiveVote,
  startTeamVote,
  startKickVote,
  startResetVote,
} from "../voting/activeVote.js";
import { createEngine } from "../engine/stockfish.js";
import { processTeamVote, processMajorityVote } from "../core/voteLogic.js";
import { executeKick } from "../players/playerManager.js";
import { DEFAULT_CLOCK_TIME } from "../constants.js";
import { MSG } from "../shared_messages.js";

export function handleSetName(
  socket: Socket,
  name: string,
  ctx: IGameContext = globalContext
): void {
  const pid = socket.data.pid;
  const newName = name.trim().slice(0, 30);
  if (newName) {
    const sess = ctx.sessions.get(pid);
    if (sess) {
      sess.name = newName;
      socket.data.name = newName;
      broadcastPlayers(ctx);
      socket.emit("session", { id: pid, name: sess.name });
    }
  }
}

export function handleJoinSide(
  socket: Socket,
  side: "white" | "black" | "spectator",
  cb?: (res: { success?: boolean; error?: string }) => void,
  ctx: IGameContext = globalContext
): void {
  const pid = socket.data.pid;
  const { gameState, sessions } = ctx;
  const currentSess = sessions.get(pid);
  if (!currentSess) return;

  const prevSide = currentSess.side;
  currentSess.side = side;
  socket.data.side = side;

  if (gameState.status !== GameStatus.Setup) {
    if (prevSide === "white") gameState.whiteIds.delete(pid);
    else if (prevSide === "black") gameState.blackIds.delete(pid);

    if (side === "white") gameState.whiteIds.add(pid);
    else if (side === "black") gameState.blackIds.add(pid);

    endIfOneSided(ctx);
  }

  broadcastPlayers(ctx);
  tryFinalizeTurn(ctx);

  cb?.({ success: true });
}

export function handleResetGame(
  socket: Socket,
  cb?: (res: { success?: boolean; error?: string }) => void,
  ctx: IGameContext = globalContext
): void {
  const result = startResetVote(socket.data.pid, ctx);

  if (result.error) {
    return cb?.({ error: result.error });
  }

  if (result.passedImmediately) {
    executeGameReset(ctx);
  }

  cb?.({ success: true });
}

export function executeGameReset(ctx: IGameContext = globalContext): void {
  const { gameState, io } = ctx;

  if (gameState.timerInterval) clearInterval(gameState.timerInterval);
  const engine = createEngine();

  ctx.resetGame(engine);

  sendSystemMessage(MSG.gameReset, ctx);
  io.emit("game_reset");
  io.emit("clock_update", {
    whiteTime: DEFAULT_CLOCK_TIME,
    blackTime: DEFAULT_CLOCK_TIME,
  });
  broadcastVote(ctx);
}

export function handlePlayMove(
  socket: Socket,
  lan: string,
  cb?: (res: { error?: string }) => void,
  ctx: IGameContext = globalContext
): void {
  const pid = socket.data.pid;
  const { gameState, io, sessions } = ctx;

  if (gameState.status === GameStatus.Setup) {
    if (socket.data.side !== "white") {
      return cb?.({ error: MSG.errorOnlyWhiteStart });
    }

    const whites = new Set<string>();
    const blacks = new Set<string>();
    for (const s of sessions.values()) {
      if (s.side === "white") whites.add(s.pid);
      else if (s.side === "black") blacks.add(s.pid);
    }

    if (blacks.size === 0) {
      return cb?.({ error: MSG.errorBothTeamsRequired });
    }

    gameState.status = GameStatus.AwaitingProposals;
    gameState.whiteIds = whites;
    gameState.blackIds = blacks;

    io.emit("game_started", {
      moveNumber: 1,
      side: "white",
      proposals: [],
    });
    io.emit("position_update", { fen: gameState.chess.fen() });
    startClock(ctx);
  } else if (gameState.status !== GameStatus.AwaitingProposals) {
    return cb?.({ error: MSG.errorNotAccepting });
  }

  const active =
    gameState.side === "white" ? gameState.whiteIds : gameState.blackIds;
  if (!active.has(pid)) return cb?.({ error: MSG.errorNotYourTurn });
  if (gameState.proposals.has(pid))
    return cb?.({ error: MSG.errorAlreadyMoved });

  let move;
  try {
    const tempChess = new Chess(gameState.chess.fen());
    move = tempChess.move(lan);
  } catch (_e) {
    return cb?.({ error: MSG.errorIllegalFormat });
  }

  if (!move) return cb?.({ error: MSG.errorIllegalMove });

  gameState.proposals.set(pid, {
    lan,
    san: move.san,
    name: socket.data.name,
  });

  io.emit("move_submitted", {
    id: pid,
    name: socket.data.name,
    moveNumber: gameState.moveNumber,
    side: gameState.side,
    lan,
    san: move.san,
  });

  tryFinalizeTurn(ctx);
  cb?.({});
}

export function handleChatMessage(
  socket: Socket,
  message: string,
  ctx: IGameContext = globalContext
): void {
  const pid = socket.data.pid;

  if (!message.trim()) return;
  ctx.io.emit("chat_message", {
    sender: socket.data.name,
    senderId: pid,
    message: message.trim(),
  });
}

export function handleStartTeamVote(
  socket: Socket,
  type: VoteType,
  ctx: IGameContext = globalContext
): void {
  const { gameState } = ctx;

  if (socket.data.side !== "white" && socket.data.side !== "black") return;
  if (gameState.status !== GameStatus.AwaitingProposals) return;

  const result = startTeamVote(socket.data.side, type, socket.data.pid, ctx);

  if (result.error) {
    socket.emit("error", { message: result.error });
  }
}

export function handleStartKickVote(
  socket: Socket,
  targetId: string,
  ctx: IGameContext = globalContext
): void {
  const { sessions } = ctx;
  const initiatorPid = socket.data.pid;

  // Validate target exists
  const targetSess = sessions.get(targetId);
  if (!targetSess) {
    socket.emit("error", { message: MSG.errorTargetNotFound });
    return;
  }

  const result = startKickVote(initiatorPid, targetId, targetSess.name, ctx);

  if (result.error) {
    socket.emit("error", { message: result.error });
  }
}

/**
 * Applies a yes/no ballot to whatever vote is currently active.
 * Eligibility is decided solely by the vote's frozen electorate.
 */
export function handleCastVote(
  socket: Socket,
  vote: "yes" | "no",
  ctx: IGameContext = globalContext
): void {
  const pid = socket.data.pid;
  const { gameState, io } = ctx;

  const currentVote = gameState.activeVote;
  if (!currentVote) return;

  if (currentVote.kind === "team") {
    const voteResult = processTeamVote(currentVote, pid, vote);

    if (voteResult.ineligible) {
      socket.emit("error", { message: MSG.errorNotEligible });
      return;
    }

    if (voteResult.failed) {
      clearActiveVote(ctx);
      sendSystemMessage(MSG.teamVoteFailed(currentVote.type), ctx);

      // Explicitly reject draw if it was an accept_draw vote
      if (currentVote.type === "accept_draw") {
        gameState.drawOffer = undefined;
        io.emit("draw_offer_update", { side: null });
      }
    } else if (voteResult.updatedYesVoters) {
      currentVote.yesVoters = voteResult.updatedYesVoters;

      if (voteResult.passed) {
        clearActiveVote(ctx);

        if (currentVote.type === "resign") {
          const winner = currentVote.side === "white" ? "black" : "white";
          endGame(EndReason.Resignation, winner, ctx);
        } else if (currentVote.type === "offer_draw") {
          gameState.drawOffer = currentVote.side;
          io.emit("draw_offer_update", { side: currentVote.side });

          // Trigger vote for other side
          const otherSide = currentVote.side === "white" ? "black" : "white";
          startTeamVote(otherSide, "accept_draw", "system", ctx);
        } else if (currentVote.type === "accept_draw") {
          endGame(EndReason.DrawAgreement, null, ctx);
        }
      } else {
        broadcastVote(ctx);
      }
    }
    return;
  }

  // Majority votes: kick & reset
  const voteResult = processMajorityVote(currentVote, pid, vote);

  if (voteResult.ineligible) {
    socket.emit("error", { message: MSG.errorNotEligible });
    return;
  }

  if (voteResult.updatedYesVoters)
    currentVote.yesVoters = voteResult.updatedYesVoters;
  if (voteResult.updatedNoVoters)
    currentVote.noVoters = voteResult.updatedNoVoters;

  if (voteResult.passed) {
    clearActiveVote(ctx);
    if (currentVote.kind === "kick") {
      executeKick(currentVote.targetId, currentVote.targetName, ctx);
    } else {
      executeGameReset(ctx);
    }
  } else if (voteResult.failed) {
    clearActiveVote(ctx);
    sendSystemMessage(
      currentVote.kind === "kick"
        ? MSG.kickVoteFailed(currentVote.targetName)
        : MSG.resetVoteFailed,
      ctx
    );
  } else if (voteResult.updatedYesVoters || voteResult.updatedNoVoters) {
    broadcastVote(ctx);
  }
}
