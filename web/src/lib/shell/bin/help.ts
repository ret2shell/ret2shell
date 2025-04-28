import { t } from "@storage/theme";
import ansiColors from "ansi-colors";
import * as commands from ".";
import { link } from "../escapes";
import type { Stdio } from "../stdio";
import type { Command } from "./interface";

export class Help implements Command {
  name = "help";
  man = t("shell.help.man")!;
  func = async (io: Stdio) => {
    io.println(t("shell.help.commands")!);
    for (const command of Object.values(commands)) {
      const cmd = new command();
      io.println(
        link(ansiColors.green(cmd.name), `rnix://command/${cmd.name}`) + " ".repeat(10 - cmd.name.length) + cmd.man
      );
    }
    return 0;
  };
}
