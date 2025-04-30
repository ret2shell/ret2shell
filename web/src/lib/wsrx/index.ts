import { getGameSelfEnvs } from "@api/game";
import type { Instance } from "@models/instance";
import { gameStore } from "@storage/game";
import { platformStore } from "@storage/platform";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import { Wsrx, WsrxError, WsrxFeature, type WsrxInstance, type WsrxOptions, WsrxState } from "@xdsec/wsrx";
import { HTTPError } from "ky";
import { DateTime } from "luxon";
import { type Accessor, createEffect, createSignal } from "solid-js";

export class WsrxWrapper {
  apiAddr: Accessor<string>;
  setApiAddr: (apiAddr: string) => void;
  state: Accessor<WsrxState>;
  setState: (state: WsrxState) => void;
  instances: Accessor<Instance[]>;
  setInstances: (instances: Instance[]) => void;
  traffics: Accessor<WsrxInstance[]>;
  setTraffics: (traffic: WsrxInstance[]) => void;
  private wsrx: Wsrx;
  constructor() {
    [this.state, this.setState] = createSignal(WsrxState.Invalid);
    [this.instances, this.setInstances] = createSignal([]);
    [this.traffics, this.setTraffics] = createSignal([]);
    [this.apiAddr, this.setApiAddr] = createSignal("http://127.0.0.1:3307");
    this.wsrx = new Wsrx({
      api: this.apiAddr(),
      name: platformStore.config.name || location.host,
      features: [WsrxFeature.Basic],
    });
    this.wsrx.onStateChange((state) => {
      if (state === WsrxState.Invalid && this.state() !== WsrxState.Invalid) {
        addToast({
          level: "warning",
          description: t("wsrx.errors.disconnected.title")!,
          duration: 10 * 1000,
        });
      }
      this.setState(state);
    });
    this.wsrx.onInstancesChange((data) => {
      this.setTraffics(data);
    });

    createEffect(() => {
      if (this.apiAddr() && platformStore.config.name) {
        this.wsrx.setOptions({
          api: this.apiAddr(),
          name: platformStore.config.name,
        });
      }
    });
  }

  setOptions(options: Partial<WsrxOptions>) {
    this.wsrx.setOptions(options);
  }

  async connect() {
    await this.wsrx.connect();
  }

  public async syncRemote() {
    if (gameStore.current) {
      try {
        const result = await getGameSelfEnvs(gameStore.current.id);
        this.setInstances(
          result.filter((instance) => instance.created_at.plus({ hours: instance.renew_count + 1 }) > DateTime.now())
        );
      } catch (err) {
        if (err instanceof HTTPError) {
          addToast({
            level: "error",
            description: `${t("challenge.instance.errors.fetchInstances.title")}: ${await err.response.text()}`,
            duration: 5000,
          });
        }
      }
    }
  }

  public async syncLocal() {
    if (this.wsrx.getState() === WsrxState.Usable) {
      try {
        await this.wsrx.sync();
      } catch (err) {
        if (err instanceof WsrxError) {
          addToast({
            level: "error",
            description: `${t("wsrx.errors.fetchTunnel.title")}: ${err.message}`,
            duration: 5000,
          });
        }
      }
    }
  }

  async deleteLocal(local: string) {
    if (this.wsrx.getState() === WsrxState.Usable) {
      try {
        await this.wsrx.delete(local);
      } catch {}
    }
  }

  public async deleteOutdatedLocal() {
    if (this.wsrx.getState() === WsrxState.Usable) {
      for (const { local, remote } of this.traffics()) {
        if (!this.instances().some((instance) => remote.includes(instance.traffic))) {
          await this.deleteLocal(local);
        }
      }
    }
  }

  public async deleteAllLocal() {
    if (this.wsrx.getState() === WsrxState.Usable) {
      for (const { local } of this.traffics()) {
        await this.deleteLocal(local);
      }
    }
  }

  public async addLocal(instance: Instance) {
    if (this.wsrx.getState() === WsrxState.Usable) {
      for (const port of instance.ports) {
        const remote = getWsrxLink(instance.traffic, port);
        if (!this.traffics().some((t) => t.remote === remote)) {
          try {
            await this.wsrx.add({
              label: `${instance.challenge_name} (${port}) in ${instance.game_name}`,
              local: "127.0.0.1:0",
              remote,
            });
          } catch (err) {
            if (err instanceof WsrxError) {
              addToast({
                level: "error",
                description: `${t("wsrx.errors.createTunnel.title")}: ${err.message}`,
                duration: 5000,
              });
            }
          }
        }
      }
      this.syncLocal();
    }
  }

  public async openAllTraffic() {
    if (this.wsrx.getState() === WsrxState.Usable) {
      for (const instance of this.instances()) {
        await this.addLocal(instance);
      }
    }
  }

  public getTrafficLocal(instance: Instance, port: number) {
    return this.traffics().filter((t) => t.remote === getWsrxLink(instance.traffic, port));
  }
}

export const wsrx = new WsrxWrapper();

export function getWsrxLink(wsrx: string, port: number) {
  const prefix = location.protocol === "https:" ? "wss" : "ws";
  const host = location.host;
  return `${prefix}://${host}/api/traffic/${wsrx}?port=${port}`;
}
