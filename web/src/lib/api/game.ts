import type { Article } from "@models/article";
import type { Audit } from "@models/audit";
import type { Challenge, ChallengeEnv, CommitHistory } from "@models/challenge";
import type { Chat, ChatSession } from "@models/chat";
import type { Game, HostType } from "@models/game";
import type { Instance } from "@models/instance";
import type { Submission } from "@models/submission";
import { type Team, TeamState } from "@models/team";
import type { User } from "@models/user";
import type { Pod } from "kubernetes-types/core/v1";
import type { SearchParamsOption } from "ky";
import type { DateTime } from "luxon";
import api, { api_root } from ".";
import type { Extra } from "../models/extra";
import type { Hint } from "../models/hint";
import type { RegistryConfig } from "@models/config";

export async function getGames(page?: number, page_size?: number, host_type?: HostType, weight?: number) {
  return (
    await api.get(`${api_root}/game`, {
      searchParams: JSON.parse(
        JSON.stringify({
          page,
          page_size,
          host_type,
          weight,
        })
      ) as SearchParamsOption,
    })
  ).json<[Game[], number]>();
}

export async function getGame(id: number) {
  return await api.get(`${api_root}/game/${id}`).json<Game>();
}

export async function createGame(game: Game) {
  return await api.post(`${api_root}/game`, { json: game }).json<Game>();
}

export async function updateGame(id: number, game: Game) {
  return await api.patch(`${api_root}/game/${id}`, { json: game }).json<Game>();
}

export async function deleteGame(id: number) {
  return await api.delete(`${api_root}/game/${id}`).json<null>();
}

export async function getGameIntroduction(id: number) {
  return await api.get(`${api_root}/game/${id}/introduction`).json<Article>();
}

export async function updateGameIntroduction(id: number, article: Article) {
  return await api.patch(`${api_root}/game/${id}/introduction`, { json: article }).json<Article>();
}

export async function getGameScoreboard(
  id: number,
  page?: number,
  page_size?: number,
  with_hidden?: boolean,
  institute_id?: number
) {
  return (
    await api.get(`${api_root}/game/${id}/team`, {
      searchParams: JSON.parse(
        JSON.stringify({
          min_state: with_hidden ? TeamState.Hidden : TeamState.Passed,
          page,
          page_size,
          institute_id,
          asc: false,
          order: "score",
        })
      ) as SearchParamsOption,
    })
  ).json<[Team[], number]>();
}

export async function getChallengeList(game_id: number, page?: number, page_size?: number) {
  return (
    await api.get(`${api_root}/game/${game_id}/challenge`, {
      searchParams: JSON.parse(
        JSON.stringify({
          page,
          page_size,
        })
      ) as SearchParamsOption,
    })
  ).json<[Challenge[], number]>();
}

export async function getChallenge(game_id: number, challenge_id: number) {
  return await api.get(`${api_root}/game/${game_id}/challenge/${challenge_id}`).json<Challenge>();
}

export async function createChallenge(game_id: number, challenge: Challenge) {
  return await api.post(`${api_root}/game/${game_id}/challenge`, { json: challenge }).json<Challenge>();
}

export async function updateChallenge(game_id: number, challenge: Challenge) {
  return await api
    .patch(`${api_root}/game/${game_id}/challenge/${challenge.id}`, { json: challenge })
    .json<Challenge>();
}

export async function publishChallenge(game_id: number, challenge_id: number) {
  return await api.post(`${api_root}/game/${game_id}/challenge/${challenge_id}/publish`).json<Challenge>();
}

export async function withdrawChallenge(game_id: number, challenge_id: number) {
  return await api.delete(`${api_root}/game/${game_id}/challenge/${challenge_id}/publish`).json<Challenge>();
}

export async function deleteChallenge(game_id: number, challenge_id: number) {
  return await api.delete(`${api_root}/game/${game_id}/challenge/${challenge_id}`).json<void>();
}

export async function getChallengeHint(game_id: number, challenge_id: number) {
  return await api.get(`${api_root}/game/${game_id}/challenge/${challenge_id}/hint`).json<Hint[]>();
}

