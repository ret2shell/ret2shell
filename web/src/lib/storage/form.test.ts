import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@solid-primitives/storage", () => ({
  makePersisted<T>(value: T) {
    return value;
  },
}));

import {
  buildFormDraftKey,
  clearFormDraft,
  getFormDraft,
  hasFormDraft,
  mergeFormDraft,
  resetFormDraftStore,
  setFormDraft,
} from "./form";

describe("form draft storage", () => {
  beforeEach(() => {
    resetFormDraftStore();
  });

  it("builds stable draft keys", () => {
    expect(buildFormDraftKey("games", 12, "edit")).toBe("games/12/edit");
    expect(buildFormDraftKey("games", null, "edit", undefined)).toBe("games/edit");
  });

  it("stores and clears drafts", () => {
    setFormDraft("platform/email", { enabled: true, host: "smtp.example.com" });

    expect(hasFormDraft("platform/email")).toBe(true);
    expect(getFormDraft<{ enabled: boolean; host: string }>("platform/email")).toEqual({
      enabled: true,
      host: "smtp.example.com",
    });

    clearFormDraft("platform/email");

    expect(hasFormDraft("platform/email")).toBe(false);
    expect(getFormDraft("platform/email")).toBeUndefined();
  });

  it("merges remote values with nested draft values", () => {
    expect(
      mergeFormDraft(
        {
          challenge: {
            show_answer: false,
            show_hints: false,
          },
          enabled: true,
        },
        {
          challenge: {
            show_hints: true,
          },
        }
      )
    ).toEqual({
      challenge: {
        show_answer: false,
        show_hints: true,
      },
      enabled: true,
    });
  });
});
