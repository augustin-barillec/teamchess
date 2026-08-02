import { describe, it, expect } from "vitest";
import {
  checkTeamVotePrerequisites,
  processTeamVote,
  createTeamVoteState,
  createMajorityVoteState,
  processMajorityVote,
} from "./voteLogic.js";
import { formatVoteType } from "../shared_messages.js";

/** Frozen-electorate fixture: the pid -> name snapshot a vote carries. */
const roster = (...pids: string[]): Map<string, string> =>
  new Map(pids.map((pid) => [pid, `name-${pid}`]));

describe("voteLogic", () => {
  describe("checkTeamVotePrerequisites", () => {
    it("rejects accept_draw when no draw offer exists", () => {
      const result = checkTeamVotePrerequisites(
        "accept_draw",
        3,
        false,
        undefined,
        "white"
      );

      expect(result.canStartVote).toBe(false);
      expect(result.shouldAutoExecute).toBe(false);
    });

    it("rejects accept_draw when offer is from same side", () => {
      const result = checkTeamVotePrerequisites(
        "accept_draw",
        3,
        false,
        "white", // white offered
        "white" // white trying to accept
      );

      expect(result.canStartVote).toBe(false);
      expect(result.shouldAutoExecute).toBe(false);
    });

    it("allows accept_draw when offer is from opposite side", () => {
      const result = checkTeamVotePrerequisites(
        "accept_draw",
        3,
        false,
        "white", // white offered
        "black" // black trying to accept
      );

      expect(result.canStartVote).toBe(true);
      expect(result.shouldAutoExecute).toBe(false);
    });

    it("rejects offer_draw when draw already offered", () => {
      const result = checkTeamVotePrerequisites(
        "offer_draw",
        3,
        false,
        "black",
        "white"
      );

      expect(result.canStartVote).toBe(false);
    });

    it("auto-executes for single player when not system triggered", () => {
      const result = checkTeamVotePrerequisites(
        "resign",
        1,
        false,
        undefined,
        "white"
      );

      expect(result.shouldAutoExecute).toBe(true);
      expect(result.canStartVote).toBe(false);
    });

    it("does not auto-execute when system triggered", () => {
      const result = checkTeamVotePrerequisites(
        "accept_draw",
        1,
        true, // system triggered
        "white",
        "black"
      );

      expect(result.shouldAutoExecute).toBe(false);
      expect(result.canStartVote).toBe(true);
    });

    it("allows vote when all prerequisites met", () => {
      const result = checkTeamVotePrerequisites(
        "resign",
        3,
        false,
        undefined,
        "white"
      );

      expect(result.canStartVote).toBe(true);
      expect(result.shouldAutoExecute).toBe(false);
    });
  });

  describe("processTeamVote", () => {
    it("rejects vote from ineligible voter", () => {
      const vote = {
        yesVoters: new Set(["p1"]),
        eligibleVoters: roster("p1", "p2"),
        required: 2,
      };

      const result = processTeamVote(vote, "p3", "yes"); // p3 not eligible

      expect(result.passed).toBe(false);
      expect(result.failed).toBe(false);
      expect(result.ineligible).toBe(true);
    });

    it("fails vote when player votes no", () => {
      const vote = {
        yesVoters: new Set(["p1"]),
        eligibleVoters: roster("p1", "p2"),
        required: 2,
      };

      const result = processTeamVote(vote, "p2", "no");

      expect(result.passed).toBe(false);
      expect(result.failed).toBe(true);
    });

    it("records yes vote without passing when below threshold", () => {
      const vote = {
        yesVoters: new Set(["p1"]),
        eligibleVoters: roster("p1", "p2", "p3"),
        required: 3,
      };

      const result = processTeamVote(vote, "p2", "yes");

      expect(result.passed).toBe(false);
      expect(result.failed).toBe(false);
      expect(result.updatedYesVoters?.size).toBe(2);
      expect(result.updatedYesVoters?.has("p2")).toBe(true);
    });

    it("passes vote when threshold reached", () => {
      const vote = {
        yesVoters: new Set(["p1"]),
        eligibleVoters: roster("p1", "p2"),
        required: 2,
      };

      const result = processTeamVote(vote, "p2", "yes");

      expect(result.passed).toBe(true);
      expect(result.failed).toBe(false);
      expect(result.updatedYesVoters?.size).toBe(2);
    });

    it("does not mutate original vote state", () => {
      const originalYesVoters = new Set(["p1"]);
      const vote = {
        yesVoters: originalYesVoters,
        eligibleVoters: roster("p1", "p2"),
        required: 2,
      };

      processTeamVote(vote, "p2", "yes");

      expect(originalYesVoters.size).toBe(1); // Original not modified
      expect(vote.yesVoters.size).toBe(1);
    });
  });

  describe("createTeamVoteState", () => {
    it("creates vote state with initiator yes vote when player triggered", () => {
      const eligible = roster("p1", "p2", "p3");
      const result = createTeamVoteState("resign", "p1", eligible, false);

      expect(result.type).toBe("resign");
      expect(result.initiatorId).toBe("p1");
      expect(result.yesVoters.size).toBe(1);
      expect(result.yesVoters.has("p1")).toBe(true);
      expect(result.eligibleVoters.size).toBe(3);
      expect(result.required).toBe(3);
    });

    it("creates vote state with no initial yes votes when system triggered", () => {
      const eligible = roster("p1", "p2", "p3");
      const result = createTeamVoteState(
        "accept_draw",
        "system",
        eligible,
        true
      );

      expect(result.yesVoters.size).toBe(0);
      expect(result.initiatorId).toBe("system");
    });

    it("creates independent copy of eligible voters", () => {
      const eligible = roster("p1", "p2");
      const result = createTeamVoteState("resign", "p1", eligible, false);

      eligible.set("p3", "name-p3"); // Modify original

      expect(result.eligibleVoters.size).toBe(2); // Copy not affected
    });
  });

  describe("createMajorityVoteState", () => {
    it("sets required to strict majority (floor(N/2) + 1) for odd N", () => {
      const result = createMajorityVoteState("p1", roster("p1", "p2", "p3"));

      expect(result.required).toBe(2);
      expect(result.total).toBe(3);
    });

    it("sets required to strict majority for even N", () => {
      const result = createMajorityVoteState(
        "p1",
        roster("p1", "p2", "p3", "p4")
      );

      expect(result.required).toBe(3);
      expect(result.total).toBe(4);
    });

    it("computes threshold for N=2", () => {
      const result = createMajorityVoteState("p1", roster("p1", "p2"));

      expect(result.required).toBe(2);
      expect(result.total).toBe(2);
    });

    it("auto-votes yes for initiator and starts with no noVoters", () => {
      const result = createMajorityVoteState("p1", roster("p1", "p2", "p3"));

      expect(result.yesVoters.has("p1")).toBe(true);
      expect(result.yesVoters.size).toBe(1);
      expect(result.noVoters.size).toBe(0);
    });

    it("counts a non-voting member in the threshold via totalCount (kick target)", () => {
      // Kick vote: 3 connected, target excluded from the electorate but counted in N
      const eligible = roster("p1", "p2"); // target p3 removed by caller
      const result = createMajorityVoteState("p1", eligible, 3);

      expect(result.total).toBe(3);
      expect(result.required).toBe(2);
      expect(result.eligibleVoters.size).toBe(2);
      expect(result.eligibleVoters.has("p3")).toBe(false);
    });

    it("reaches 1/1 immediately for a solo initiator", () => {
      const result = createMajorityVoteState("p1", roster("p1"));

      expect(result.required).toBe(1);
      // The caller checks yesVoters.size >= required
      expect(result.yesVoters.size >= result.required).toBe(true);
    });

    it("creates independent copy of eligible voters", () => {
      const eligible = roster("p1", "p2");
      const result = createMajorityVoteState("p1", eligible);

      eligible.set("p3", "name-p3");
      expect(result.eligibleVoters.size).toBe(2);
    });
  });

  describe("processMajorityVote", () => {
    // Kick-style fixture: N=5 (incl. non-voting target), eligible=4, required=3
    function makeVote(overrides?: {
      yesVoters?: Set<string>;
      noVoters?: Set<string>;
    }) {
      return {
        yesVoters: new Set(["p1"]),
        noVoters: new Set<string>(),
        eligibleVoters: roster("p1", "p2", "p3", "p4"),
        required: 3,
        ...overrides,
      };
    }

    it("rejects vote from ineligible voter", () => {
      const result = processMajorityVote(makeVote(), "p6", "yes");
      expect(result.passed).toBe(false);
      expect(result.failed).toBe(false);
      expect(result.ineligible).toBe(true);
    });

    it("ignores duplicate yes vote (no-op)", () => {
      const result = processMajorityVote(makeVote(), "p1", "yes");
      expect(result.passed).toBe(false);
      expect(result.failed).toBe(false);
      expect(result.updatedYesVoters).toBeUndefined();
      expect(result.updatedNoVoters).toBeUndefined();
    });

    it("ignores duplicate no vote (no-op)", () => {
      const vote = makeVote({ noVoters: new Set(["p2"]) });
      const result = processMajorityVote(vote, "p2", "no");
      expect(result.passed).toBe(false);
      expect(result.failed).toBe(false);
      expect(result.updatedYesVoters).toBeUndefined();
      expect(result.updatedNoVoters).toBeUndefined();
    });

    it("records yes vote without passing when below threshold", () => {
      const result = processMajorityVote(makeVote(), "p2", "yes");
      expect(result.passed).toBe(false);
      expect(result.failed).toBe(false);
      expect(result.updatedYesVoters?.size).toBe(2);
      expect(result.updatedYesVoters?.has("p2")).toBe(true);
    });

    it("passes vote when threshold reached", () => {
      const vote = makeVote({ yesVoters: new Set(["p1", "p2"]) });
      const result = processMajorityVote(vote, "p3", "yes");
      expect(result.passed).toBe(true);
      expect(result.failed).toBe(false);
      expect(result.updatedYesVoters?.size).toBe(3);
    });

    it("allows switching from no to yes", () => {
      const vote = makeVote({ noVoters: new Set(["p2"]) });
      const result = processMajorityVote(vote, "p2", "yes");
      expect(result.passed).toBe(false);
      expect(result.failed).toBe(false);
      expect(result.updatedYesVoters?.has("p2")).toBe(true);
      expect(result.updatedNoVoters?.has("p2")).toBe(false);
    });

    it("allows switching from yes to no", () => {
      const vote = makeVote({ yesVoters: new Set(["p1", "p2"]) });
      const result = processMajorityVote(vote, "p2", "no");
      expect(result.passed).toBe(false);
      expect(result.updatedYesVoters?.has("p2")).toBe(false);
      expect(result.updatedNoVoters?.has("p2")).toBe(true);
    });

    it("switching from no to yes can trigger pass", () => {
      // p1,p3 voted yes; p2 voted no → p2 switches to yes → 3 yes → pass
      const vote = makeVote({
        yesVoters: new Set(["p1", "p3"]),
        noVoters: new Set(["p2"]),
      });
      const result = processMajorityVote(vote, "p2", "yes");
      expect(result.passed).toBe(true);
      expect(result.updatedYesVoters?.size).toBe(3);
      expect(result.updatedNoVoters?.size).toBe(0);
    });

    it("fails early when too many no votes make passing impossible", () => {
      // eligible=4, required=3: p2 no → p3 votes no → maxPossibleYes = 2 < 3
      const vote = makeVote({ noVoters: new Set(["p2"]) });
      const result = processMajorityVote(vote, "p3", "no");
      expect(result.passed).toBe(false);
      expect(result.failed).toBe(true);
    });

    it("does not fail early when passing is still possible", () => {
      // eligible=4, required=3: p2 votes no → maxPossibleYes = 3 >= 3
      const result = processMajorityVote(makeVote(), "p2", "no");
      expect(result.passed).toBe(false);
      expect(result.failed).toBe(false);
    });

    it("switching from yes to no can trigger fail", () => {
      // p1 yes, p2 no → p1 switches to no → maxPossibleYes = 2 < 3
      const vote = makeVote({ noVoters: new Set(["p2"]) });
      const result = processMajorityVote(vote, "p1", "no");
      expect(result.passed).toBe(false);
      expect(result.failed).toBe(true);
      expect(result.updatedYesVoters?.size).toBe(0);
      expect(result.updatedNoVoters?.size).toBe(2);
    });

    it("does not mutate original vote state", () => {
      const originalYesVoters = new Set(["p1"]);
      const originalNoVoters = new Set<string>();
      const vote = makeVote({
        yesVoters: originalYesVoters,
        noVoters: originalNoVoters,
      });

      processMajorityVote(vote, "p2", "yes");
      expect(originalYesVoters.size).toBe(1);
      expect(originalNoVoters.size).toBe(0);
    });
  });

  describe("formatVoteType", () => {
    it("formats resign", () => {
      expect(formatVoteType("resign")).toBe("resign");
    });

    it("formats offer_draw", () => {
      expect(formatVoteType("offer_draw")).toBe("offer draw");
    });

    it("formats accept_draw", () => {
      expect(formatVoteType("accept_draw")).toBe("accept draw");
    });
  });
});
