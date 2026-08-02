export interface Player {
  id: string;
  name: string;
  connected: boolean;
}

export type Players = {
  spectators: Player[];
  whitePlayers: Player[];
  blackPlayers: Player[];
};

export type ChatMessage = {
  sender: string;
  senderId: string;
  message: string;
  system?: boolean;
};

export type GameInfo = {
  moveNumber: number;
  side: "white" | "black";
};

export type Proposal = {
  id: string;
  name: string;
  moveNumber: number;
  side: "white" | "black";
  lan: string;
  san?: string;
};

export type Selection = Proposal & {
  fen: string;
  candidates: Proposal[];
};

export type VoteType = "resign" | "offer_draw" | "accept_draw";

// Only one vote can be active at a time, whatever its kind. The server sends the
// whole state (or null) on every `vote_update`; fields are personalized per viewer.
export type VoteKind = "team" | "kick" | "reset";

interface VoteStateBase {
  yesVotes: string[];
  noVotes: string[];
  requiredVotes: number;
  endTime: number;
  myVoteEligible: boolean;
  myCurrentVote: "yes" | "no" | null;
}

export interface TeamVoteState extends VoteStateBase {
  kind: "team";
  side: "white" | "black";
  type: VoteType;
}

export interface KickVoteState extends VoteStateBase {
  kind: "kick";
  targetId: string;
  targetName: string;
  totalVoters: number;
  amTarget: boolean;
}

export interface ResetVoteState extends VoteStateBase {
  kind: "reset";
  totalVoters: number;
}

export type ActiveVoteState = TeamVoteState | KickVoteState | ResetVoteState;

export enum GameStatus {
  Setup = "Setup",
  AwaitingProposals = "AwaitingProposals",
  FinalizingTurn = "FinalizingTurn",
  Over = "Over",
}

export enum EndReason {
  Checkmate = "checkmate",
  Stalemate = "stalemate",
  Threefold = "threefold repetition",
  Insufficient = "insufficient material",
  DrawRule = "draw by rule",
  Resignation = "resignation",
  DrawAgreement = "draw by agreement",
  Timeout = "timeout",
  Abandonment = "abandonment",
}
