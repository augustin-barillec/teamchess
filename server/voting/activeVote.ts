import type { IGameContext } from "../context/GameContext.js";
import { globalContext } from "../context/GlobalContextAdapter.js";
import type {
  InternalActiveVote,
  InternalTeamVote,
  InternalKickVote,
  InternalResetVote,
  PlayerSide,
  VoteType,
} from "../types.js";
import type { ActiveVoteState } from "../shared_types.js";
import { EndReason } from "../shared_types.js";
import {
  TEAM_VOTE_DURATION_MS,
  KICK_VOTE_DURATION_MS,
  RESET_VOTE_DURATION_MS,
} from "../constants.js";
import { sendSystemMessage } from "../utils/messaging.js";
import {
  checkTeamVotePrerequisites,
  createTeamVoteState,
  createMajorityVoteState,
} from "../core/voteLogic.js";
import { MSG } from "../shared_messages.js";
import { rosterOf, voterNames, currentVoteOf } from "./voteHelpers.js";

// Callback for ending the game (set by gameLogic to avoid circular dependency)
let endGameCallback: ((reason: string, winner: string | null) => void) | null =
  null;

export function setEndGameCallback(
  callback: (reason: string, winner: string | null) => void
): void {
  endGameCallback = callback;
}

/**
 * Gets the active vote formatted for a specific client, or null when no vote is running.
 * Personalizes `myVoteEligible`, `myCurrentVote` and `amTarget` per viewer.
 */
export function getVoteClientData(
  viewerPid: string,
  ctx: IGameContext = globalContext
): ActiveVoteState | null {
  const vote = ctx.gameState.activeVote;
  if (!vote) return null;

  const base = {
    yesVotes: voterNames(vote.yesVoters, vote.eligibleVoters),
    requiredVotes: vote.required,
    endTime: vote.endTime,
    myVoteEligible: vote.eligibleVoters.has(viewerPid),
  };

  switch (vote.kind) {
    case "team":
      return {
        kind: "team",
        side: vote.side,
        type: vote.type,
        ...base,
        noVotes: [],
        myCurrentVote: vote.yesVoters.has(viewerPid) ? "yes" : null,
      };
    case "kick":
      return {
        kind: "kick",
        targetId: vote.targetId,
        targetName: vote.targetName,
        totalVoters: vote.total,
        amTarget: vote.targetId === viewerPid,
        ...base,
        noVotes: voterNames(vote.noVoters, vote.eligibleVoters),
        myCurrentVote: currentVoteOf(viewerPid, vote.yesVoters, vote.noVoters),
      };
    case "reset":
      return {
        kind: "reset",
        totalVoters: vote.total,
        ...base,
        noVotes: voterNames(vote.noVoters, vote.eligibleVoters),
        myCurrentVote: currentVoteOf(viewerPid, vote.yesVoters, vote.noVoters),
      };
  }
}

/**
 * Broadcasts the active vote (or its absence) to all connected sockets.
 * Each client gets a personalized view.
 */
export function broadcastVote(ctx: IGameContext = globalContext): void {
  for (const socket of ctx.getAllSockets()) {
    const pid = socket.data.pid;
    if (pid) {
      socket.emit("vote_update", getVoteClientData(pid, ctx));
    }
  }
}

/**
 * Clears the active vote, whatever its kind.
 */
export function clearActiveVote(ctx: IGameContext = globalContext): void {
  const vote = ctx.gameState.activeVote;
  if (vote) {
    clearTimeout(vote.timer);
    ctx.gameState.activeVote = undefined;
    broadcastVote(ctx);
  }
}

function voteFailedMessage(vote: InternalActiveVote): string {
  switch (vote.kind) {
    case "team":
      return MSG.teamVoteFailed(vote.type);
    case "kick":
      return MSG.kickVoteFailed(vote.targetName);
    case "reset":
      return MSG.resetVoteFailed;
  }
}

/** An active vote before its timer is armed (plain Omit would collapse the union). */
type PendingVote =
  | Omit<InternalTeamVote, "timer" | "endTime">
  | Omit<InternalKickVote, "timer" | "endTime">
  | Omit<InternalResetVote, "timer" | "endTime">;

/**
 * Installs a vote in the single active-vote slot: arms its expiration timer and
 * broadcasts it. The caller must have checked the slot is free.
 */
