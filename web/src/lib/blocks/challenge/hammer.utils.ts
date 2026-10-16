import { singleMojiOf } from "@lib/moji";
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

export type ChatReference = {
  /** account of the referenced player, without the leading `@` */
  account: string;
  /** id of the referenced message */
  messageId: number;
};

/**
 * Shared prefix format for replies and reactions:
 *
 *     @account#message-id <rest>
 *
 * When `rest` is exactly one `:moji:` the message is a reaction, otherwise a
 * reply quoting `rest` as the body. Returns null when the content does not
 * start with the reference prefix shape.
 */
export function parseChatReference(content: string): { reference: ChatReference; rest: string } | null {
  const match = /^@([a-zA-Z0-9_-]+)#(\d+)[ \t]+([\s\S]+)$/.exec(content);
  if (!match) return null;
  return {
    reference: { account: match[1], messageId: Number.parseInt(match[2], 10) },
    rest: match[3],
  };
}

/**
 * Resolve the reference against the session's messages: it is only valid when
 * both the account and the message id match a player message in this session
 * (admin messages are not referenceable).
 */
export function resolveChatReference(
  messages: Chat[],
  reference: ChatReference,
  rest: string
): { message: Chat; reaction: boolean } | null {
  const target = messages.find(
    (m) => m.id === reference.messageId && m.user_account === reference.account && !m.is_admin
  );
  if (!target) return null;
  return { message: target, reaction: restIsSingleMoji(rest) };
}

function restIsSingleMoji(rest: string): boolean {
  return singleMojiOf(rest) !== undefined;
}
