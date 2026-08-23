import { Socket } from "socket.io";
import { sessions, getGameState, getAllSockets } from "../state.js";
import { DISCONNECT_GRACE_MS } from "../constants.js";
import { broadcastPlayers, sendSystemMessage } from "../utils/messaging.js";
import { endIfOneSided, tryFinalizeTurn } from "../game/gameLogic.js";
import { MSG } from "../shared_messages.js";

/**
 * Handles player disconnection with grace period for reconnection.
 */
export function leave(socket: Socket): void {
  const pid = socket.data.pid as string | undefined;
  if (!pid) return;

  const gameState = getGameState();
  const sess = sessions.get(pid);
  if (!sess) return;

  // Dropping the session is also what hands over the lead when the lead leaves:
  // see getLeadId(). Until then a disconnected lead keeps the role.
  const finalize = () => {
    if (sess.side === "white") gameState.whiteIds.delete(pid);
    if (sess.side === "black") gameState.blackIds.delete(pid);

    sessions.delete(pid);
    endIfOneSided();
    tryFinalizeTurn();
    broadcastPlayers();
  };

  if (sess.reconnectTimer) clearTimeout(sess.reconnectTimer);
  sess.reconnectTimer = setTimeout(() => {
    finalize();
  }, DISCONNECT_GRACE_MS);

  broadcastPlayers();
  tryFinalizeTurn();
}

/**
 * Executes a kick: adds target to blacklist, disconnects them.
 */
export function executeKick(targetPid: string, targetName: string): void {
  const gameState = getGameState();

  // Add to blacklist
  gameState.blacklist.add(targetPid);

  // Find and disconnect the target's socket
  for (const socket of getAllSockets()) {
    if (socket.data.pid === targetPid) {
      socket.emit("kicked", { message: MSG.youHaveBeenKicked });
      socket.disconnect();
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

  sendSystemMessage(MSG.playerKicked(targetName));
  broadcastPlayers();

  // The kicked player may have been the last of their team, or the only one
  // whose proposal was still awaited
  endIfOneSided();
  tryFinalizeTurn();
}
