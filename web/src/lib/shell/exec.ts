import type { ParseEntry } from "shell-quote";
import { t } from "../storage/theme";
import * as commands from "./bin";
// This module provides a unique command execution solution for the shell.
import type { Command } from "./bin/interface";
import type { Stdio } from "./stdio";

export class Exec {
  commands: Map<string, Command>;

  public constructor() {
    this.commands = new Map();
    for (const command of Object.values(commands)) {
      const cmd = new command();
      this.commands.set(cmd.name, cmd);
    }
  }

  public async exec(io: Stdio, args: ParseEntry[], origin: string) {
    const flag_regex = /\w+\{.+\}/gm;
    if (flag_regex.test(origin)) {
      return { cmd: "submit", code: await this.commands.get("submit")!.func(io, args.slice(1), origin) };
    }

    let cmd = args[0];
    if (typeof cmd !== "string") {
      io.error(t("shell.errors.commandInvalid.title")!);
      return { cmd: "", code: -127 };
    }
    cmd = cmd.trim();
    if (cmd === "") return { cmd, code: 0 };
    if (cmd === "cd") {
      io.error(t("shell.errors.traversalDetected.title")!);
      return { cmd, code: -127 };
    }
    if (this.commands.has(cmd)) {
      return { cmd, code: await this.commands.get(cmd)!.func(io, args.slice(1), origin) };
    }

    io.error(t("shell.commandNotFound", { command: cmd })!);
    return { cmd, code: -127 };
  }
}
