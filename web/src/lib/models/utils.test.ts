import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { luxonReplacer, luxonReviver } from "./utils";

describe("luxonReviver", () => {
  it("converts unix timestamps on *_at fields into DateTime values", () => {
    const revived = luxonReviver("updated_at", 1735787045);

    expect(DateTime.isDateTime(revived)).toBe(true);
    expect((revived as DateTime).toUTC().toSeconds()).toBe(1735787045);
  });

  it("leaves unrelated fields and non-numeric values untouched", () => {
    expect(luxonReviver("name", 1735787045)).toBe(1735787045);
    expect(luxonReviver("updated_at", "1735787045")).toBe("1735787045");
  });
});

describe("luxonReplacer", () => {
  it("serializes ISO strings on *_at fields to rounded unix timestamps", () => {
    expect(luxonReplacer("created_at", "2025-01-02T03:04:05.400Z")).toBe(1735787045);
    expect(luxonReplacer("created_at", "2025-01-02T03:04:05.600Z")).toBe(1735787046);
  });

  it("passes through non-timestamp fields unchanged", () => {
    expect(luxonReplacer("name", "ret2shell")).toBe("ret2shell");
  });
});
