import { describe, it, expect, vi } from "vitest";
import {
  getVoteClientData,
  broadcastVote,
  clearActiveVote,
  startTeamVote,
  startKickVote,
  startResetVote,
  setEndGameCallback,
} from "./activeVote.js";
import { MockGameContext } from "../context/MockGameContext.js";
import { MSG } from "../shared_messages.js";
import type { ActiveVoteState } from "../shared_types.js";

/** Frozen-electorate fixture: the pid -> name snapshot a vote carries. */
const roster = (...pids: string[]): Map<string, string> =>
  new Map(pids.map((pid) => [pid, `name-${pid}`]));

/** In-flight team vote fixture for seeding MockGameContext initial state. */
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

describe("activeVote", () => {
  describe("getVoteClientData", () => {
    it("returns null when no vote is active", () => {
      const ctx = new MockGameContext();
      ctx.addPlayer("p1", "Alice", "white");

      expect(getVoteClientData("p1", ctx)).toBeNull();
    });

    it("personalizes eligibility and current vote per viewer", () => {
      const ctx = new MockGameContext({
        activeVote: teamVoteFixture(roster("p1", "p2")),
      });
      ctx.addPlayer("p1", "Alice", "white");
      ctx.addPlayer("p2", "Bob", "white");
      ctx.addPlayer("p3", "Charlie", "white"); // late joiner, not in electorate

      const p1Data = getVoteClientData("p1", ctx);
      const p3Data = getVoteClientData("p3", ctx);

      expect(p1Data?.kind).toBe("team");
      expect(p1Data?.myVoteEligible).toBe(true);
      expect(p1Data?.myCurrentVote).toBe("yes"); // initiator auto-voted
      expect(p3Data?.myVoteEligible).toBe(false);
      expect(p3Data?.myCurrentVote).toBeNull();

      clearTimeout(ctx.gameState.activeVote!.timer);
    });

    it("still names a yes voter whose session is gone", () => {
      // Alice opens the vote (auto-yes) then vanishes: disconnect grace expired, or
      // kicked. Her yes still counts, so she must still be named — the electorate is
      // frozen, and names come from it rather than from the live sessions map.
      const ctx = new MockGameContext();
      ctx.addPlayer("p1", "Alice", "white");
      ctx.addPlayer("p2", "Bob", "white");
      ctx.addPlayer("b1", "Carol", "black");

      startTeamVote("white", "resign", "p1", ctx);
      ctx.removePlayer("p1");

      const data = getVoteClientData("p2", ctx);

      expect(data?.yesVotes).toEqual(["Alice"]);
      expect(data?.requiredVotes).toBe(2);

      clearTimeout(ctx.gameState.activeVote!.timer);
    });

    it("marks the kick target and keeps them out of the electorate", () => {
      const ctx = new MockGameContext();
      ctx.addPlayer("p1", "Alice", "white");
      ctx.addPlayer("p2", "Bob", "black");
      ctx.addPlayer("p3", "Charlie", "black");

      startKickVote("p1", "p3", "Charlie", ctx);

      const targetData = getVoteClientData("p3", ctx);
      expect(targetData?.kind).toBe("kick");
      if (targetData?.kind === "kick") {
        expect(targetData.amTarget).toBe(true);
        expect(targetData.targetName).toBe("Charlie");
        expect(targetData.myVoteEligible).toBe(false);
        expect(targetData.totalVoters).toBe(3);
        expect(targetData.requiredVotes).toBe(2);
      }

      clearTimeout(ctx.gameState.activeVote!.timer);
    });
  });

  describe("broadcastVote", () => {
    it("sends a personalized vote_update to every connected socket", () => {
      const ctx = new MockGameContext({
        activeVote: teamVoteFixture(roster("p1", "p2")),
      });
      const s1 = ctx.addPlayer("p1", "Alice", "white");
      ctx.addPlayer("p2", "Bob", "white");
      const spec = ctx.addPlayer("s1", "Sam", "spectator");

      broadcastVote(ctx);

      const p1Event = s1.emittedEvents.find((e) => e.event === "vote_update");
      const specEvent = spec.emittedEvents.find(
        (e) => e.event === "vote_update"
      );

      expect((p1Event!.data as ActiveVoteState).myVoteEligible).toBe(true);
      // Spectators see the vote too (single shared banner) but cannot vote
      expect((specEvent!.data as ActiveVoteState).myVoteEligible).toBe(false);

      clearTimeout(ctx.gameState.activeVote!.timer);
    });
  });

  describe("single-slot mutex", () => {
    it("rejects a reset vote while a kick vote is active", () => {
      const ctx = new MockGameContext();
      ctx.addPlayer("p1", "Alice", "white");
      ctx.addPlayer("p2", "Bob", "black");
      ctx.addPlayer("p3", "Charlie", "black");

      startKickVote("p1", "p3", "Charlie", ctx);
      const result = startResetVote("p2", ctx);

      expect(result.error).toBe(MSG.errorVoteInProgress);
      expect(ctx.gameState.activeVote?.kind).toBe("kick");

      clearTimeout(ctx.gameState.activeVote!.timer);
    });

    it("rejects a kick vote while a reset vote is active", () => {
      const ctx = new MockGameContext();
      ctx.addPlayer("p1", "Alice", "white");
      ctx.addPlayer("p2", "Bob", "black");

      startResetVote("p1", ctx);
      const result = startKickVote("p1", "p2", "Bob", ctx);

      expect(result.error).toBe(MSG.errorVoteInProgress);
      expect(ctx.gameState.activeVote?.kind).toBe("reset");

      clearTimeout(ctx.gameState.activeVote!.timer);
    });

    it("rejects a team vote — even a solo auto-execute — while another vote is active", () => {
      const endGameSpy = vi.fn();
      setEndGameCallback(endGameSpy);
      try {
        const ctx = new MockGameContext();
        ctx.addPlayer("p1", "Alice", "white"); // solo white: resign would auto-execute
        ctx.addPlayer("p2", "Bob", "black");
        ctx.addPlayer("p3", "Charlie", "black");

        startResetVote("p2", ctx);
        const result = startTeamVote("white", "resign", "p1", ctx);

        expect(result.error).toBe(MSG.errorVoteInProgress);
        expect(endGameSpy).not.toHaveBeenCalled();
        expect(ctx.gameState.activeVote?.kind).toBe("reset");

        clearTimeout(ctx.gameState.activeVote!.timer);
      } finally {
        setEndGameCallback(() => {});
      }
    });

    it("frees the slot for a new vote once cleared", () => {
      const ctx = new MockGameContext();
      ctx.addPlayer("p1", "Alice", "white");
      ctx.addPlayer("p2", "Bob", "black");
      ctx.addPlayer("p3", "Charlie", "black");

      startKickVote("p1", "p3", "Charlie", ctx);
      clearActiveVote(ctx);

      const result = startResetVote("p1", ctx);

      expect(result.error).toBeUndefined();
      expect(ctx.gameState.activeVote?.kind).toBe("reset");

      clearTimeout(ctx.gameState.activeVote!.timer);
    });
  });

  describe("startKickVote", () => {
    it("rejects self-kick", () => {
      const ctx = new MockGameContext();
      ctx.addPlayer("p1", "Alice", "white");
      ctx.addPlayer("p2", "Bob", "black");

      const result = startKickVote("p1", "p1", "Alice", ctx);

      expect(result.error).toBe(MSG.errorCannotKickSelf);
      expect(ctx.gameState.activeVote).toBeUndefined();
    });

    it("auto-votes yes for the initiator", () => {
      const ctx = new MockGameContext();
      ctx.addPlayer("p1", "Alice", "white");
      ctx.addPlayer("p2", "Bob", "black");
      ctx.addPlayer("p3", "Charlie", "black");

      startKickVote("p1", "p3", "Charlie", ctx);

      expect(ctx.gameState.activeVote?.yesVoters.has("p1")).toBe(true);

      clearTimeout(ctx.gameState.activeVote!.timer);
    });
  });

  describe("startResetVote", () => {
    it("returns passedImmediately for a solo player", () => {
      const ctx = new MockGameContext();
      ctx.addPlayer("p1", "Alice", "white");

      const result = startResetVote("p1", ctx);

      expect(result.passedImmediately).toBe(true);
      expect(ctx.gameState.activeVote).toBeUndefined();
    });

    it("starts a vote when 2+ players online", () => {
      const ctx = new MockGameContext();
      ctx.addPlayer("p1", "Alice", "white");
      ctx.addPlayer("p2", "Bob", "black");

      const result = startResetVote("p1", ctx);

      expect(result.passedImmediately).toBeUndefined();
      expect(result.error).toBeUndefined();
      expect(ctx.gameState.activeVote?.kind).toBe("reset");

      clearTimeout(ctx.gameState.activeVote!.timer);
    });
  });

  describe("vote expiration", () => {
    it("clears a team vote and emits a failed chat_message after the 20s timeout", () => {
      vi.useFakeTimers();
      try {
        const ctx = new MockGameContext();
        ctx.addPlayer("p1", "Alice", "black");
        ctx.addPlayer("p2", "Bob", "black");
        ctx.addPlayer("w1", "Charlie", "white");

        startTeamVote("black", "resign", "p1", ctx);

        expect(ctx.gameState.activeVote).toBeDefined();

        vi.advanceTimersByTime(20_000);

        expect(ctx.gameState.activeVote).toBeUndefined();
        const chats = ctx.getEmittedData<{ message: string }>("chat_message");
        expect(chats.some((c) => c.message.includes("failed"))).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("clears the draw offer when accept_draw vote times out", () => {
      vi.useFakeTimers();
      try {
        const ctx = new MockGameContext({ drawOffer: "white" });
        ctx.addPlayer("p1", "Alice", "black");
        ctx.addPlayer("p2", "Bob", "black");

        startTeamVote("black", "accept_draw", "p1", ctx);

        expect(ctx.gameState.activeVote).toBeDefined();

        vi.advanceTimersByTime(20_000);

        expect(ctx.gameState.drawOffer).toBeUndefined();
        const offerEvents = ctx.getEmittedData<{ side: string | null }>(
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
        const ctx = new MockGameContext();
        ctx.addPlayer("p1", "Alice", "white");
        ctx.addPlayer("p2", "Bob", "black");
        ctx.addPlayer("p3", "Charlie", "black");

        startKickVote("p1", "p3", "Charlie", ctx);

        vi.advanceTimersByTime(20_000);

        expect(ctx.gameState.activeVote).toBeUndefined();
        const chats = ctx.getEmittedData<{ message: string }>("chat_message");
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
        const ctx = new MockGameContext();
        ctx.addPlayer("p1", "Alice", "white");
        ctx.addPlayer("p2", "Bob", "black");
        ctx.addPlayer("p3", "Carol", "black");

        startResetVote("p1", ctx);

        expect(ctx.gameState.activeVote).toBeDefined();

        vi.advanceTimersByTime(20_000);

        expect(ctx.gameState.activeVote).toBeUndefined();
        const chats = ctx.getEmittedData<{ message: string }>("chat_message");
        expect(
          chats.some((c) => c.message.includes("Vote to reset the game failed"))
        ).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
