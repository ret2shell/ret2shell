import type { Chat } from "@models/chat";
import { t } from "@storage/theme";
import type { DateTime } from "luxon";

function createSolvedChat(gameId: number, challengeId: number, teamId: number, solvedAt: DateTime): Chat {
  return {
    id: 0,
    user_id: 0,
    user_name: "Ciallo～(∠・ω< )⌒☆",
    avatar: undefined,
    content: `${t("challenge.hammer.solved")} ٩(๑•ω•๑)۶`,
    created_at: solvedAt,
    is_admin: true,
    challenge_id: challengeId,
    team_id: teamId,
    checked: true,
    game_id: gameId,
  };
}

export function mergeChatItems(existing: Chat[], incoming: Chat[]): Chat[] {
  const byId = new Map<number, Chat>();
  for (const item of existing) byId.set(item.id, item);
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.created_at.toMillis() - b.created_at.toMillis() || a.id - b.id);
}

export function mergeChats(
  gameId: number,
  challengeId: number,
  teamId: number,
  chats: Chat[],
  solvedAt: DateTime | null
): Chat[] {
  const merged = chats.filter((chat) => chat.challenge_id === challengeId && chat.team_id === teamId);

  if (solvedAt) {
    merged.push(createSolvedChat(gameId, challengeId, teamId, solvedAt));
  }

  return mergeChatItems([], merged);
}
