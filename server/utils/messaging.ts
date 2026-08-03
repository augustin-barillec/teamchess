import type { Socket } from "socket.io";
import type { Player } from "../types.js";
import { sessions, getIO, getOnlinePids } from "../state.js";
import { SENDER_SYSTEM } from "../shared_messages.js";

/**
 * Broadcasts the current player list to all clients.
 */
export function broadcastPlayers(): void {
  const onlinePids = getOnlinePids();

  const spectators: Player[] = [];
  const whitePlayers: Player[] = [];
  const blackPlayers: Player[] = [];

  for (const sess of sessions.values()) {
    const p: Player = {
      id: sess.pid,
      name: sess.name,
      connected: onlinePids.has(sess.pid),
    };
    if (sess.side === "white") whitePlayers.push(p);
    else if (sess.side === "black") blackPlayers.push(p);
    else spectators.push(p);
  }
  getIO().emit("players", { spectators, whitePlayers, blackPlayers });
}

/**
 * Sends a system message to all clients.
 */
export function sendSystemMessage(message: string): void {
  getIO().emit("chat_message", {
    sender: SENDER_SYSTEM,
    senderId: "system",
    message,
    system: true,
  });
}

/**
 * Sends a system message to a single socket (private, only visible to that client).
 */
export function sendPrivateSystemMessage(
  socket: Socket,
  message: string
): void {
  socket.emit("chat_message", {
    sender: SENDER_SYSTEM,
    senderId: "system",
    message,
    system: true,
  });
}
