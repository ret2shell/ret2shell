import type { Chat } from "@models/chat";
import { DateTime } from "luxon";
import { reconcile } from "solid-js/store";
import { describe, expect, it, vi } from "vitest";

vi.mock("@storage/theme", () => ({
  t: (key: string) => key,
}));

import { mergeChatItems, mergeChats } from "./hammer.utils";

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

describe("mergeChatItems", () => {
  it("dedupes by id and keeps ascending order", () => {
    const merged = mergeChatItems(
      [createChat({ id: 2, created_at: DateTime.fromSeconds(2) })],
      [
        createChat({ id: 3, created_at: DateTime.fromSeconds(3) }),
        createChat({ id: 1, created_at: DateTime.fromSeconds(1) }),
        createChat({ id: 2, created_at: DateTime.fromSeconds(2) }),
      ]
    );

    expect(merged.map((chat) => chat.id)).toEqual([1, 2, 3]);
  });

  it("replaces existing items with incoming ones sharing the same id", () => {
    const merged = mergeChatItems(
      [createChat({ id: 1, checked: false, content: "old" })],
      [createChat({ id: 1, checked: true, content: "new" })]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 1, checked: true, content: "new" });
  });

  it("breaks created_at ties by id", () => {
    const at = DateTime.fromSeconds(5);
    const merged = mergeChatItems(
      [createChat({ id: 3, created_at: at })],
      [createChat({ id: 2, created_at: at }), createChat({ id: 1, created_at: at })]
    );

    expect(merged.map((chat) => chat.id)).toEqual([1, 2, 3]);
  });
});

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

  it("produces a snapshot that reconcile can update in place", () => {
    const current = mergeChats(1, 10, 20, [createChat({ id: 1 })], null);
    const firstChat = current[0];

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

    const reconciled = reconcile(next, { key: "id" })(current);

    expect(reconciled).toBe(current);
    expect(current[0]).toBe(firstChat);
    expect(current[0]).toMatchObject({ id: 1, checked: true });
    expect(current[1]).toMatchObject({ id: 2, content: "next" });
  });
});