export async function unlockChallengeHint(game_id: number, challenge_id: number, hint_id: number) {
  return await api
    .post(`${api_root}/game/${game_id}/challenge/${challenge_id}/hint/unlock`, {
      json: {
        id: hint_id,
      },
    })
    .json<Extra>();
}

export async function createChallengeHint(game_id: number, challenge_id: number, hint: Hint) {
  return await api
    .post(`${api_root}/game/${game_id}/challenge/${challenge_id}/hint`, {
      json: hint,
    })
    .json<Hint[]>();
}

export async function deleteChallengeHint(game_id: number, challenge_id: number, hint_id: number) {
  return await api
    .delete(`${api_root}/game/${game_id}/challenge/${challenge_id}/hint`, {
      searchParams: {
        id: hint_id,
      },
    })
    .json<void>();
}

export async function getChallengeAttachments(
  game_id: number,
  challenge_id: number,
  all?: boolean,
  folder?: "static" | "mapped" | "checker"
) {
  return await api
    .get(`${api_root}/game/${game_id}/challenge/${challenge_id}/file`, {
      searchParams: JSON.parse(
        JSON.stringify({
          all,
          folder,
        })
      ) as SearchParamsOption,
    })
    .json<{ folder: "static" | "mapped" | "checker"; file: string }[]>();
}

export async function deleteChallengeAttachment(
  game_id: number,
  challenge_id: number,
  folder: "static" | "mapped" | "checker",
  file: string
) {
  return await api
    .delete(`${api_root}/game/${game_id}/challenge/${challenge_id}/file`, {
      searchParams: {
        folder,
        file,
      },
    })
    .json<void>();
}

export async function getChallengeEnv(game_id: number, challenge_id: number) {
  return await api.get(`${api_root}/game/${game_id}/challenge/${challenge_id}/env`).json<ChallengeEnv | null>();
}

export async function getChallengeInstance(game_id: number, challenge_id: number) {
  return await api.get(`${api_root}/game/${game_id}/challenge/${challenge_id}/instance`).json<Pod[]>();
}

export async function updateChallengeEnv(game_id: number, challenge_id: number, env: ChallengeEnv) {
  return await api
    .patch(`${api_root}/game/${game_id}/challenge/${challenge_id}/env`, {
      json: env,
    })
    .json<void>();
}

export async function deleteChallengeEnv(game_id: number, challenge_id: number) {
  return await api.delete(`${api_root}/game/${game_id}/challenge/${challenge_id}/env`).json<void>();
}

export async function getChallengeCheckerScript(game_id: number, challenge_id: number, lint?: boolean) {
  return await api
    .get(`${api_root}/game/${game_id}/challenge/${challenge_id}/checker`, {
      searchParams: JSON.parse(
        JSON.stringify({
          lint,
        })
      ),
    })
    .json<{
      script: string;
      lint?: string;
    }>();
}

export async function updateChallengeCheckerScript(game_id: number, challenge_id: number, content: string) {
  return await api
    .patch(`${api_root}/game/${game_id}/challenge/${challenge_id}/checker`, {
      json: {
        content,
      },
    })
    .json<void>();
}

export async function getChallengeSubmission(
  game_id: number,
  challenge_id: number,
  page: number,
  page_size: number,
  only_solved: boolean
) {
  return (
    await api.get(`${api_root}/game/${game_id}/challenge/${challenge_id}/submission`, {
      searchParams: JSON.parse(
        JSON.stringify({
          page,
          page_size,
          only_solved,
        })
      ) as SearchParamsOption,
    })
  ).json<[Submission[], number]>();
}

export async function getTeamInfo(game_id: number, team_id: number, ex?: boolean) {
  return await api
    .get(`${api_root}/game/${game_id}/team/${team_id}`, {
      searchParams: JSON.parse(
        JSON.stringify({
          ex,
        })
      ),
    })
    .json<Team>();
}

export async function getTeamRank(game_id: number, team_id: number) {
  return await api.get(`${api_root}/game/${game_id}/team/${team_id}/rank`).json<number>();
}

export async function updateTeamInfo(game_id: number, team_id: number, team: Team) {
  return await api
    .patch(`${api_root}/game/${game_id}/team/${team_id}`, {
      json: team,
    })
    .json<Team>();
}

