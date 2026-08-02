import { Socket } from "socket.io";
import type { IGameContext } from "../context/GameContext.js";
import { globalContext } from "../context/GlobalContextAdapter.js";
import { DISCONNECT_GRACE_MS } from "../constants.js";
import { broadcastPlayers, sendSystemMessage } from "../utils/messaging.js";
import { endIfOneSided, tryFinalizeTurn } from "../game/gameLogic.js";
import { MSG } from "../shared_messages.js";

/**
 * Handles player disconnection with grace period for reconnection.
 * @param ctx Optional context for dependency injection (defaults to global)
 */
export function leave(socket: Socket, ctx: IGameContext = globalContext): void {
  const pid = socket.data.pid as string | undefined;
  if (!pid) return;

  const { sessions, gameState } = ctx;
  const sess = sessions.get(pid);
  if (!sess) return;

  const finalize = () => {
    if (sess.side === "white") gameState.whiteIds.delete(pid);
    if (sess.side === "black") gameState.blackIds.delete(pid);

    sessions.delete(pid);
    endIfOneSided(ctx);
    tryFinalizeTurn(ctx);
    broadcastPlayers(ctx);
  };

  if (sess.reconnectTimer) clearTimeout(sess.reconnectTimer);
  sess.reconnectTimer = setTimeout(() => {
    finalize();
  }, DISCONNECT_GRACE_MS);

  broadcastPlayers(ctx);
  tryFinalizeTurn(ctx);
}

/**
 * Executes a kick: adds target to blacklist, disconnects them.
 */
export function executeKick(
  targetPid: string,
  targetName: string,
  ctx: IGameContext = globalContext
): void {
  const { gameState, sessions } = ctx;

  // Add to blacklist
  gameState.blacklist.add(targetPid);

  // Find and disconnect the target's socket
  for (const socket of ctx.getAllSockets()) {
    if (socket.data.pid === targetPid) {
      socket.emit("kicked", { message: MSG.youHaveBeenKicked });
      // For real sockets, we need to disconnect them
      if ("disconnect" in socket && typeof socket.disconnect === "function") {
        (socket as unknown as { disconnect: () => void }).disconnect();
      }
    }
  }

  // Clean up session
  const sess = sessions.get(targetPid);
  if (sess) {
    if (sess.side === "white") gameState.whiteIds.delete(targetPid);
    if (sess.side === "black") gameState.blackIds.delete(targetPid);
    if (sess.reconnectTimer) clearTimeout(sess.reconnectTimer);
    sessions.delete(targetPid);
  }

  sendSystemMessage(MSG.playerKicked(targetName), ctx);
  broadcastPlayers(ctx);
}
