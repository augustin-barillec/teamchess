import { Chess } from "chess.js";
import { GameStatus, VoteType } from "./shared_types.js";

export type Side = "white" | "black" | "spectator";
export type PlayerSide = "white" | "black";

export type Session = {
  pid: string;
  name: string;
  side: Side;
  reconnectTimer?: NodeJS.Timeout;
};

// `eligibleVoters` is the vote's frozen electorate: pid -> name as of vote creation.
// See core/voteLogic.ts. Never mutate it or `required` on an in-flight vote.
// Only one vote can be active at a time (gameState.activeVote), whatever its kind.

interface InternalVoteBase {
  initiatorId: string;
  yesVoters: Set<string>;
  readonly eligibleVoters: ReadonlyMap<string, string>;
  readonly required: number;
  timer: NodeJS.Timeout;
  endTime: number;
}

export interface InternalTeamVote extends InternalVoteBase {
  kind: "team";
  side: PlayerSide;
  type: VoteType;
}

export interface InternalKickVote extends InternalVoteBase {
  kind: "kick";
  targetId: string;
  targetName: string;
  noVoters: Set<string>;
  readonly total: number;
}

export interface InternalResetVote extends InternalVoteBase {
  kind: "reset";
  noVoters: Set<string>;
  readonly total: number;
}

export type InternalActiveVote =
  | InternalTeamVote
  | InternalKickVote
  | InternalResetVote;

export interface Engine {
  send: (command: string, callback?: (output: string) => void) => void;
  quit: () => void;
}

export interface GameState {
  /**
   * Bumped on every game end or reset. Async callbacks (engine search) capture it
   * before awaiting and bail out if it changed — their turn no longer exists.
   */
  generation: number;
  whiteIds: Set<string>;
  blackIds: Set<string>;
  moveNumber: number;
  side: PlayerSide;
  proposals: Map<string, { lan: string; san: string; name: string }>;
  whiteTime: number;
  blackTime: number;
  timerInterval?: NodeJS.Timeout;
  engine: Engine;
  chess: Chess;
  status: GameStatus;
  endReason?: string;
  endWinner?: string | null;
  /** Formatted end-of-game announcement, kept for resyncing late joiners. */
  endMessage?: string;
  drawOffer?: "white" | "black";
  activeVote?: InternalActiveVote;
  blacklist: Set<string>;
}

export type {
  Player,
  Players,
  ChatMessage,
  GameInfo,
  Proposal,
  Selection,
  VoteType,
  VoteKind,
  ActiveVoteState,
  TeamVoteState,
  KickVoteState,
  ResetVoteState,
} from "./shared_types.js";

export { GameStatus, EndReason } from "./shared_types.js";
