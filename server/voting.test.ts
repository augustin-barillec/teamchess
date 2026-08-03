import { describe, it, expect, afterEach, vi } from "vitest";
import { GameStatus, EndReason } from "./shared_types.js";
import type { ActiveVoteState } from "./shared_types.js";
import { MSG } from "./shared_messages.js";
import { TestGame } from "./testUtils.js";
import {
  getVoteClientData,
  broadcastVote,
  clearActiveVote,
  startTeamVote,
  startKickVote,
  startResetVote,
  castVote,
} from "./voting.js";

// executeGameReset builds a real engine; keep it from spawning a process in tests
vi.mock("./engine/stockfish.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./engine/stockfish.js")>();
  return { ...mod, createEngine: () => ({ send: () => {}, quit: () => {} }) };
});

/** Frozen-electorate fixture: the pid -> name snapshot a vote carries. */
const roster = (...pids: string[]): Map<string, string> =>
  new Map(pids.map((pid) => [pid, `name-${pid}`]));

/** In-flight team vote fixture for seeding initial state. */
const teamVoteFixture = (eligible: Map<string, string>) => ({
  kind: "team" as const,
  side: "white" as const,
  type: "resign" as const,
  initiatorId: "p1",
  yesVoters: new Set(["p1"]),
  eligibleVoters: eligible,
  required: eligible.size,
  timer: setTimeout(() => {}, 0),
  endTime: Date.now() + 20000,
});

let game: TestGame;

afterEach(() => {
  game?.cleanup();
});

