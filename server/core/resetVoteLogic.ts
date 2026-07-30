import { MSG } from "../shared_messages.js";
import { processMajorityVote, type MajorityVoteResult } from "./voteLogic.js";

/** Frozen electorate, as in {@link import("./voteLogic.js").VoteState}: `eligibleVoters`
 * carries each voter's name as of vote creation and never changes afterwards. */
export interface ResetVoteState {
  initiatorId: string;
  yesVoters: Set<string>;
  noVoters: Set<string>;
  readonly eligibleVoters: ReadonlyMap<string, string>;
  readonly required: number;
  readonly total: number;
}

export interface ResetVotePrerequisiteResult {
  canStart: boolean;
  reason?: string;
}

/**
 * Checks prerequisites for starting a reset vote.
 * Pure function - no side effects.
 */
export function checkResetVotePrerequisites(
  existingResetVote: ResetVoteState | undefined
): ResetVotePrerequisiteResult {
  if (existingResetVote) {
    return { canStart: false, reason: MSG.errorResetVoteInProgress };
  }

  return { canStart: true };
}

/**
 * Creates a new reset vote state.
 * Pure function - returns new state object.
 *
 * All connected users are eligible to vote.
 * Required = strict majority (floor(N/2) + 1).
 * The initiator automatically votes yes.
 */
export function createResetVoteState(
  initiatorId: string,
  allConnected: ReadonlyMap<string, string>
): ResetVoteState {
  const eligibleVoters = new Map(allConnected);
  const N = eligibleVoters.size;
  const required = Math.floor(N / 2) + 1;

  const yesVoters = new Set([initiatorId]);

  return {
    initiatorId,
    yesVoters,
    noVoters: new Set(),
    eligibleVoters,
    required,
    total: eligibleVoters.size,
  };
}

export type ResetVoteProcessResult = MajorityVoteResult;

/**
 * Processes a reset vote from a player.
 * Delegates to shared majority vote logic.
 */
export function processResetVote(
  vote: ResetVoteState,
  voterId: string,
  voteChoice: "yes" | "no"
): ResetVoteProcessResult {
  return processMajorityVote(vote, voterId, voteChoice);
}
