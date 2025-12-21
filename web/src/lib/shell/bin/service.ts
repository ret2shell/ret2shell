import { inflyClient } from "@api";
import { delayChallengeInstance, getChallengeEnv, startChallengeInstance, stopChallengeInstance } from "@api/challenge";
import { getGameInstances } from "@api/game";
import { deunicode } from "@api/rpc";
import { getWsrxLink, wsrx } from "@lib/wsrx";
import type { Challenge } from "@models/challenge";
import type { Game } from "@models/game";
import type { Instance } from "@models/instance";
import type { Team } from "@models/team";
import { isGameInProgress } from "@storage/game";
import { t } from "@storage/theme";
import { WsrxState } from "@xdsec/wsrx";
import ansiColors from "ansi-colors";
import { HTTPError } from "ky";
import type { ParseEntry } from "shell-quote";
import { link } from "../escapes";
import type { Stdio } from "../stdio";
import type { Command } from "./interface";

export class Service implements Command {
  name = "service";
  man = t("shell.service.man");
  func = async (
    io: Stdio,
    args: ParseEntry[],
    _origin: string,
    envVars: {
      game?: Game;
      challenge?: Challenge;
      team?: Team;
    }
  ) => {
    if (!envVars.game || !envVars.challenge || !envVars.team) {
      io.error(t("shell.errors.noGameSpecified.title"));
      return 1;
    }
    const action = {
      start: this.start,
      stop: this.stop,
      restart: this.restart,
      status: this.status,
      delay: this.delay,
    };
    if (args.length !== 1 || !Object.keys(action).includes(args[0].toString().trim())) {
      io.error(t("shell.service.errors.needAction.title"));
      io.info(t("shell.service.usage"));
      io.info(
        `\t${ansiColors.green(link("start", "rnix://command/service start"))}\t${t("shell.service.actions.start.title")}`
      );
      io.info(
        `\t${ansiColors.green(link("stop", "rnix://command/service stop"))}\t${t("shell.service.actions.stop.title")}`
      );
      io.info(
        `\t${ansiColors.green(link("restart", "rnix://command/service restart"))}\t${t("shell.service.actions.restart.title")}`
      );
      io.info(
        `\t${ansiColors.green(link("status", "rnix://command/service status"))}\t${t("shell.service.actions.status.title")}`
      );
      io.info(
        `\t${ansiColors.green(link("delay", "rnix://command/service delay"))}\t${t("shell.service.actions.delay.title")}`
      );
      return 1;
    }
    // @ts-expect-error envVars is checked above
    return action[args[0].toString().trim() as "start" | "stop" | "restart" | "status" | "delay"](io, envVars);
  };

  async getEnv(io: Stdio, envVars: { game: Game; challenge: Challenge; team: Team }) {
    try {
      const env = await getChallengeEnv(envVars.challenge.game_id, envVars.challenge.id);
      return env;
    } catch (e) {
      if (e instanceof HTTPError) {
        const text = await e.response.text();
        io.error(`${t("challenge.instance.errors.fetchInstances.title")}: ${text}`);
      } else {
        io.error(`${t("challenge.instance.errors.fetchInstances.title")}: ${e}`);
      }
      return null;
    }
  }

  async start(io: Stdio, envVars: { game: Game; challenge: Challenge; team: Team }) {
    const env = await this.getEnv(io, envVars);
    const instances = await getGameInstances(envVars.game.id);
    if (!env) {
      io.error(t("challenge.instance.errors.noConfig.title"));
      return 1;
    }
    if (instances && instances.length > (isGameInProgress(envVars.game) ? (envVars.game?.team_size ?? 1) : 1)) {
      if (instances?.find((v) => v.challenge_id === envVars.challenge.id)) {
        await this.status(io, envVars);
        return 0;
      }
      io.warning(t("challenge.instance.errors.singleton.title"));
      io.info(
        `${t("challenge.instance.errors.singleton.current")}:\n\t${instances
          .map(
            (inst) =>
              `${link(ansiColors.bold(inst.challenge_id.toString()), `rnix://command/${inst.challenge_id}`)}: ${link(inst.challenge_name!, `rnix://challenge/${inst.challenge_id}`)}`
          )
          .join("\n\t")}`
      );
      io.print(
        `${t("challenge.instance.errors.singleton.stop")} [${ansiColors.green("<id>")}/${ansiColors.red(link("quit", "rnix://command/quit"))}]: `
      );
      const choice = await io.input();
      io.println("");
      const chall_id = Number.parseInt(choice, 10);
      if (!chall_id) {
        io.warning(t("challenge.instance.errors.noAction.title"));
        return 1;
      }
      try {
        const inst = instances.find((v) => v.challenge_id === chall_id);
        if (!inst) {
          io.warning(t("challenge.instance.errors.noAction.title"));
          return 1;
        }
        await stopChallengeInstance(inst.game_id, inst.challenge_id);
      } catch (e) {
        if (e instanceof HTTPError) {
          const text = await e.response.text();
          io.error(`${t("challenge.instance.errors.stop.title")}: ${text}`);
        }
      }
    }
    const d_service_name = await deunicode(envVars.challenge.name);
    io.info(
      t("shell.service.starting", {
        service: ansiColors.blueBright(d_service_name),
      })!
    );
    await new Promise((r) => setTimeout(r, 500));
    try {
      await startChallengeInstance(envVars.challenge.game_id, envVars.challenge.id);
    } catch (e) {
      if (e instanceof HTTPError) {
        const text = await e.response.text();
        io.error(`${t("challenge.instance.errors.start.title")}: ${text}`);
      }
    }
    await this.status(io, envVars);
    return 0;
  }