function installVote(
  vote: PendingVote,
  durationMs: number,
  ctx: IGameContext
): void {
  const { gameState, io } = ctx;

  const fullVote = {
    ...vote,
    endTime: Date.now() + durationMs,
    timer: setTimeout(() => {
      gameState.activeVote = undefined;
      sendSystemMessage(voteFailedMessage(fullVote), ctx);

      // If accept_draw fails by timeout, reject the offer
      if (fullVote.kind === "team" && fullVote.type === "accept_draw") {
        gameState.drawOffer = undefined;
        io.emit("draw_offer_update", { side: null });
      }

      broadcastVote(ctx);
    }, durationMs),
  } as InternalActiveVote;

  gameState.activeVote = fullVote;
  broadcastVote(ctx);
}

/**
 * Starts or auto-executes a team vote (resign / offer_draw / accept_draw).
 * Solo teams skip the vote and execute directly, except when system-triggered.
 */
export function startTeamVote(
  side: PlayerSide,
  type: VoteType,
  initiatorId: string,
  ctx: IGameContext = globalContext
): { error?: string } {
  const { gameState, io, sessions } = ctx;
  const isSystemTriggered = initiatorId === "system";

  if (gameState.activeVote) {
    return { error: MSG.errorVoteInProgress };
  }

  // Snapshot connected team members (pid -> name) as the vote's frozen electorate
  const teamRoster = rosterOf(ctx.getActiveTeamPids(side), sessions);

  const prereq = checkTeamVotePrerequisites(
    type,
    teamRoster.size,
    isSystemTriggered,
    gameState.drawOffer,
    side
  );

  if (!prereq.canStartVote && !prereq.shouldAutoExecute) {
    return {};
  }

  // AUTO-EXECUTE for single player
  if (prereq.shouldAutoExecute) {
    if (type === "resign") {
      const winner = side === "white" ? "black" : "white";
      if (endGameCallback) endGameCallback(EndReason.Resignation, winner);
    } else if (type === "offer_draw") {
      gameState.drawOffer = side;
      io.emit("draw_offer_update", { side });

      // Trigger vote for other side
      const otherSide = side === "white" ? "black" : "white";
      startTeamVote(otherSide, "accept_draw", "system", ctx);
    } else if (type === "accept_draw") {
      if (endGameCallback) endGameCallback(EndReason.DrawAgreement, null);
    }
    return {};
  }

  const core = createTeamVoteState(
    type,
    initiatorId,
    teamRoster,
    isSystemTriggered
  );
  installVote({ kind: "team", side, ...core }, TEAM_VOTE_DURATION_MS, ctx);

  return {};
}

/**
 * Starts a kick vote against a target player. The target counts toward the majority
 * threshold but cannot vote.
 */
export function startKickVote(
  initiatorId: string,
  targetId: string,
  targetName: string,
  ctx: IGameContext = globalContext
): { error?: string } {
  const { gameState } = ctx;

  if (gameState.activeVote) {
    return { error: MSG.errorVoteInProgress };
  }
  if (initiatorId === targetId) {
    return { error: MSG.errorCannotKickSelf };
  }

  // Snapshot all connected players (pid -> name) as the vote's frozen electorate
  const allConnected = rosterOf(ctx.getOnlinePids(), ctx.sessions);
  const eligibleVoters = new Map(allConnected);
  eligibleVoters.delete(targetId);

  const core = createMajorityVoteState(
    initiatorId,
    eligibleVoters,
    allConnected.size
  );
  installVote(
    { kind: "kick", targetId, targetName, ...core },
    KICK_VOTE_DURATION_MS,
    ctx
  );

  return {};
}

/**
 * Starts a reset vote among all connected players.
 * Returns { passedImmediately: true } when solo player (1/1 majority).
 */
export function startResetVote(
  initiatorId: string,
  ctx: IGameContext = globalContext
): { error?: string; passedImmediately?: boolean } {
  const { gameState } = ctx;

  if (gameState.activeVote) {
    return { error: MSG.errorVoteInProgress };
  }

  // Snapshot all connected players (pid -> name) as the vote's frozen electorate
  const allConnected = rosterOf(ctx.getOnlinePids(), ctx.sessions);
  const core = createMajorityVoteState(initiatorId, allConnected);

  // Solo player: 1/1 = majority, pass immediately
  if (core.yesVoters.size >= core.required) {
    return { passedImmediately: true };
  }

  installVote({ kind: "reset", ...core }, RESET_VOTE_DURATION_MS, ctx);

  return {};
}
