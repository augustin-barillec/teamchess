import type { Player } from "./types";

export function shouldConfirmTeamAction(teamPlayers: Player[]): boolean {
  return teamPlayers.filter((p) => p.connected).length === 1;
}
