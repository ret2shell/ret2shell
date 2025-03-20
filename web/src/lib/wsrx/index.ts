import { getGameSelfEnvs } from "@api/game";
import type { Instance, Traffic } from "@models/instance";
import { gameStore } from "@storage/game";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import ky, { HTTPError } from "ky";
import { DateTime } from "luxon";
import { type Accessor, createSignal } from "solid-js";

export enum WsrxState {
  Disconnected = 0,
  Pending = 1,
  Connected = 2,
}

export class Wsrx {
  apiAddr: Accessor<string>;
  setApiAddr: (apiAddr: string) => void;
  connected: Accessor<WsrxState>;
  setConnected: (connected: WsrxState) => void;
  instances: Accessor<Instance[]>;
  setInstances: (instances: Instance[]) => void;
  traffic: Accessor<Traffic[]>;
  setTraffic: (traffic: Traffic[]) => void;
  constructor() {
    [this.connected, this.setConnected] = createSignal(WsrxState.Disconnected);
    [this.instances, this.setInstances] = createSignal([]);
    [this.traffic, this.setTraffic] = createSignal([]);
    [this.apiAddr, this.setApiAddr] = createSignal("http://127.0.0.1:3307");
  }

  async checkConnection() {
    try {
      const resp = await ky.get(`${this.apiAddr()}/connect`);
      if (resp.status === 201) {
        this.setConnected(WsrxState.Pending);
      } else {
        this.setConnected(WsrxState.Connected);
      }
    } catch {
      this.setConnected(WsrxState.Disconnected);
    }
    return this.connected();
  }

  async tryConnect() {
    await ky.post(`${this.apiAddr()}/connect`, {
      json: location.origin,
    });
  }

  public async refreshInstances() {
    if (gameStore.current) {
      try {
        const result = await getGameSelfEnvs(gameStore.current.id);
        this.setInstances(
          result.filter((instance) => instance.created_at.plus({ hours: instance.renew_count + 1 }) > DateTime.now())
        );
      } catch (err) {
        if (err instanceof HTTPError) {
          if (err.response.status !== 404) {
            addToast({
              level: "error",
              description: `${t("instance.fetchFailed")}: ${await err.response.text()}`,
              duration: 5000,
            });
          }
        }
      }
    }
  }

  public async refreshTraffic() {
    if (this.connected() === WsrxState.Connected) {
      try {
        const resp = await ky.get(`${this.apiAddr()}/pool`).json<{
          [key: string]: {
            from: string;
            to: string;
          };
        }>();
        const traffic: Traffic[] = [];
        for (const [_, { from, to }] of Object.entries(resp)) {
          traffic.push({
            remote: to,
            local: from,
          });
        }
        this.setTraffic(traffic);
      } catch (err) {
        if (err instanceof HTTPError) {
          addToast({
            level: "error",
            description: `${t("traffic.fetchFailed")}: ${await err.response.text()}`,
            duration: 5000,
          });
        } else {
          addToast({
            level: "error",
            description: `${t("traffic.fetchFailed")}: ${err}`,
            duration: 5000,
          });
        }
      }
    }
  }

  async deleteTraffic(local: string) {
    if (this.connected() === WsrxState.Connected) {
      try {
        await ky.delete(`${this.apiAddr()}/pool`, {
          json: {
            key: local,
          },
        });
      } catch (err) {
        if (err instanceof HTTPError) {
          addToast({
            level: "error",
            description: `${t("traffic.deleteFailed")}: ${await err.response.text()}`,
            duration: 5000,
          });
        } else {
          addToast({
            level: "error",
            description: `${t("traffic.deleteFailed")}: ${err}`,
            duration: 5000,
          });
        }
      }
    }
  }

  public async deleteOutdatedTraffic() {
    if (this.connected() === WsrxState.Connected) {
      const prefix = location.protocol === "https:" ? "wss" : "ws";
      const host = location.host;
      for (const { local, remote } of this.traffic()) {
        if (
          remote.startsWith(`${prefix}://${host}`) &&
          !this.instances().some((instance) => remote.includes(instance.traffic))
        ) {
          await this.deleteTraffic(local);
        }
      }
    }
  }

  public async deleteAllTraffic() {
    if (this.connected() === WsrxState.Connected) {
      const prefix = location.protocol === "https:" ? "wss" : "ws";
      const host = location.host;
      for (const { local, remote } of this.traffic()) {
        if (remote.startsWith(`${prefix}://${host}`)) await this.deleteTraffic(local);
      }
    }
  }

  public async openTraffic(remote: string) {
    if (this.connected() === WsrxState.Connected) {
      try {
        await ky.post(`${this.apiAddr()}/pool`, {
          json: {
            to: remote,
            from: "127.0.0.1:0",
          },
        });
      } catch (err) {
        if (err instanceof HTTPError) {
          addToast({
            level: "error",
            description: `${t("traffic.openFailed")}: ${await err.response.text()}`,
            duration: 5000,
          });
        } else {
          addToast({
            level: "error",
            description: `${t("traffic.openFailed")}: ${err}`,
            duration: 5000,
          });
        }
      }
    }
  }

  public async openInstanceTraffic(instance: Instance) {
    if (this.connected() === WsrxState.Connected) {
      const prefix = location.protocol === "https:" ? "wss" : "ws";
      const host = location.host;
      for (const port of instance.ports) {
        const remote = `${prefix}://${host}/api/traffic/${instance.traffic}?port=${port}`;
        if (!this.traffic().some((t) => t.remote === remote)) await this.openTraffic(remote);
      }
      this.refreshTraffic();
    }
  }

  public async openAllTraffic() {
    if (this.connected() === WsrxState.Connected) {
      await this.refreshTraffic();
      for (const instance of this.instances()) {
        await this.openInstanceTraffic(instance);
      }
    }
  }

  public getTrafficLocal(instance: Instance, port: number) {
    return this.traffic().filter((t) => t.remote === getWsrxLink(instance.traffic, port));
  }
}

export const wsrx = new Wsrx();

export function getWsrxLink(wsrx: string, port: number) {
  const prefix = location.protocol === "https:" ? "wss" : "ws";
  const host = location.host;
  return `${prefix}://${host}/api/traffic/${wsrx}?port=${port}`;
}