describe("voting", () => {
  describe("getVoteClientData", () => {
    it("returns null when no vote is active", () => {
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");

      expect(getVoteClientData("p1")).toBeNull();
    });

    it("personalizes eligibility and current vote per viewer", () => {
      game = new TestGame({
        activeVote: teamVoteFixture(roster("p1", "p2")),
      });
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "white");
      game.addPlayer("p3", "Charlie", "white"); // late joiner, not in electorate

      const p1Data = getVoteClientData("p1");
      const p3Data = getVoteClientData("p3");

      expect(p1Data?.kind).toBe("team");
      expect(p1Data?.myVoteEligible).toBe(true);
      expect(p1Data?.myCurrentVote).toBe("yes"); // initiator auto-voted
      expect(p3Data?.myVoteEligible).toBe(false);
      expect(p3Data?.myCurrentVote).toBeNull();
    });

    it("still names a yes voter whose session is gone", () => {
      // Alice opens the vote (auto-yes) then vanishes: disconnect grace expired, or
      // kicked. Her yes still counts, so she must still be named — the electorate is
      // frozen, and names come from it rather than from the live sessions map.
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "white");
      game.addPlayer("b1", "Carol", "black");

      startTeamVote("white", "resign", "p1");
      game.removePlayer("p1");

      const data = getVoteClientData("p2");

      expect(data?.yesVotes).toEqual(["Alice"]);
      expect(data?.requiredVotes).toBe(2);
    });

    it("marks the kick target and keeps them out of the electorate", () => {
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "black");
      game.addPlayer("p3", "Charlie", "black");

      startKickVote("p1", "p3", "Charlie");

      const targetData = getVoteClientData("p3");
      expect(targetData?.kind).toBe("kick");
      if (targetData?.kind === "kick") {
        expect(targetData.amTarget).toBe(true);
        expect(targetData.targetName).toBe("Charlie");
        expect(targetData.myVoteEligible).toBe(false);
        expect(targetData.totalVoters).toBe(3);
        expect(targetData.requiredVotes).toBe(2);
      }
    });
  });

  describe("broadcastVote", () => {
    it("sends a personalized vote_update to every connected socket", () => {
      game = new TestGame({
        activeVote: teamVoteFixture(roster("p1", "p2")),
      });
      const s1 = game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "white");
      const spec = game.addPlayer("s1", "Sam", "spectator");

      broadcastVote();

      const p1Event = s1.emittedEvents.find((e) => e.event === "vote_update");
      const specEvent = spec.emittedEvents.find(
        (e) => e.event === "vote_update"
      );

      expect((p1Event!.data as ActiveVoteState).myVoteEligible).toBe(true);
      // Spectators see the vote too (single shared banner) but cannot vote
      expect((specEvent!.data as ActiveVoteState).myVoteEligible).toBe(false);
    });
  });

  describe("single-slot mutex", () => {
    it("rejects a reset vote while a kick vote is active", () => {
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "black");
      game.addPlayer("p3", "Charlie", "black");

      startKickVote("p1", "p3", "Charlie");
      const result = startResetVote("p2");

      expect(result.error).toBe(MSG.errorVoteInProgress);
      expect(game.gameState.activeVote?.kind).toBe("kick");
    });

    it("rejects a kick vote while a reset vote is active", () => {
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "black");

      startResetVote("p1");
      const result = startKickVote("p1", "p2", "Bob");

      expect(result.error).toBe(MSG.errorVoteInProgress);
      expect(game.gameState.activeVote?.kind).toBe("reset");
    });

    it("rejects a team vote — even a solo auto-execute — while another vote is active", () => {
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white"); // solo white: resign would auto-execute
      game.addPlayer("p2", "Bob", "black");
      game.addPlayer("p3", "Charlie", "black");

      startResetVote("p2");
      const result = startTeamVote("white", "resign", "p1");

      expect(result.error).toBe(MSG.errorVoteInProgress);
      // The auto-execute did not fire: no game end happened
      expect(game.hasEmitted("game_over")).toBe(false);
      expect(game.gameState.status).not.toBe(GameStatus.Over);
      expect(game.gameState.activeVote?.kind).toBe("reset");
    });

    it("frees the slot for a new vote once cleared", () => {
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "black");
      game.addPlayer("p3", "Charlie", "black");

      startKickVote("p1", "p3", "Charlie");
      clearActiveVote();

      const result = startResetVote("p1");

      expect(result.error).toBeUndefined();
      expect(game.gameState.activeVote?.kind).toBe("reset");
    });
  });

  describe("startTeamVote", () => {
    it("does not start accept_draw when no draw offer exists", () => {
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "white");

      startTeamVote("white", "accept_draw", "p1");

      expect(game.gameState.activeVote).toBeUndefined();
    });

    it("does not start accept_draw when the offer is from the same side", () => {
      game = new TestGame({ drawOffer: "white" });
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "white");

      startTeamVote("white", "accept_draw", "p1");

      expect(game.gameState.activeVote).toBeUndefined();
    });

    it("starts accept_draw when the offer is from the opposite side", () => {
      game = new TestGame({ drawOffer: "white" });
      game.addPlayer("p1", "Alice", "black");
      game.addPlayer("p2", "Bob", "black");

      startTeamVote("black", "accept_draw", "p1");

      expect(game.gameState.activeVote?.kind).toBe("team");
      if (game.gameState.activeVote?.kind === "team") {
        expect(game.gameState.activeVote.type).toBe("accept_draw");
      }
    });

    it("does not start offer_draw when a draw is already offered", () => {
      game = new TestGame({ drawOffer: "black" });
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "white");

      startTeamVote("white", "offer_draw", "p1");

      expect(game.gameState.activeVote).toBeUndefined();
    });

    it("auto-executes resign for a solo player instead of voting", () => {
      game = new TestGame({ status: GameStatus.AwaitingProposals });
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("b1", "Bob", "black");
      game.addPlayer("b2", "Carol", "black");

      startTeamVote("white", "resign", "p1");

      expect(game.gameState.activeVote).toBeUndefined();
      expect(game.gameState.status).toBe(GameStatus.Over);
      const over = game.getLastEmittedData<{ reason: string; winner: string }>(
        "game_over"
      );
      expect(over?.reason).toBe(EndReason.Resignation);
      expect(over?.winner).toBe("black");
    });

    it("does not auto-execute a system-triggered vote for a solo team", () => {
      game = new TestGame({ drawOffer: "white" });
      game.addPlayer("p1", "Alice", "black"); // solo black

      startTeamVote("black", "accept_draw", "system");

      const vote = game.gameState.activeVote;
      expect(vote?.kind).toBe("team");
      expect(vote?.yesVoters.size).toBe(0); // system does not auto-yes
      expect(vote?.required).toBe(1);
    });

    it("auto-votes yes for a player initiator", () => {
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "white");

      startTeamVote("white", "resign", "p1");

      expect(game.gameState.activeVote?.yesVoters.has("p1")).toBe(true);
      expect(game.gameState.activeVote?.required).toBe(2);
    });
  });

  describe("castVote — team votes (unanimity)", () => {
    it("rejects a ballot from an ineligible voter", () => {
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "white");
      game.addPlayer("s1", "Sam", "spectator");

      startTeamVote("white", "resign", "p1");
      const result = castVote("s1", "yes");

      expect(result.error).toBe(MSG.errorNotEligible);
      expect(game.gameState.activeVote).toBeDefined();
    });

    it("fails the vote instantly on a single no", () => {
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "white");
      game.addPlayer("p3", "Carol", "white");

      startTeamVote("white", "resign", "p1");
      castVote("p2", "no");

      expect(game.gameState.activeVote).toBeUndefined();
      const chats = game.getEmittedData<{ message: string }>("chat_message");
      expect(
        chats.some((c) => c.message === MSG.teamVoteFailed("resign"))
      ).toBe(true);
    });

    it("rejects the draw offer when accept_draw is voted down", () => {
      game = new TestGame({ drawOffer: "white" });
      game.addPlayer("p1", "Alice", "black");
      game.addPlayer("p2", "Bob", "black");

      startTeamVote("black", "accept_draw", "p1");
      castVote("p2", "no");

      expect(game.gameState.drawOffer).toBeUndefined();
      const offers = game.getEmittedData<{ side: string | null }>(
        "draw_offer_update"
      );
      expect(offers.some((o) => o.side === null)).toBe(true);
    });

    it("records a yes below the threshold without passing", () => {
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "white");
      game.addPlayer("p3", "Carol", "white");

      startTeamVote("white", "resign", "p1");
      castVote("p2", "yes");

      expect(game.gameState.activeVote).toBeDefined();
      expect(game.gameState.activeVote?.yesVoters.size).toBe(2);
      expect(game.gameState.status).not.toBe(GameStatus.Over);
    });

    it("resigns the game when unanimity is reached", () => {
      game = new TestGame({ status: GameStatus.AwaitingProposals });
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "white");
      game.addPlayer("b1", "Carl", "black");

      startTeamVote("white", "resign", "p1");
      castVote("p2", "yes");

      expect(game.gameState.activeVote).toBeUndefined();
      expect(game.gameState.status).toBe(GameStatus.Over);
      const over = game.getLastEmittedData<{ reason: string; winner: string }>(
        "game_over"
      );
      expect(over?.reason).toBe(EndReason.Resignation);
      expect(over?.winner).toBe("black");
    });

    it("chains a passed offer_draw into a system accept_draw vote for the other side", () => {
      game = new TestGame({ status: GameStatus.AwaitingProposals });
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "white");
      game.addPlayer("b1", "Carl", "black");
      game.addPlayer("b2", "Dave", "black");

      startTeamVote("white", "offer_draw", "p1");
      castVote("p2", "yes");

      expect(game.gameState.drawOffer).toBe("white");
      const vote = game.gameState.activeVote;
      expect(vote?.kind).toBe("team");
      if (vote?.kind === "team") {
        expect(vote.type).toBe("accept_draw");
        expect(vote.side).toBe("black");
        expect(vote.yesVoters.size).toBe(0); // system-triggered
      }
    });

    it("ends the game in a draw when accept_draw passes", () => {
      game = new TestGame({
        status: GameStatus.AwaitingProposals,
        drawOffer: "white",
      });
      game.addPlayer("b1", "Carl", "black");
      game.addPlayer("b2", "Dave", "black");

      startTeamVote("black", "accept_draw", "b1");
      castVote("b2", "yes");

      expect(game.gameState.status).toBe(GameStatus.Over);
      const over = game.getLastEmittedData<{ reason: string }>("game_over");
      expect(over?.reason).toBe(EndReason.DrawAgreement);
    });
  });

  describe("startKickVote", () => {
    it("rejects self-kick", () => {
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "black");

      const result = startKickVote("p1", "p1", "Alice");

      expect(result.error).toBe(MSG.errorCannotKickSelf);
      expect(game.gameState.activeVote).toBeUndefined();
    });

    it("auto-votes yes for the initiator", () => {
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "black");
      game.addPlayer("p3", "Charlie", "black");

      startKickVote("p1", "p3", "Charlie");

      expect(game.gameState.activeVote?.yesVoters.has("p1")).toBe(true);
    });

    it("requires a strict majority of all connected players (odd and even)", () => {
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "black");
      game.addPlayer("p3", "Charlie", "black");
      game.addPlayer("p4", "Dana", "spectator");

      startKickVote("p1", "p4", "Dana");

      const vote = game.gameState.activeVote;
      expect(vote?.kind).toBe("kick");
      if (vote?.kind === "kick") {
        expect(vote.total).toBe(4);
        expect(vote.required).toBe(3); // floor(4/2) + 1
        // Target counted in the threshold but excluded from the electorate
        expect(vote.eligibleVoters.size).toBe(3);
        expect(vote.eligibleVoters.has("p4")).toBe(false);
      }
    });
  });

  describe("castVote — majority votes (kick / reset)", () => {
    function setupKickVote() {
      // 5 connected (incl. target p4): eligible = 4, required = floor(5/2)+1 = 3
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "black");
      game.addPlayer("p3", "Charlie", "black");
      game.addPlayer("p4", "Dana", "spectator");
      game.addPlayer("p5", "Eve", "spectator");
      startKickVote("p1", "p4", "Dana");
    }

    it("ignores a duplicate yes (no-op)", () => {
      setupKickVote();
      castVote("p1", "yes");

      expect(game.gameState.activeVote?.yesVoters.size).toBe(1);
      expect(game.gameState.activeVote).toBeDefined();
    });

    it("ignores a duplicate no (no-op)", () => {
      setupKickVote();
      castVote("p2", "no");
      castVote("p2", "no");

      const vote = game.gameState.activeVote;
      expect(vote?.kind).toBe("kick");
      if (vote?.kind === "kick") expect(vote.noVoters.size).toBe(1);
    });

    it("records a yes below the threshold without passing", () => {
      setupKickVote();
      castVote("p2", "yes");

      expect(game.gameState.activeVote?.yesVoters.size).toBe(2);
      expect(game.sessions.has("p4")).toBe(true); // not kicked yet
    });

    it("executes the kick when the majority is reached", () => {
      setupKickVote();
      const targetSocket = game.getSocket("p4")!;

      castVote("p2", "yes");
      castVote("p3", "yes");

      expect(game.gameState.activeVote).toBeUndefined();
      expect(game.gameState.blacklist.has("p4")).toBe(true);
      expect(game.sessions.has("p4")).toBe(false);
      expect(targetSocket.emittedEvents.some((e) => e.event === "kicked")).toBe(
        true
      );
      const chats = game.getEmittedData<{ message: string }>("chat_message");
      expect(chats.some((c) => c.message === MSG.playerKicked("Dana"))).toBe(
        true
      );
    });

    it("ends the game by abandonment when the kicked player was the last of their team", () => {
      game = new TestGame({ status: GameStatus.AwaitingProposals });
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "white");
      game.addPlayer("p3", "Charlie", "black"); // last black player

      startKickVote("p1", "p3", "Charlie");
      castVote("p2", "yes"); // 2/2 required among 3 connected

      expect(game.sessions.has("p3")).toBe(false);
      expect(game.gameState.status).toBe(GameStatus.Over);
      const over = game.getLastEmittedData<{ reason: string; winner: string }>(
        "game_over"
      );
      expect(over?.reason).toBe(EndReason.Abandonment);
      expect(over?.winner).toBe("white");
    });

    it("allows switching from no to yes, which can trigger the pass", () => {
      setupKickVote();
      castVote("p2", "yes"); // 2 yes
      castVote("p3", "no");
      castVote("p3", "yes"); // switch → 3 yes → pass

      expect(game.gameState.activeVote).toBeUndefined();
      expect(game.gameState.blacklist.has("p4")).toBe(true);
    });

    it("allows switching from yes to no", () => {
      setupKickVote();
      castVote("p2", "yes");
      castVote("p2", "no");

      const vote = game.gameState.activeVote;
      expect(vote?.kind).toBe("kick");
      if (vote?.kind === "kick") {
        expect(vote.yesVoters.has("p2")).toBe(false);
        expect(vote.noVoters.has("p2")).toBe(true);
      }
    });

    it("fails early when too many no votes make the majority unreachable", () => {
      setupKickVote(); // eligible 4, required 3: two no's make it unreachable
      castVote("p2", "no");
      expect(game.gameState.activeVote).toBeDefined(); // 3 possible yes ≥ 3

      castVote("p3", "no"); // 2 possible yes < 3

      expect(game.gameState.activeVote).toBeUndefined();
      const chats = game.getEmittedData<{ message: string }>("chat_message");
      expect(chats.some((c) => c.message === MSG.kickVoteFailed("Dana"))).toBe(
        true
      );
    });

    it("resets the game in place when a reset vote passes", () => {
      game = new TestGame({ status: GameStatus.AwaitingProposals });
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "black");
      game.gameState.blacklist.add("banned-pid");
      const stateRef = game.gameState;

      startResetVote("p1");
      castVote("p2", "yes"); // 2/2 majority

      expect(game.hasEmitted("game_reset")).toBe(true);
      expect(game.gameState).toBe(stateRef); // same object, mutated in place
      expect(game.gameState.status).toBe(GameStatus.Setup);
      expect(game.gameState.generation).toBe(1);
      expect(game.gameState.blacklist.has("banned-pid")).toBe(true);
    });
  });

  describe("startResetVote", () => {
    it("returns passedImmediately for a solo player", () => {
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");

      const result = startResetVote("p1");

      expect(result.passedImmediately).toBe(true);
      expect(game.gameState.activeVote).toBeUndefined();
    });

    it("starts a majority vote when 2+ players online", () => {
      game = new TestGame();
      game.addPlayer("p1", "Alice", "white");
      game.addPlayer("p2", "Bob", "black");
      game.addPlayer("p3", "Carol", "black");

      const result = startResetVote("p1");

      expect(result.passedImmediately).toBeUndefined();
      expect(result.error).toBeUndefined();
      const vote = game.gameState.activeVote;
      expect(vote?.kind).toBe("reset");
      if (vote?.kind === "reset") {
        expect(vote.total).toBe(3);
        expect(vote.required).toBe(2);
      }
    });
  });

  describe("vote expiration", () => {
    it("clears a team vote and emits a failed chat_message after the 20s timeout", () => {
      vi.useFakeTimers();
      try {
        game = new TestGame();
        game.addPlayer("p1", "Alice", "black");
        game.addPlayer("p2", "Bob", "black");
        game.addPlayer("w1", "Charlie", "white");

        startTeamVote("black", "resign", "p1");

        expect(game.gameState.activeVote).toBeDefined();

        vi.advanceTimersByTime(20_000);

        expect(game.gameState.activeVote).toBeUndefined();
        const chats = game.getEmittedData<{ message: string }>("chat_message");
        expect(chats.some((c) => c.message.includes("failed"))).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("clears the draw offer when accept_draw vote times out", () => {
      vi.useFakeTimers();
      try {
        game = new TestGame({ drawOffer: "white" });
        game.addPlayer("p1", "Alice", "black");
        game.addPlayer("p2", "Bob", "black");

        startTeamVote("black", "accept_draw", "p1");

        expect(game.gameState.activeVote).toBeDefined();

        vi.advanceTimersByTime(20_000);

        expect(game.gameState.drawOffer).toBeUndefined();
        const offerEvents = game.getEmittedData<{ side: string | null }>(
          "draw_offer_update"
        );
        expect(offerEvents.some((e) => e.side === null)).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("clears a kick vote and names the target in the failure message", () => {
      vi.useFakeTimers();
      try {
        game = new TestGame();
        game.addPlayer("p1", "Alice", "white");
        game.addPlayer("p2", "Bob", "black");
        game.addPlayer("p3", "Charlie", "black");

        startKickVote("p1", "p3", "Charlie");

        vi.advanceTimersByTime(20_000);

        expect(game.gameState.activeVote).toBeUndefined();
        const chats = game.getEmittedData<{ message: string }>("chat_message");
        expect(
          chats.some((c) => c.message.includes("Vote to kick Charlie failed"))
        ).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("clears a reset vote and emits a failed chat_message after the 20s timeout", () => {
      vi.useFakeTimers();
      try {
        game = new TestGame();
        game.addPlayer("p1", "Alice", "white");
        game.addPlayer("p2", "Bob", "black");
        game.addPlayer("p3", "Carol", "black");

        startResetVote("p1");

        expect(game.gameState.activeVote).toBeDefined();

        vi.advanceTimersByTime(20_000);

        expect(game.gameState.activeVote).toBeUndefined();
        const chats = game.getEmittedData<{ message: string }>("chat_message");
        expect(
          chats.some((c) => c.message.includes("Vote to reset the game failed"))
        ).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
