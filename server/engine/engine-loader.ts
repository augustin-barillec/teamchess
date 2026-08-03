import { spawn } from "child_process";
import type { Engine } from "../types.js";

export function loadEngine(path: string): Engine {
  const args: string[] = [];

  if (path.slice(-3).toLowerCase() === ".js") {
    args.push(path);
    path = process.execPath;
  }

  const proc = spawn(path, args, { stdio: "pipe" });

  proc.on("error", (err) => {
    console.error("Stockfish engine process error:", err);
  });

  // A quit engine must never crash the server: without this handler, a write to
  // a dead stdin (e.g. the search-timeout "stop" arriving after quit()) raises
  // an uncaught EPIPE that would take the whole process down.
  proc.stdin.on("error", () => {});

  let pendingCallback: ((output: string) => void) | undefined;

  proc.stdout.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      if (pendingCallback) {
        if (
          line.startsWith("bestmove") ||
          line === "uciok" ||
          line === "readyok"
        ) {
          const cb = pendingCallback;
          pendingCallback = undefined;
          cb(line);
        }
      }
    }
  });

  return {
    send(command: string, callback?: (output: string) => void) {
      if (proc.killed) return;
      const cmd = command.trim();

      if (
        cmd.startsWith("position") ||
        cmd.startsWith("setoption") ||
        cmd === "ucinewgame" ||
        cmd === "stop" ||
        cmd === "flip"
      ) {
        proc.stdin.write(cmd + "\n");
        if (callback) setTimeout(callback, 0);
        return;
      }

      if (callback) {
        pendingCallback = callback;
      }
      proc.stdin.write(cmd + "\n");
    },

    quit() {
      proc.kill();
    },
  };
}
