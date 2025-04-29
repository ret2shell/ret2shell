import { getSelfTeam, getTeamRank } from "@api/game";
import type { Game } from "@models/game";
import { type Team, TeamState } from "@models/team";
import { Permission, type User } from "@models/user";
import { DateTime } from "luxon";
import { createStore } from "solid-js/store";
import { accountStore } from "./account";
import { t } from "./theme";
import { addToast } from "./toast";

export const [gameStore, setGameStore] = createStore({
  games: [] as Game[],
  current: null as Game | null,
  preload: null as Game | null,
  team: null as Team | null,
  rank: null as number | null,
  score: null as number | null,
  members: [] as User[],
  showTeamCover: false,
});

export type GameStoreType = typeof gameStore;

export function appendGames(games: Game[]) {
  const ids = new Set(games.map((g) => g.id));
  setGameStore({
    games: [...gameStore.games.filter((g) => !ids.has(g.id)), ...games],
  });
}

export async function refreshSelfTeam() {
  if (gameStore.current && !isGameAdmin() && accountStore.permissions.includes(Permission.Verified)) {
    try {
      const team = await getSelfTeam(gameStore.current?.id);
      setGameStore({ team });
      if (!team) return;
      try {
        const rank = await getTeamRank(gameStore.current!.id, team.id);
        setGameStore({ rank });
      } catch {
        setGameStore({ rank: null });
      }
      if (team.state === TeamState.Pending) {
        addToast({
          level: "warning",
          description: t("team.status.pending.message")!,
          duration: 5000,
        });
      }
    } catch {
      setGameStore({ team: null });
    }
  }
}

export function inProgress() {
  if (
    gameStore.current?.start_at &&
    gameStore.current?.start_at < DateTime.now() &&
    gameStore.current?.end_at &&
    gameStore.current?.end_at > DateTime.now()
  ) {
    return true;
  }
  return false;
}

export function inRegister() {
  const register_end = gameStore.current?.can_register_after_started
    ? gameStore.current?.end_at
    : gameStore.current?.start_at;
  if (
    gameStore.current?.register_at &&
    gameStore.current?.register_at < DateTime.now() &&
    register_end &&
    register_end > DateTime.now()
  ) {
    return true;
  }
  return false;
}

export function inArchiving() {
  if (
    gameStore.current?.end_at &&
    gameStore.current?.end_at < DateTime.now() &&
    gameStore.current?.archive_at &&
    gameStore.current?.archive_at > DateTime.now()
  ) {
    return true;
  }
  return false;
}

export function inArchived() {
  if (gameStore.current?.archive_at && gameStore.current.archive_at < DateTime.now()) {
    return true;
  }
  return false;
}

export const canParticipate = () => {
  if (
    !gameStore.current?.can_register_after_started &&
    gameStore.current?.start_at &&
    gameStore.current.start_at < DateTime.now()
  ) {
    return false;
  }
  if (gameStore.current?.end_at && gameStore.current.end_at < DateTime.now()) {
    return false;
  }
  if (isGameAdmin()) {
    return false;
  }
  if (gameStore.current?.access_policy.restrict) {
    if (
      accountStore.info?.institute_id &&
      gameStore.current.access_policy.institutes.includes(accountStore.info.institute_id)
    )
      return true;
    return false;
  }

  return true;
};

export function canAccessChallenges(): [boolean, string] {
  if (!accountStore.id) return [false, t("general.network.status.401.title")!];
  if (isGameAdmin()) {
    return [true, ""];
  }
  if (gameStore.current?.start_at && gameStore.current.start_at > DateTime.now()) {
    return [false, t("game.notStarted")!];
  }
  if (inArchived()) {
    return [true, t("game.ended")!];
  }
  if (inProgress() || inArchiving()) {
    if (gameStore.team) {
      return [true, ""];
    }
  }
  if (gameStore.team?.state === TeamState.Pending) {
    return [false, t("team.status.pending.message")!];
  }
  if (gameStore.team?.state === TeamState.Banned) {
    return [false, t("team.status.banned.message")!];
  }
  return [false, t("team.status.empty.message")!];
}

export function isGameAdmin() {
  if (!accountStore.id) return false;
  if (gameStore.current?.admins.includes(accountStore.id) && accountStore.permissions.includes(Permission.Game)) {
    return true;
  }
  return false;
}

export function gameParticipateState() {
  if (gameStore.current?.register_at && gameStore.current.register_at > DateTime.now()) {
    return [false, t("game.registerNotStarted")!];
  }
  if (!inRegister()) {
    return [false, t("game.registerEnded")!];
  }
  return [true, ""];
}

// find the last one
export function currentTimelinePeriod() {
  const len = gameStore.current?.timeline_presets?.length;
  const sortedTimeline = gameStore.current?.timeline_presets?.sort(
    (a, b) => a.start_at.toMillis() - b.start_at.toMillis()
  );
  if (!len) return null;
  for (let i = len; i > 0; i--) {
    const period = sortedTimeline![i - 1];
    if (period.start_at < DateTime.now() && period.end_at > DateTime.now()) {
      return period;
    }
  }
}
