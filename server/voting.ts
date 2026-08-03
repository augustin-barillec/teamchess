import type {
  InternalActiveVote,
  InternalTeamVote,
  InternalKickVote,
  InternalResetVote,
  PlayerSide,
  VoteType,
} from "./types.js";
import type { ActiveVoteState } from "./shared_types.js";
import { EndReason } from "./shared_types.js";
import {
  TEAM_VOTE_DURATION_MS,
  KICK_VOTE_DURATION_MS,
  RESET_VOTE_DURATION_MS,
} from "./constants.js";
import {
  sessions,
  getGameState,
  getIO,
  getAllSockets,
  getActiveTeamPids,
  getOnlinePids,
} from "./state.js";
import { sendSystemMessage } from "./utils/messaging.js";
import { MSG } from "./shared_messages.js";
import { endGame, executeGameReset } from "./game/gameLogic.js";
import { executeKick } from "./players/playerManager.js";

/**
 * The single active-vote slot: only one vote of any kind can run at a time.
 *
 * The electorate is frozen when the vote is created: `eligibleVoters` maps every
 * voter to the name they had at that instant, and neither it nor `required`
 * changes afterwards, whoever joins or leaves. A voter who leaves mid-vote keeps
 * both their recorded ballot and the name the vote recorded for them.
 *
 * Two rule sets:
 * - Team votes (resign / offer_draw / accept_draw): unanimity, yes-only — a
 *   single "no" fails the vote instantly.
 * - Majority votes (kick / reset): strict majority (floor(total/2) + 1), voters
 *   may switch between yes and no until the outcome is decided.
 */

/** Snapshots pids as pid -> name, to freeze a vote's electorate at creation. */
function rosterOf(pids: Set<string>): Map<string, string> {
  return new Map(
    [...pids].map((pid) => [pid, sessions.get(pid)?.name || "Unknown"])
  );
}

/**
 * Resolves voter names from the vote's own frozen roster, not from live
 * sessions: a voter who has since disconnected or been kicked is still
 * displayed under the name they voted with.
 */
function voterNames(
  pids: Set<string>,
  roster: ReadonlyMap<string, string>
): string[] {
  return [...pids].map((pid) => roster.get(pid) || "Unknown");
}

function currentVoteOf(
  pid: string,
  vote: InternalKickVote | InternalResetVote
): "yes" | "no" | null {
  if (vote.yesVoters.has(pid)) return "yes";
  if (vote.noVoters.has(pid)) return "no";
  return null;
}

/**
 * Gets the active vote formatted for a specific client, or null when no vote is
 * running. Personalizes `myVoteEligible`, `myCurrentVote` and `amTarget`.
 */
export function getVoteClientData(viewerPid: string): ActiveVoteState | null {
  const vote = getGameState().activeVote;
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
        myCurrentVote: currentVoteOf(viewerPid, vote),
      };
    case "reset":
      return {
        kind: "reset",
        totalVoters: vote.total,
        ...base,
        noVotes: voterNames(vote.noVoters, vote.eligibleVoters),
        myCurrentVote: currentVoteOf(viewerPid, vote),
      };
  }
}

/**
 * Broadcasts the active vote (or its absence) to all connected sockets.
 * Each client gets a personalized view.
 */
export function broadcastVote(): void {
  for (const socket of getAllSockets()) {
    const pid = socket.data.pid;
    if (pid) {
      socket.emit("vote_update", getVoteClientData(pid));
    }
  }
}

/**
 * Clears the active vote, whatever its kind.
 */
