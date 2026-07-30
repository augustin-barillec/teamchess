import { describe, it, expect, afterEach, vi } from "vitest";
import type { Socket } from "socket.io";
import { ENGINE_MOVE_TIMEOUT_MS } from "../constants.js";
import { MSG } from "../shared_messages.js";
import {
  MockGameContext,
  type MockSocket,
} from "../context/MockGameContext.js";
import { GameStatus } from "../shared_types.js";
import { handlePlayMove, handleJoinSide } from "../socket/eventHandlers.js";
import { leave } from "../players/playerManager.js";

function asSocket(s: MockSocket): Socket {
  return s as unknown as Socket;
}

function setupAwaitingProposals(
  whiteCount: number,
  blackCount = 1
): {
  ctx: MockGameContext;
  whites: MockSocket[];
  blacks: MockSocket[];
} {
  const ctx = new MockGameContext();
  ctx.gameState.status = GameStatus.AwaitingProposals;
  ctx.gameState.side = "white";

  const whites: MockSocket[] = [];
  for (let i = 0; i < whiteCount; i++) {
    whites.push(ctx.addPlayer(`w${i}`, `White${i}`, "white"));
  }
  const blacks: MockSocket[] = [];
  for (let i = 0; i < blackCount; i++) {
    blacks.push(ctx.addPlayer(`b${i}`, `Black${i}`, "black"));
  }
  return { ctx, whites, blacks };
}

function wasFinalized(ctx: MockGameContext): boolean {
  return ctx
    .getEmittedData<{ status: GameStatus }>("game_status_update")
    .some((e) => e.status === GameStatus.FinalizingTurn);
}

let lastCtx: MockGameContext | null = null;

afterEach(() => {
  // chooseBestMove() resolves synchronously for a single candidate; the .then()
  // that advances the turn may schedule a clock interval after our assertions.
  // Clean it up to avoid leaking a timer into the next test.
  if (lastCtx?.gameState.timerInterval) {
    clearInterval(lastCtx.gameState.timerInterval);
    lastCtx.gameState.timerInterval = undefined;
  }
  for (const sess of lastCtx?.sessions.values() ?? []) {
    if (sess.reconnectTimer) clearTimeout(sess.reconnectTimer);
  }
  lastCtx = null;
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
      const { ctx, whites } = setupAwaitingProposals(2);
      lastCtx = ctx;

      handlePlayMove(asSocket(whites[0]), "e2e4", undefined, ctx);
      // Second proposal → 2/2 → finalization consults the engine for a choice
      handlePlayMove(asSocket(whites[1]), "d2d4", undefined, ctx);

      await vi.advanceTimersByTimeAsync(ENGINE_MOVE_TIMEOUT_MS);

      const chats = ctx.getEmittedData<{ message: string }>("chat_message");
      expect(chats.some((c) => c.message === MSG.engineFallback)).toBe(true);

      const selected = ctx.getEmittedData<{ lan: string }>("move_selected");
      expect(selected).toHaveLength(1);
      expect(["e2e4", "d2d4"]).toContain(selected[0].lan);

      // The turn moved on rather than hanging in FinalizingTurn
      expect(ctx.getEmittedData("turn_change")).toHaveLength(1);
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
    const { ctx, whites } = setupAwaitingProposals(1);
    lastCtx = ctx;

    handlePlayMove(asSocket(whites[0]), "e2e4", undefined, ctx);

    expect(wasFinalized(ctx)).toBe(true);
  });

  it("finalizes after join_side when a teammate becomes a spectator and the remaining member has already proposed", () => {
    const { ctx, whites } = setupAwaitingProposals(2);
    lastCtx = ctx;

    handlePlayMove(asSocket(whites[0]), "e2e4", undefined, ctx);
    expect(wasFinalized(ctx)).toBe(false);

    handleJoinSide(asSocket(whites[1]), "spectator", undefined, ctx);

    expect(wasFinalized(ctx)).toBe(true);
  });

  it("finalizes after leave when a teammate disconnects and the remaining member has already proposed", () => {
    const { ctx, whites } = setupAwaitingProposals(2);
    lastCtx = ctx;

    handlePlayMove(asSocket(whites[0]), "e2e4", undefined, ctx);
    expect(wasFinalized(ctx)).toBe(false);

    // Simulate socket disconnection: socket leaves io.sockets but session /
    // whiteIds remain during the grace period. leave() then fires an immediate
    // tryFinalizeTurn that sees only whites[0] as online & having proposed.
    const leavingSocket = whites[1];
    (
      ctx as unknown as { mockSockets: Map<string, MockSocket> }
    ).mockSockets.delete(leavingSocket.data.pid!);

    leave(asSocket(leavingSocket), ctx);

    expect(wasFinalized(ctx)).toBe(true);
  });
});
