export { DEFAULT_PLAYER_NAME } from "../../server/shared_messages";

export const UI = {
  // Section headings
  headingSpectators: "Spectators",
  headingWhite: "White",
  headingBlack: "Black",

  // Name modal
  nameModalTitle: "Change Name",
  nameModalPlaceholder: "Set your name",
  nameModalAriaLabel: "Set your name (Enter to save)",
  nameModalCancel: "Cancel",
  nameModalSave: "Save",

  // Promotion dialog
  promotionTitle: "Promote to:",

  // Buttons
  btnKick: "Kick",
  btnJoin: "Join",
  playedThisTurn: "Played this turn",
  leadLabel: "Lead",

  // Icon-button labels & tooltips
  btnResignLabel: "Resign",
  btnOfferDrawLabel: "Offer Draw",
  btnResetLabel: "Reset",
  btnMuteLabel: "Mute",
  btnUnmuteLabel: "Unmute",
  btnCopyPgnLabel: "PGN",
  tooltipCopyPgn: "Copy PGN",
  tooltipAutoAssign: "Auto assign",
  drawOfferPending: "Draw offered",

  // Vote UI
  voteTypeResign: "Resign",
  voteTypeOfferDraw: "Offer Draw",
  voteTypeAcceptDraw: "Accept Draw",
  votingOnDraw: "Voting on draw...",
  voteInProgress: "Vote in progress.",

  // Kick (a lead power)
  kickTooltip: (name: string) => `Kick ${name}`,

  // Status
  noMovesYet: "No moves played yet.",
  offlineBanner: "You\u2019re offline. Trying to reconnect\u2026",

  // Chat
  chatPlaceholder: "Type a message...",

  // Confirmations
  confirmResign: "Are you sure you want to resign?",
  confirmOfferDraw: "Are you sure you want to offer a draw?",
  confirmResetGame: "Are you sure you want to reset the game?",
  confirmKick: (name: string) => `Kick ${name}?`,
  confirmOk: "Confirm",
  confirmCancel: "Cancel",

  // Toasts
  toastPgnCopied: "PGN copied!",
  toastPgnCopyFailed: "Could not copy PGN.",
  toastIllegalMove: "Illegal move!",
  toastOnlyWhiteStart: "Only White can make the first move.",
  toastKicked: "You have been kicked from the game.",
} as const;
