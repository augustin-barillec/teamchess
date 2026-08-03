import { describe, it, expect, afterEach, vi } from "vitest";
import type { Socket } from "socket.io";
import { ENGINE_MOVE_TIMEOUT_MS } from "../constants.js";
import { MSG } from "../shared_messages.js";
import { TestGame, type FakeSocket } from "../testUtils.js";
import { GameStatus, EndReason } from "../shared_types.js";
import { handlePlayMove, handleJoinSide } from "../socket/eventHandlers.js";
import { endGame, executeGameReset } from "./gameLogic.js";
import { leave } from "../players/playerManager.js";

// executeGameReset builds a real engine; keep it from spawning a process in tests
vi.mock("../engine/stockfish.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../engine/stockfish.js")>();
  return { ...mod, createEngine: () => ({ send: () => {}, quit: () => {} }) };
});

function asSocket(s: FakeSocket): Socket {
  return s as unknown as Socket;
}

function setupAwaitingProposals(
  whiteCount: number,
  blackCount = 1
): {
  game: TestGame;
  whites: FakeSocket[];
  blacks: FakeSocket[];
} {
  const game = new TestGame({
    status: GameStatus.AwaitingProposals,
    side: "white",
  });

  const whites: FakeSocket[] = [];
  for (let i = 0; i < whiteCount; i++) {
    whites.push(game.addPlayer(`w${i}`, `White${i}`, "white"));
  }
  const blacks: FakeSocket[] = [];
  for (let i = 0; i < blackCount; i++) {
    blacks.push(game.addPlayer(`b${i}`, `Black${i}`, "black"));
  }
  return { game, whites, blacks };
}

function wasFinalized(game: TestGame): boolean {
  return game
    .getEmittedData<{ status: GameStatus }>("game_status_update")
    .some((e) => e.status === GameStatus.FinalizingTurn);
}

let lastGame: TestGame | null = null;

afterEach(() => {
  // chooseBestMove() resolves synchronously for a single candidate; the .then()
  // that advances the turn may schedule a clock interval after our assertions.
  // Clean it up to avoid leaking a timer into the next test.
  lastGame?.cleanup();
  lastGame = null;
});

/**
 * Locks the engine-failure fallback: when Stockfish cannot pick a move, the turn must
 * still advance on one of the proposals and the players must be told — never freeze on
 * FinalizingTurn. The mock engine never invokes its callback, so the search times out.
 */
describe("engine fallback", () => {
  it("plays a random proposal and warns when the engine never answers", async () => {
    vi.useFakeTimers();
    try {
      const { game, whites } = setupAwaitingProposals(2);
      lastGame = game;

      handlePlayMove(asSocket(whites[0]), "e2e4");
      // Second proposal → 2/2 → finalization consults the engine for a choice
      handlePlayMove(asSocket(whites[1]), "d2d4");

      await vi.advanceTimersByTimeAsync(ENGINE_MOVE_TIMEOUT_MS);

      const chats = game.getEmittedData<{ message: string }>("chat_message");
      expect(chats.some((c) => c.message === MSG.engineFallback)).toBe(true);

      const selected = game.getEmittedData<{ lan: string }>("move_selected");
      expect(selected).toHaveLength(1);
      expect(["e2e4", "d2d4"]).toContain(selected[0].lan);

      // The turn moved on rather than hanging in FinalizingTurn
      expect(game.getEmittedData("turn_change")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * A game end or reset can happen while the engine is thinking. The pending
 * search must then be dropped: it belongs to a game that no longer exists.
 */
describe("stale engine answers", () => {
  it("ignores the engine answer arriving after a reset", async () => {
    vi.useFakeTimers();
    try {
      const { game, whites } = setupAwaitingProposals(2);
      lastGame = game;

      handlePlayMove(asSocket(whites[0]), "e2e4");
      handlePlayMove(asSocket(whites[1]), "d2d4");
      expect(game.gameState.status).toBe(GameStatus.FinalizingTurn);

      executeGameReset();
      expect(game.gameState.status).toBe(GameStatus.Setup);
      game.clearEmittedEvents();

      // The stale search resolves via its timeout fallback — and must be dropped
      await vi.advanceTimersByTimeAsync(ENGINE_MOVE_TIMEOUT_MS);

      expect(game.hasEmitted("move_selected")).toBe(false);
      expect(game.hasEmitted("turn_change")).toBe(false);
      expect(game.gameState.status).toBe(GameStatus.Setup);
      expect(game.gameState.timerInterval).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores the engine answer arriving after the game ended", async () => {
    vi.useFakeTimers();
    try {
      const { game, whites } = setupAwaitingProposals(2);
      lastGame = game;

      handlePlayMove(asSocket(whites[0]), "e2e4");
      handlePlayMove(asSocket(whites[1]), "d2d4");
      expect(game.gameState.status).toBe(GameStatus.FinalizingTurn);

      // e.g. a resign vote passing while the engine is thinking
      endGame(EndReason.Resignation, "black");
      expect(game.gameState.status).toBe(GameStatus.Over);
      game.clearEmittedEvents();

      await vi.advanceTimersByTimeAsync(ENGINE_MOVE_TIMEOUT_MS);

      expect(game.hasEmitted("move_selected")).toBe(false);
      expect(game.gameState.status).toBe(GameStatus.Over);
      // The clock of the finished game was not restarted
      expect(game.gameState.timerInterval).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * The event-driven finalization relies on tryFinalizeTurn() being called after
 * every event that can change (activeCount, movesCount). These tests lock that
 * invariant so adding a new event path without wiring it up won't silently
 * break turn progression.
 */
describe("turn finalization invariant", () => {
  it("finalizes after play_move when the proposer is the only active team member", () => {
    const { game, whites } = setupAwaitingProposals(1);
    lastGame = game;

    handlePlayMove(asSocket(whites[0]), "e2e4");

    expect(wasFinalized(game)).toBe(true);
  });

  it("finalizes after join_side when a teammate becomes a spectator and the remaining member has already proposed", () => {
    const { game, whites } = setupAwaitingProposals(2);
    lastGame = game;

    handlePlayMove(asSocket(whites[0]), "e2e4");
    expect(wasFinalized(game)).toBe(false);

    handleJoinSide(asSocket(whites[1]), "spectator");

    expect(wasFinalized(game)).toBe(true);
  });

  it("finalizes after leave when a teammate disconnects and the remaining member has already proposed", () => {
    const { game, whites } = setupAwaitingProposals(2);
    lastGame = game;

    handlePlayMove(asSocket(whites[0]), "e2e4");
    expect(wasFinalized(game)).toBe(false);

    // Simulate socket disconnection: socket leaves io.sockets but session /
    // whiteIds remain during the grace period. leave() then fires an immediate
    // tryFinalizeTurn that sees only whites[0] as online & having proposed.
    const leavingSocket = whites[1];
    game.disconnectSocket(leavingSocket.data.pid!);

    leave(asSocket(leavingSocket));

    expect(wasFinalized(game)).toBe(true);
  });
});