export async function getTeamMembers(game_id: number, team_id: number) {
  return await api.get(`${api_root}/game/${game_id}/team/${team_id}/member`).json<User[]>();
}

export async function getSelfTeam(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/team/self`).json<Team>();
}

export async function updateSelfteam(
  game_id: number,
  team: {
    name: string;
    institute_id: number | null;
  }
) {
  return await api.patch(`${api_root}/game/${game_id}/team/self`, { json: team }).json<Team>();
}

export async function getTeamExtras(game_id: number, team_id: number) {
  return await api.get(`${api_root}/game/${game_id}/team/${team_id}/extra`).json<Extra[]>();
}

export async function createTeamExtra(game_id: number, team_id: number, extra: Extra) {
  return await api
    .post(`${api_root}/game/${game_id}/team/${team_id}/extra`, {
      json: extra,
    })
    .json<Extra>();
}

export async function getTeamSolves(game_id: number, team_id: number) {
  return await api.get(`${api_root}/game/${game_id}/team/${team_id}/solve`).json<Submission[]>();
}

export async function createTeam(
  game_id: number,
  team: {
    name: string;
  }
) {
  return await api.post(`${api_root}/game/${game_id}/team`, { json: team }).json<Team>();
}

export async function joinTeam(game_id: number, token: string) {
  return await api
    .patch(`${api_root}/game/${game_id}/team`, {
      json: {
        token,
      },
    })
    .json<Team>();
}

export type EventDeviceInfo = {
  client: string;
  address: string;
  connected_at: DateTime;
};

export async function getGameDevices(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/device`).json<EventDeviceInfo[]>();
}

export async function getGameAdmins(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/administrator`).json<User[]>();
}

export async function updateGameAdmins(game_id: number, admins: number[]) {
  return await api.patch(`${api_root}/game/${game_id}/administrator`, { json: admins }).json<Game>();
}

export async function getGameSelfEnvs(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/env`).json<Instance[]>();
}

export async function delayGameSelfEnv(game_id: number) {
  return await api.patch(`${api_root}/game/${game_id}/env`).json<void>();
}

export async function stopGameSelfEnv(game_id: number) {
  return await api.delete(`${api_root}/game/${game_id}/env`).json<void>();
}

export async function startChallengeEnv(game_id: number, challenge_id: number) {
  return await api.post(`${api_root}/game/${game_id}/challenge/${challenge_id}/env`).json<void>();
}

export async function getChallengeCommitHistory(game_id: number, challenge_id: number) {
  return await api.get(`${api_root}/game/${game_id}/challenge/${challenge_id}/history`).json<CommitHistory[]>();
}

export async function submitFlag(game_id: number, challenge_id: number, flag: string) {
  return await api
    .post(`${api_root}/game/${game_id}/challenge/${challenge_id}/submit`, {
      json: {
        content: flag,
      },
    })
    .json<Submission>();
}

export async function checkSubmissionStatus(game_id: number, challenge_id: number, submission_id: number) {
  return await api
    .get(`${api_root}/game/${game_id}/challenge/${challenge_id}/submit`, {
      searchParams: {
        id: submission_id,
      },
    })
    .json<Submission>();
}

export async function getSelfSolves(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/solve`).json<Submission[]>();
}

export async function getChallengeSolveStatus(game_id: number, challenge_id: number) {
  return await api.get(`${api_root}/game/${game_id}/challenge/${challenge_id}/submit`).json<{
    solved: boolean;
    solves: number;
  }>();
}

export async function getGameAdminChatSessions(game_id: number, page?: number, page_size?: number) {
  return await api
    .get(`${api_root}/game/${game_id}/chat/admin`, {
      searchParams: JSON.parse(
        JSON.stringify({
          page,
          page_size,
        })
      ) as SearchParamsOption,
    })
    .json<[ChatSession[], number]>();
}

export async function getGameAdminChatMessages(game_id: number, challenge_id: number, team_id: number) {
  return await api
    .get(`${api_root}/game/${game_id}/chat/admin/session`, {
      searchParams: {
        challenge_id,
        team_id,
      },
    })
    .json<Chat[]>();
}

export async function sendGameAdminChatMessage(
  game_id: number,
  challenge_id: number,
  team_id: number,
  content: string
) {
  return await api
    .post(`${api_root}/game/${game_id}/chat/admin/session`, {
      searchParams: {
        challenge_id,
        team_id,
      },
      json: {
        content,
      },
    })
    .json<void>();
}

export async function getGamePlayerChatMessages(game_id: number, challenge_id: number) {
  return await api.get(`${api_root}/game/${game_id}/chat/${challenge_id}`).json<Chat[]>();
}

export async function sendGamePlayerChatMessage(game_id: number, challenge_id: number, content: string) {
  return await api
    .post(`${api_root}/game/${game_id}/chat/${challenge_id}`, {
      json: {
        content,
      },
    })
    .json<void>();
}

export async function checkUnreadMessages(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/chat/unread`).json<Chat[]>();
}

