import type { Chat } from "@models/chat";
import { DateTime } from "luxon";
import { describe, expect, it, vi } from "vitest";

vi.mock("@storage/theme", () => ({
  t: (key: string) => key,
}));

import { mergeChats } from "./hammer.utils";

function createChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: 1,
    created_at: DateTime.fromSeconds(1),
    content: "hello",
    user_id: 1,
    user_name: "Alice",
    avatar: undefined,
    team_id: 20,
    team_name: "Team",
    game_id: 1,
    game_name: "Game",
    challenge_id: 10,
    challenge_name: "Challenge",
    checked: false,
    is_admin: false,
    ...overrides,
  };
}

describe("mergeChats", () => {
  it("keeps only current session chats and appends the solved system message", () => {
    const solvedAt = DateTime.fromSeconds(3);
    const merged = mergeChats(
      1,
      10,
      20,
      [
        createChat({ id: 2, created_at: DateTime.fromSeconds(2) }),
        createChat({ id: 3, team_id: 21 }),
        createChat({ id: 4, challenge_id: 11 }),
      ],
      solvedAt
    );

    expect(merged.map((chat) => chat.id)).toEqual([2, 0]);
    expect(merged[1]).toMatchObject({
      id: 0,
      game_id: 1,
      challenge_id: 10,
      team_id: 20,
      checked: true,
      is_admin: true,
    });
    expect(merged[1]?.created_at.toSeconds()).toBe(3);
  });

  it("produces a plain snapshot that can be reconciled into a store", () => {
    const current = mergeChats(1, 10, 20, [createChat({ id: 1 })], null);
    const next = mergeChats(
      1,
      10,
      20,
      [
        createChat({ id: 1, checked: true }),
        createChat({ id: 2, created_at: DateTime.fromSeconds(2), content: "next" }),
      ],
      null
    );

    // a fresh snapshot each time, so `reconcile(next, "id")` can diff it against
    // the store's current value instead of mutating the previous one in place
    expect(next).not.toBe(current);
    expect(next[0]).not.toBe(current[0]);
    expect(next[0]).toMatchObject({ id: 1, checked: true });
    expect(next[1]).toMatchObject({ id: 2, content: "next" });
  });
});