export function clearActiveVote(): void {
  const gameState = getGameState();
  const vote = gameState.activeVote;
  if (vote) {
    clearTimeout(vote.timer);
    gameState.activeVote = undefined;
    broadcastVote();
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

/**
 * Fails the active vote (explicit "no" on a team vote, unreachable majority, or
 * timeout): clears it, announces it, and rejects a pending draw offer.
 */
function failVote(vote: InternalActiveVote): void {
  const gameState = getGameState();
  clearTimeout(vote.timer);
  gameState.activeVote = undefined;

  sendSystemMessage(voteFailedMessage(vote));

  if (vote.kind === "team" && vote.type === "accept_draw") {
    gameState.drawOffer = undefined;
    getIO().emit("draw_offer_update", { side: null });
  }

  broadcastVote();
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
function installVote(vote: PendingVote, durationMs: number): void {
  const fullVote = {
    ...vote,
    endTime: Date.now() + durationMs,
    timer: setTimeout(() => failVote(fullVote), durationMs),
  } as InternalActiveVote;

  getGameState().activeVote = fullVote;
  broadcastVote();
}

function executeTeamVoteResult(side: PlayerSide, type: VoteType): void {
  const gameState = getGameState();
  const otherSide = side === "white" ? "black" : "white";

  if (type === "resign") {
    endGame(EndReason.Resignation, otherSide);
  } else if (type === "offer_draw") {
    gameState.drawOffer = side;
    getIO().emit("draw_offer_update", { side });
    // The other side now votes on accepting
    startTeamVote(otherSide, "accept_draw", "system");
  } else if (type === "accept_draw") {
    endGame(EndReason.DrawAgreement, null);
  }
}

/**
 * Starts or auto-executes a team vote (resign / offer_draw / accept_draw).
 * Solo teams skip the vote and execute directly, except when system-triggered.
 */
export function startTeamVote(
  side: PlayerSide,
  type: VoteType,
  initiatorId: string
): { error?: string } {
  const gameState = getGameState();
  const isSystemTriggered = initiatorId === "system";

  if (gameState.activeVote) {
    return { error: MSG.errorVoteInProgress };
  }

  // Prerequisites: a draw can only be accepted against a live offer from the
  // other side, and only offered once.
  if (
    type === "accept_draw" &&
    (!gameState.drawOffer || gameState.drawOffer === side)
  ) {
    return {};
  }
  if (type === "offer_draw" && gameState.drawOffer) {
    return {};
  }

  // Snapshot connected team members (pid -> name) as the vote's frozen electorate
  const teamRoster = rosterOf(getActiveTeamPids(side));

  // Solo team: skip the vote and execute directly
  if (teamRoster.size <= 1 && !isSystemTriggered) {
    executeTeamVoteResult(side, type);
    return {};
  }

  installVote(
    {
      kind: "team",
      side,
      type,
      initiatorId,
      yesVoters: isSystemTriggered ? new Set() : new Set([initiatorId]),
      eligibleVoters: teamRoster,
      required: teamRoster.size,
    },
    TEAM_VOTE_DURATION_MS
  );

  return {};
}

/**
 * Starts a kick vote against a target player. The target counts toward the
 * majority threshold but cannot vote.
 */
export function startKickVote(
  initiatorId: string,
  targetId: string,
  targetName: string
): { error?: string } {
  const gameState = getGameState();

  if (gameState.activeVote) {
    return { error: MSG.errorVoteInProgress };
  }
  if (initiatorId === targetId) {
    return { error: MSG.errorCannotKickSelf };
  }

  // Snapshot all connected players (pid -> name) as the vote's frozen electorate
  const allConnected = rosterOf(getOnlinePids());
  const eligibleVoters = new Map(allConnected);
  eligibleVoters.delete(targetId);

  installVote(
    {
      kind: "kick",
      targetId,
      targetName,
      initiatorId,
      yesVoters: new Set([initiatorId]),
      noVoters: new Set(),
      eligibleVoters,
      required: Math.floor(allConnected.size / 2) + 1,
      total: allConnected.size,
    },
    KICK_VOTE_DURATION_MS
  );

  return {};
}

/**
 * Starts a reset vote among all connected players.
 * Returns { passedImmediately: true } when solo player (1/1 majority).
 */
export function startResetVote(initiatorId: string): {
  error?: string;
  passedImmediately?: boolean;
} {
  const gameState = getGameState();

  if (gameState.activeVote) {
    return { error: MSG.errorVoteInProgress };
  }

  // Snapshot all connected players (pid -> name) as the vote's frozen electorate
  const allConnected = rosterOf(getOnlinePids());

  // Solo player: 1/1 = majority, pass immediately
  if (allConnected.size <= 1) {
    return { passedImmediately: true };
  }

  installVote(
    {
      kind: "reset",
      initiatorId,
      yesVoters: new Set([initiatorId]),
      noVoters: new Set(),
      eligibleVoters: allConnected,
      required: Math.floor(allConnected.size / 2) + 1,
      total: allConnected.size,
    },
    RESET_VOTE_DURATION_MS
  );

  return {};
}

/**
 * Applies a yes/no ballot to whatever vote is currently active. Eligibility is
 * decided solely by the vote's frozen electorate. Executes the outcome when the
 * ballot decides the vote.
 */
export function castVote(
  voterId: string,
  choice: "yes" | "no"
): { error?: string } {
  const vote = getGameState().activeVote;
  if (!vote) return {};

  if (!vote.eligibleVoters.has(voterId)) {
    return { error: MSG.errorNotEligible };
  }

  if (vote.kind === "team") {
    // Unanimity: a single "no" fails the vote instantly
    if (choice === "no") {
      failVote(vote);
      return {};
    }
    if (vote.yesVoters.has(voterId)) return {};
    vote.yesVoters.add(voterId);

    if (vote.yesVoters.size >= vote.required) {
      clearActiveVote();
      executeTeamVoteResult(vote.side, vote.type);
    } else {
      broadcastVote();
    }
    return {};
  }

  // Majority votes (kick / reset): voters may switch sides
  if (choice === "yes") {
    if (vote.yesVoters.has(voterId)) return {};
    vote.noVoters.delete(voterId);
    vote.yesVoters.add(voterId);

    if (vote.yesVoters.size >= vote.required) {
      clearActiveVote();
      if (vote.kind === "kick") executeKick(vote.targetId, vote.targetName);
      else executeGameReset();
      return {};
    }
  } else {
    if (vote.noVoters.has(voterId)) return {};
    vote.yesVoters.delete(voterId);
    vote.noVoters.add(voterId);

    // Fail as soon as a majority becomes unreachable
    if (vote.eligibleVoters.size - vote.noVoters.size < vote.required) {
      failVote(vote);
      return {};
    }
  }

  broadcastVote();
  return {};
}
