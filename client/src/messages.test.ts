import { describe, it, expect } from "vitest";
import { UI } from "./messages.js";

describe("messages", () => {
  it("kickTooltip includes the player name", () => {
    expect(UI.kickTooltip("Alice")).toBe("Kick Alice");
  });

  it("confirmKick includes the player name", () => {
    expect(UI.confirmKick("Alice")).toBe("Kick Alice?");
  });
});
