import { getChallengeEnv, startChallengeInstance } from "@api/challenge";
import { getGameInstances } from "@api/game";
import { getPlatformInfo } from "@api/platform";
import type { Challenge } from "@models/challenge";
import type { Game } from "@models/game";
import type { Instance } from "@models/instance";
import type { Team } from "@models/team";
import type { ParseEntry } from "shell-quote";
import { describe, expect, it, vi } from "vitest";
import type { Stdio } from "../stdio";

vi.mock("@api", () => ({
  inflyClient: {
    invalidateQueries: vi.fn(),
  },
}));

vi.mock("@api/challenge", () => ({
  delayChallengeInstance: vi.fn(),
  getChallengeEnv: vi.fn(),
  startChallengeInstance: vi.fn(),
  stopChallengeInstance: vi.fn(),
}));

vi.mock("@api/game", () => ({
  getGameInstances: vi.fn(),
}));

vi.mock("@api/platform", () => ({
  getPlatformInfo: vi.fn(async () => ({ non_game_env_limit: 1 })),
}));

vi.mock("@api/rpc", () => ({
  deunicode: vi.fn(async (value: string) => value),
}));

vi.mock("@lib/wsrx", () => ({
  getWsrxLink: vi.fn(),
  wsrx: {
    deleteOutdatedLocal: vi.fn(),
    getTrafficLocal: vi.fn(() => []),
    state: vi.fn(),
    syncLocal: vi.fn(),
  },
}));

vi.mock("@storage/game", () => ({
  isGameInProgress: vi.fn(() => false),
}));

vi.mock("@storage/theme", () => ({
  t: (key: string) => key,
}));

vi.mock("@xdsec/wsrx", () => ({
  WsrxState: {
    Invalid: 0,
    Pending: 1,
    Usable: 2,
  },
}));

import { Service } from "./service";

describe("Service", () => {
  it("counts only personal instances when starting outside a team quota", async () => {
    const service = new Service();
    const io = {
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
      print: vi.fn(),
      println: vi.fn(),
      input: vi.fn(async () => "quit"),
    } as unknown as Stdio;

    vi.mocked(getChallengeEnv).mockResolvedValue({ images: [] } as never);
    vi.mocked(getGameInstances).mockResolvedValue([
      { team_id: 0, challenge_id: 10, game_id: 2, game_name: "training-a" },
      { team_id: 0, challenge_id: 11, game_id: 3, game_name: "training-b" },
    ] as unknown as Instance[]);
    vi.mocked(getPlatformInfo).mockResolvedValue({ non_game_env_limit: 2 } as never);

    await expect(
      service.start(io, {
        game: { id: 1, env_limit: null, team_size: 1 } as Game,
        challenge: { id: 12, game_id: 1, name: "new", archive_at: null } as Challenge,
        team: undefined as unknown as Team,
      })
    ).resolves.toBe(1);

    expect(startChallengeInstance).not.toHaveBeenCalled();
    expect(io.warning).toHaveBeenCalled();
  });

  it("dispatches subcommands with the service instance context preserved", async () => {
    const service = new Service();
    const start = vi.fn(async function (this: Service) {
      return this === service ? 0 : 1;
    });

    service.start = start as Service["start"];

    await expect(
      service.func({} as Stdio, ["start"] as ParseEntry[], "service start", {
        challenge: { id: 2, game_id: 1, name: "demo" },
        game: { id: 1 },
        team: { id: 3, name: "team" },
      } as Parameters<Service["func"]>[3])
    ).resolves.toBe(0);
    expect(start).toHaveBeenCalledOnce();
    expect(start.mock.contexts[0]).toBe(service);
  });
});
