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
