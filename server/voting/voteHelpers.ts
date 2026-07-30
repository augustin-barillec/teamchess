import type { Session } from "../types.js";

/**
 * Snapshots pids as pid -> name, to freeze a vote's electorate at creation.
 */
export function rosterOf(
  pids: Set<string>,
  sessions: Map<string, Session>
): Map<string, string> {
  return new Map(
    Array.from(pids).map((pid) => [pid, sessions.get(pid)?.name || "Unknown"])
  );
}

/**
 * Resolves voter names from the vote's own frozen roster, not from live sessions: a voter
 * who has since disconnected or been kicked is still displayed under the name they voted
 * with.
 */
export function voterNames(
  pids: Set<string>,
  roster: ReadonlyMap<string, string>
): string[] {
  return Array.from(pids).map((pid) => roster.get(pid) || "Unknown");
}

export function currentVoteOf(
  pid: string,
  yes: Set<string>,
  no: Set<string>
): "yes" | "no" | null {
  if (yes.has(pid)) return "yes";
  if (no.has(pid)) return "no";
  return null;
}