export async function getTeamList(
  game_id: number,
  page?: number,
  page_size?: number,
  order?: string,
  filter?: string,
  institute_id?: number
) {
  return await api
    .get(`${api_root}/game/${game_id}/team`, {
      searchParams: JSON.parse(
        JSON.stringify({
          min_state: TeamState.Banned,
          asc: true,
          page,
          page_size,
          order,
          filter,
          institute_id,
        })
      ) as SearchParamsOption,
    })
    .json<[Team[], number]>();
}

export async function getGameSubmissions(game_id: number, page?: number, page_size?: number) {
  return (
    await api.get(`${api_root}/game/${game_id}/submission`, {
      searchParams: JSON.parse(
        JSON.stringify({
          page,
          page_size,
        })
      ) as SearchParamsOption,
    })
  ).json<[Submission[], number]>();
}

export async function getGameAuditLogs(game_id: number, page?: number, page_size?: number) {
  return (
    await api.get(`${api_root}/game/${game_id}/audit`, {
      searchParams: JSON.parse(
        JSON.stringify({
          page,
          page_size,
        })
      ) as SearchParamsOption,
    })
  ).json<[Audit[], number]>();
}

export async function updateGameAuditLog(game_id: number, audit_id: number, audit: Audit) {
  return await api
    .patch(`${api_root}/game/${game_id}/audit/${audit_id}`, {
      json: audit,
    })
    .json<Audit>();
}

export type GameStatistics = {
  total_players: number;
  institute_players: { [key: number]: number };
  total_teams: number;
  total_passed_teams: number;
  institute_teams: { [key: number]: number };
  total_submissions: number;
  total_solves: number;
  challenge_submissions: { [key: number]: number };
  challenge_solves: { [key: number]: number };
};

export async function getGameStatistics(game_id: number, in_game?: boolean, institute?: number) {
  return await api
    .get(`${api_root}/game/${game_id}/statistics`, {
      searchParams: JSON.parse(
        JSON.stringify({
          in_game,
          institute,
        })
      ),
    })
    .json<GameStatistics>();
}

export type GameStatisticsExport = {
  statistics: GameStatistics;
  scoreboard: [Team, User[]][];
  audits: Audit[];
};

export async function getGameStatisticsExport(game_id: number, in_game?: boolean, institute?: number) {
  return await api
    .get(`${api_root}/game/${game_id}/statistics/export`, {
      searchParams: JSON.parse(
        JSON.stringify({
          in_game,
          institute,
        })
      ),
    })
    .json<GameStatisticsExport>();
}

export async function getChallengeAnswer(game_id: number, challenge_id: number) {
  return await api.get(`${api_root}/game/${game_id}/challenge/${challenge_id}/answer`).json<string>();
}

export async function updateChallengeAnswer(game_id: number, challenge_id: number, answer: string) {
  return await api
    .patch(`${api_root}/game/${game_id}/challenge/${challenge_id}/answer`, {
      json: answer,
    })
    .json<string>();
}

export async function getRegistryConfig(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/registry/config`).json<RegistryConfig>();
}

export async function getRegistryRepositories(game_id: number) {
  return await api.get(`${api_root}/game/${game_id}/registry`).json<string[]>();
}

export async function getRegistryImageTags(game_id: number, repo: string) {
  return await api.get(`${api_root}/game/${game_id}/registry/${repo}`).json<string[]>();
}
