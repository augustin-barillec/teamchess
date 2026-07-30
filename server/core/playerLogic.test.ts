import { describe, it, expect } from "vitest";
import { shouldEndDueToAbandonment } from "./playerLogic.js";

describe("playerLogic", () => {
  describe("shouldEndDueToAbandonment", () => {
    it("returns shouldEnd false when both teams have players", () => {
      const whiteIds = new Set(["p1"]);
      const blackIds = new Set(["p2"]);

      const result = shouldEndDueToAbandonment(whiteIds, blackIds);

      expect(result.shouldEnd).toBe(false);
    });

    it("returns white as winner when black is empty", () => {
      const whiteIds = new Set(["p1"]);
      const blackIds = new Set<string>();

      const result = shouldEndDueToAbandonment(whiteIds, blackIds);

      expect(result.shouldEnd).toBe(true);
      expect(result.winner).toBe("white");
    });

    it("returns black as winner when white is empty", () => {
      const whiteIds = new Set<string>();
      const blackIds = new Set(["p1"]);

      const result = shouldEndDueToAbandonment(whiteIds, blackIds);

      expect(result.shouldEnd).toBe(true);
      expect(result.winner).toBe("black");
    });

    it("returns null winner when both teams are empty", () => {
      const whiteIds = new Set<string>();
      const blackIds = new Set<string>();

      const result = shouldEndDueToAbandonment(whiteIds, blackIds);

      expect(result.shouldEnd).toBe(true);
      expect(result.winner).toBeNull();
    });
  });
});
