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
  const match = /^@([a-zA-Z0-9_-]+)#(\d+)(?:[ \t]+([\s\S]*))?$/.exec(content.trim());
  if (!match) return null;
  return {
    reference: { account: match[1], messageId: Number.parseInt(match[2], 10) },
    rest: match[3] ?? "",
  };
}

/**
 * Resolve the reference against the session's messages: it is only valid when
 * both the account and the message id match a message in this session (from a
 * player or an admin).
 */
export function resolveChatReference(
  messages: Chat[],
  reference: ChatReference,
  rest: string
): { message: Chat; reaction: boolean } | null {
  const target = messages.find((m) => m.id === reference.messageId && m.user_account === reference.account);
  if (!target) return null;
  return { message: target, reaction: restIsSingleMoji(rest) };
}

function restIsSingleMoji(rest: string): boolean {
  return singleMojiOf(rest) !== undefined;
}

export type AggregatedReaction = {
  /** icon class of the reaction emoji */
  icon: string;
  /** at most 4 display labels, repeated reactors carry ×count */
  labels: string[];
  /** labels hidden behind the +N overflow hint */
  overflow: string[];
  /** distinct reacting users */
  users: number;
  /** total reactions including repeats */
  count: number;
};

/**
 * Merge the reactions collected under one message: same-emoji reactions
 * collapse into a single tag with comma-separated names; beyond four names
 * the rest go behind a +N overflow hint; repeated reactions from the same
 * user render as `name ×count`.
 */
export function aggregateReactions(reactions: { icon: string; label: string }[]): AggregatedReaction[] {
  // icon -> (label -> count), insertion ordered
  const byIcon = new Map<string, Map<string, number>>();
  for (const reaction of reactions) {
    const users = byIcon.get(reaction.icon) ?? new Map();
    users.set(reaction.label, (users.get(reaction.label) ?? 0) + 1);
    byIcon.set(reaction.icon, users);
  }
  return [...byIcon.entries()].map(([icon, users]) => {
    const entries = [...users.entries()];
    const decorate = ([name, n]: [string, number]) => (n > 1 ? `${name}×${n}` : name);
    return {
      icon,
      labels: entries.slice(0, 4).map(decorate),
      overflow: entries.slice(4).map(decorate),
      users: entries.length,
      count: entries.reduce((sum, [, n]) => sum + n, 0),
    };
  });
}
