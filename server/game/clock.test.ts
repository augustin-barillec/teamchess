import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { GameState } from "../types.js";
import { TestGame } from "../testUtils.js";
import { GameStatus, EndReason } from "../shared_types.js";
import { startClock, stopClock } from "./clock.js";

/**
 * The clock is the only game-ending path that no player action triggers: a
 * timeout ends the game on its own, so nothing else — unit or e2e — exercises
 * it. Fake timers let us run out a pendulum in milliseconds.
 */

let game: TestGame;

/** A game in progress, clock not started yet. */
function running(overrides: Partial<GameState> = {}): TestGame {
  game = new TestGame({
    status: GameStatus.AwaitingProposals,
    side: "white",
    ...overrides,
  });
  return game;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  game?.cleanup();
  vi.useRealTimers();
});

describe("startClock", () => {
  it("does nothing while the game is not awaiting proposals", () => {
    const game = running({ status: GameStatus.Setup });

    startClock();
    vi.advanceTimersByTime(5000);

    expect(game.gameState.timerInterval).toBeUndefined();
    expect(game.hasEmitted("clock_update")).toBe(false);
    expect(game.gameState.whiteTime).toBe(600);
  });

  it("broadcasts the current times as soon as it starts", () => {
    const game = running({ whiteTime: 120, blackTime: 90 });

    startClock();

    expect(game.getLastEmittedData("clock_update")).toEqual({
      whiteTime: 120,
      blackTime: 90,
    });
  });

  it("counts down the side to move, one second at a time", () => {
    const game = running({ side: "white" });

    startClock();
    vi.advanceTimersByTime(3000);

    expect(game.gameState.whiteTime).toBe(597);
    expect(game.gameState.blackTime).toBe(600);
    // one broadcast on start, then one per tick
    expect(game.getEmittedData("clock_update")).toHaveLength(4);
  });

  it("counts down black when it is black's turn", () => {
    const game = running({ side: "black" });

    startClock();
    vi.advanceTimersByTime(3000);

    expect(game.gameState.blackTime).toBe(597);
    expect(game.gameState.whiteTime).toBe(600);
  });

  it("replaces a running clock instead of stacking a second one", () => {
    const game = running();

    startClock();
    startClock();
    vi.advanceTimersByTime(1000);

    // Two live intervals would burn two seconds per tick
    expect(game.gameState.whiteTime).toBe(599);
  });

  it("ends the game in favour of black when white flags", () => {
    const game = running({ side: "white", whiteTime: 1 });

    startClock();
    vi.advanceTimersByTime(1000);

    expect(game.gameState.status).toBe(GameStatus.Over);
    expect(game.gameState.endReason).toBe(EndReason.Timeout);
    expect(game.gameState.endWinner).toBe("black");
    expect(game.hasEmitted("game_over")).toBe(true);
  });

  it("ends the game in favour of white when black flags", () => {
    const game = running({ side: "black", blackTime: 1 });

    startClock();
    vi.advanceTimersByTime(1000);

    expect(game.gameState.status).toBe(GameStatus.Over);
    expect(game.gameState.endWinner).toBe("white");
  });

  it("names the winner after the clock that ran out, not the side to move", () => {
    // The two agree in normal play. This pins the rule for the day they don't:
    // black is out of time while it is white's turn — black must lose.
    const game = running({ side: "white", whiteTime: 300, blackTime: 0 });

    startClock();
    vi.advanceTimersByTime(1000);

    expect(game.gameState.endReason).toBe(EndReason.Timeout);
    expect(game.gameState.endWinner).toBe("white");
  });

  it("stops counting once the game has ended on time", () => {
    const game = running({ side: "white", whiteTime: 1 });

    startClock();
    vi.advanceTimersByTime(1000);
    const updatesAtTimeout = game.getEmittedData("clock_update").length;

    vi.advanceTimersByTime(5000);

    // The interval is really cleared, not merely flagged: no drift into negatives
    expect(game.gameState.timerInterval).toBeUndefined();
    expect(game.gameState.whiteTime).toBe(0);
    expect(game.getEmittedData("clock_update")).toHaveLength(updatesAtTimeout);
  });
});

describe("stopClock", () => {
  it("freezes the countdown and releases the interval", () => {
    const game = running();

    startClock();
    vi.advanceTimersByTime(1000);
    stopClock();
    vi.advanceTimersByTime(5000);

    expect(game.gameState.whiteTime).toBe(599);
    expect(game.gameState.timerInterval).toBeUndefined();
  });

  it("is a no-op when no clock is running", () => {
    const game = running();

    expect(() => stopClock()).not.toThrow();
    expect(game.gameState.timerInterval).toBeUndefined();
  });
});