  async stop(io: Stdio, envVars: { game: Game; challenge: Challenge; team: Team }) {
    const env = await this.getEnv(io, envVars);
    if (!env) {
      io.error(t("challenge.instance.errors.noConfig.title"));
      return 1;
    }
    const d_service_name = await deunicode(envVars.challenge.name);
    io.info(
      t("shell.service.stopping", {
        service: ansiColors.blueBright(d_service_name),
      })!
    );
    try {
      await stopChallengeInstance(envVars.challenge.game_id, envVars.challenge.id);
    } catch (e) {
      if (e instanceof HTTPError) {
        const text = await e.response.text();
        io.error(`${t("challenge.instance.errors.stop.title")}: ${text}`);
      }
    }
    await new Promise((r) => setTimeout(r, 500));
    const instances = await getGameInstances(envVars.game.id);
    await wsrx.deleteOutdatedLocal(instances);
    await inflyClient.invalidateQueries({
      queryKey: ["game", envVars.game.id, "instances"],
    });
    return 0;
  }

  async restart(io: Stdio, envVars: { game: Game; challenge: Challenge; team: Team }) {
    const env = await this.getEnv(io, envVars);
    if (!env) {
      io.error(t("challenge.instance.errors.noConfig.title"));
      return 1;
    }
    await this.stop(io, envVars);
    await new Promise((r) => setTimeout(r, 500));
    await this.start(io, envVars);
    return 0;
  }

  async status(io: Stdio, envVars: { game: Game; challenge: Challenge; team: Team }) {
    const env = await this.getEnv(io, envVars);
    if (!env) {
      io.error(t("challenge.instance.errors.noConfig.title"));
      return 1;
    }
    const instances = await getGameInstances(envVars.game.id);
    const inst = instances.find((instance) => instance.challenge_id === envVars.challenge.id);
    const d_service_name = await deunicode(envVars.challenge.name);
    io.println(`${inst ? ansiColors.greenBright("●") : ansiColors.dim("○")} ${d_service_name}.service`);
    function getInstState(inst?: Instance, with_time = true) {
      if (inst?.state === "Running")
        return `${ansiColors.greenBright("active (running)")}${with_time ? ` since ${inst.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}` : ""}`;
      if (inst?.state === "Pending")
        return `${ansiColors.blueBright("active (pending)")}${with_time ? ` since ${inst.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}` : ""}`;
      return ansiColors.redBright("inactive (dead)");
    }
    io.println(
      `     Loaded: loaded (~/${envVars.challenge.name}/checkers/${d_service_name}.service; ${ansiColors.yellow("disabled")}; preset: ${ansiColors.green("enabled")})`
    );
    io.println(`     Active: ${getInstState(inst)}`);
    if (inst) {
      // await wsrx.openAllTraffic();
      await wsrx.syncLocal();
      // wsrx-local.service
      const inst_wsrx_local = Object.assign(Object.create(inst), {
        state: {
          [WsrxState.Invalid]: "Stopped",
          [WsrxState.Pending]: "Pending",
          [WsrxState.Usable]: "Running",
        }[wsrx.state()],
      });
      io.println(`       ${ansiColors.dim("└─")} wsrx-local.service: ${getInstState(inst_wsrx_local, false)}`);
      // wsrx address
      for (const image of env.images) {
        io.println(
          `          ${ansiColors.dim("Connection")}: ${ansiColors.blue(getWsrxLink(inst.traffic, image.port!))} *-> ${image.name}.service`
        );
      }
      // env routes
      for (const image of env.images) {
        io.println(
          `       ${ansiColors.dim("└─")} ${image.name}.service - ${image.description}: ${getInstState(inst, false)}`
        );
        if (image.port) {
          // remote address
          if (inst.exposed_ports?.find((p) => p.name === image.name)) {
            io.println(
              `          ${ansiColors.dim("Connection")}: ${ansiColors.blue(link(`${image.service_type}://${inst.exposed_ports.find((p) => p.name === image.name)?.address}`, `${image.service_type}://${inst.exposed_ports.find((p) => p.name === image.name)?.address}`))}`
            );
          }
          // local address
          const locals = wsrx.getTrafficLocal(inst, image.port!);
          for (const local of locals) {
            if (local) {
              io.println(
                `          ${ansiColors.dim("Connection")}: ${ansiColors.blue(link(`${image.service_type}://${local.local}`, `${image.service_type}://${local.local}`))} *-> wsrx-local.service (${ansiColors.green(`${local.latency}ms`)})`
              );
            }
          }
        }
      }
    }
    io.println("");
    return 0;
  }

  async delay(io: Stdio, envVars: { game: Game; challenge: Challenge; team: Team }) {
    const env = await this.getEnv(io, envVars);
    if (!env) {
      io.error(t("challenge.instance.errors.noConfig.title"));
      return 1;
    }
    try {
      await delayChallengeInstance(envVars.challenge.game_id, envVars.challenge.id);
    } catch (e) {
      if (e instanceof HTTPError) {
        const text = await e.response.text();
        io.error(`${t("challenge.instance.errors.delay.title")}: ${text}`);
      }
    }
    await this.status(io, envVars);
    return 0;
  }
}
