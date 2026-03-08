import { DateTime } from "luxon";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.hoisted(() => vi.fn());
const text = vi.hoisted(() => vi.fn());

vi.mock("@storage/theme", () => ({
  t: (key: string) => key,
}));

vi.mock(".", () => ({
  api_root: "/api",
  default: {
    get: apiGet,
  },
  handleHttpError: vi.fn(),
  inflyClient: {},
  persister: { persisterFn: vi.fn() },
  toastSuccess: vi.fn(),
}));

import { queryPlatformLog } from "./platform";

describe("queryPlatformLog", () => {
  const request = {
    started_at: DateTime.fromISO("2025-01-02T03:04:05.400Z"),
    ended_at: DateTime.fromISO("2025-01-02T04:05:06.600Z"),
    limit: 50,
    level: "warn",
    query: "flag",
  };

  beforeEach(() => {
    apiGet.mockReset();
    text.mockReset();
    apiGet.mockReturnValue({ text });
  });

  it("serializes time filters and parses non-empty JSON lines", async () => {
    text.mockResolvedValue(
      '{"_time":"2025-01-02T03:04:05Z","_msg":"start","level":"info","target":"platform"}\n\n{"_time":"2025-01-02T03:05:05Z","_msg":"done","level":"warn","target":"platform"}\n'
    );

    const logs = await queryPlatformLog(request);

    expect(apiGet).toHaveBeenCalledWith("/api/platform/logs/query", {
      searchParams: {
        started_at: Math.round(request.started_at.toSeconds()),
        ended_at: Math.round(request.ended_at.toSeconds()),
        limit: 50,
        level: "warn",
        query: "flag",
      },
    });
    expect(logs).toEqual([
      {
        _time: "2025-01-02T03:04:05Z",
        _msg: "start",
        level: "info",
        target: "platform",
      },
      {
        _time: "2025-01-02T03:05:05Z",
        _msg: "done",
        level: "warn",
        target: "platform",
      },
    ]);
  });

  it("surfaces malformed log lines instead of silently swallowing them", async () => {
    text.mockResolvedValue(
      '{"_time":"2025-01-02T03:04:05Z","_msg":"start","level":"info","target":"platform"}\nnot-json'
    );

    await expect(queryPlatformLog(request)).rejects.toThrow(SyntaxError);
  });
});
