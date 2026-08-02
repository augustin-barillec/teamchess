import { Players, GameStatus } from "../types";
import { DisconnectedIcon } from "../DisconnectedIcon";
import { DEFAULT_PLAYER_NAME, UI } from "../messages";
import { colorForPlayer } from "../playerColors";

interface PlayersPanelProps {
  activeTab: string;
  players: Players;
  myId: string;
  amDisconnected: boolean;
  openNameModal: () => void;
  hasPlayed: (playerId: string, teamSide: "white" | "black") => boolean;
  /** False while any vote is active — starting a kick would be rejected anyway. */
  canStartKick: boolean;
  onStartKickVote: (targetId: string) => void;
  /** Desktop-only: when provided, renders join/auto-assign controls in section headings. */
  showJoinControls?: boolean;
  side?: "white" | "black" | "spectator";
  gameStatus?: GameStatus;
  joinSide?: (target: "white" | "black" | "spectator") => void;
  autoAssign?: () => void;
}

const PencilIcon: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className="pencil-hint"
  >
    <title>Edit name</title>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

export const PlayersPanel: React.FC<PlayersPanelProps> = ({
  activeTab,
  players,
  myId,
  amDisconnected,
  openNameModal,
  hasPlayed,
  canStartKick,
  onStartKickVote,
  showJoinControls = false,
  side,
  gameStatus,
  joinSide,
  autoAssign,
}) => {
  const isSetup = gameStatus === GameStatus.Setup;
  const canJoin = (target: "white" | "black" | "spectator") => {
    if (!showJoinControls) return false;
    if (!gameStatus || gameStatus === GameStatus.Over) return false;
    if (side === target) return false;
    if (
      (target === "white" || target === "black") &&
      side !== "spectator" &&
      !isSetup
    )
      return false;
    return true;
  };
  const showAutoAssign =
    showJoinControls &&
    gameStatus !== undefined &&
    gameStatus !== GameStatus.Over &&
    side === "spectator";
  const renderPlayerEntry = (
    p: { id: string; name: string; connected: boolean },
    teamSide?: "white" | "black"
  ) => {
    const isMe = p.id === myId;
    const disconnected = isMe ? amDisconnected : !p.connected;
    const showKickButton = !isMe && canStartKick;
    const played = teamSide ? hasPlayed(p.id, teamSide) : false;
    const nameStyle = { color: colorForPlayer(p.id) };

    return (
      <li key={p.id} className="player-list-item-column">
        <div className="player-entry">
          {isMe ? (
            <button className="clickable-name" onClick={openNameModal}>
              <span className="player-name-text" style={nameStyle}>
                {p.name}
              </span>
              {p.name === DEFAULT_PLAYER_NAME && <PencilIcon />}
            </button>
          ) : (
            <span className="player-name-text" style={nameStyle}>
              {p.name}
            </span>
          )}
          {isMe && <span className="player-you-tag">(You)</span>}
          {played && (
            <span
              className="player-played-check"
              title={UI.playedThisTurn}
              aria-label={UI.playedThisTurn}
            >
              ✓
            </span>
          )}
          {disconnected && (
            <span className="player-icon-slot">
              <DisconnectedIcon />
            </span>
          )}
          {showKickButton && (
            <button
              className="kick-btn"
              onClick={() => onStartKickVote(p.id)}
              title={UI.kickVoteTooltip(p.name)}
            >
              {UI.btnKick}
            </button>
          )}
        </div>
      </li>
    );
  };

  const renderSection = (
    target: "white" | "black" | "spectator",
    label: string,
    list: { id: string; name: string; connected: boolean }[]
  ) => {
    const joinable = canJoin(target);
    const teamSide = target === "spectator" ? undefined : target;
    return (
      <div className="player-section">
        <div className="player-section-heading">
          <h3>{label}</h3>
          {joinable && joinSide && (
            <button className="join-btn" onClick={() => joinSide(target)}>
              {UI.btnJoin}
            </button>
          )}
        </div>
        <ul className="player-list">
          {list.map((p) => renderPlayerEntry(p, teamSide))}
        </ul>
      </div>
    );
  };

  return (
    <div
      className={
        "tab-panel players-panel " + (activeTab === "players" ? "active" : "")
      }
    >
      <h3>{UI.headingPlayers}</h3>
      <div className="player-lists-container">
        {showJoinControls ? (
          <>
            {renderSection(
              "spectator",
              UI.headingSpectators,
              players.spectators
            )}
            {showAutoAssign && autoAssign && (
              <button
                className="auto-assign-btn"
                onClick={autoAssign}
                title={UI.tooltipAutoAssign}
                aria-label={UI.tooltipAutoAssign}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m16 3 4 4-4 4" />
                  <path d="M20 7H4" />
                  <path d="m8 21-4-4 4-4" />
                  <path d="M4 17h16" />
                </svg>
              </button>
            )}
            {renderSection("white", UI.headingWhite, players.whitePlayers)}
            {renderSection("black", UI.headingBlack, players.blackPlayers)}
          </>
        ) : (
          <>
            <div>
              <h3>{UI.headingSpectators}</h3>
              <ul className="player-list">
                {players.spectators.map((p) => renderPlayerEntry(p))}
              </ul>
            </div>
            <div>
              <h3>{UI.headingWhite}</h3>
              <ul className="player-list">
                {players.whitePlayers.map((p) => renderPlayerEntry(p, "white"))}
              </ul>
            </div>
            <div>
              <h3>{UI.headingBlack}</h3>
              <ul className="player-list">
                {players.blackPlayers.map((p) => renderPlayerEntry(p, "black"))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
