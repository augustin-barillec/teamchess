import { describe, it, expect } from "vitest";
import { Socket } from "socket.io";
import { handleChatMessage } from "./eventHandlers.js";
import { TestGame } from "../testUtils.js";

function fakeSocket(pid: string, name: string): Socket {
  return {
    data: { pid, name, side: "white" },
  } as unknown as Socket;
}

describe("handleChatMessage", () => {
  it("broadcasts a non-empty message via io.emit with sender + senderId + message", () => {
    const game = new TestGame();
    game.addPlayer("p1", "Alice", "white");
    const socket = fakeSocket("p1", "Alice");

    handleChatMessage(socket, "hello");

    const chats = game.getEmittedData<{
      sender: string;
      senderId: string;
      message: string;
    }>("chat_message");
    expect(chats).toHaveLength(1);
    expect(chats[0]).toEqual({
      sender: "Alice",
      senderId: "p1",
      message: "hello",
    });
  });

  it("trims the message before broadcasting", () => {
    const game = new TestGame();
    game.addPlayer("p1", "Alice", "white");
    const socket = fakeSocket("p1", "Alice");

    handleChatMessage(socket, "   hi there  ");

    const chats = game.getEmittedData<{ message: string }>("chat_message");
    expect(chats[0].message).toBe("hi there");
  });

  it("ignores an empty message", () => {
    const game = new TestGame();
    game.addPlayer("p1", "Alice", "white");
    const socket = fakeSocket("p1", "Alice");

    handleChatMessage(socket, "");

    expect(game.getEmittedData("chat_message")).toHaveLength(0);
  });

  it("ignores a whitespace-only message", () => {
    const game = new TestGame();
    game.addPlayer("p1", "Alice", "white");
    const socket = fakeSocket("p1", "Alice");

    handleChatMessage(socket, "   \t  \n ");

    expect(game.getEmittedData("chat_message")).toHaveLength(0);
  });

  it("uses the sender's name from socket.data, not from any payload field", () => {
    const game = new TestGame();
    game.addPlayer("p1", "Alice", "white");
    const socket = fakeSocket("p1", "Alice");

    handleChatMessage(socket, "hi");

    const chats = game.getEmittedData<{ sender: string; senderId: string }>(
      "chat_message"
    );
    expect(chats[0].sender).toBe("Alice");
    expect(chats[0].senderId).toBe("p1");
  });
});
