interface VoteBannerProps {
  title: string;
  yesVotes: string[];
  requiredVotes: number;
  timeLeft: number;
  myVoteEligible: boolean;
  myCurrentVote?: "yes" | null;
  onYes: () => void;
  onNo: () => void;
}

export const VoteBanner: React.FC<VoteBannerProps> = ({
  title,
  yesVotes,
  requiredVotes,
  timeLeft,
  myVoteEligible,
  myCurrentVote,
  onYes,
  onNo,
}) => {
  return (
    <div className="vote-banner">
      <div className="vote-banner-info">
        <div className="vote-banner-title">{title}</div>
        <div className="vote-banner-meta">
          {yesVotes.length}/{requiredVotes} &bull; {timeLeft}s
          {yesVotes.length > 0 && (
            <span className="vote-banner-yes-list">
              {" "}
              &bull; Yes: {yesVotes.join(", ")}
            </span>
          )}
        </div>
      </div>
      <div className="vote-banner-buttons">
        <button
          onClick={onYes}
          disabled={!myVoteEligible || myCurrentVote === "yes"}
          className="vote-yes-btn"
        >
          Yes ({yesVotes.length})
        </button>
        <button
          onClick={onNo}
          disabled={!myVoteEligible}
          className="vote-no-btn"
        >
          No
        </button>
      </div>
    </div>
  );
};
