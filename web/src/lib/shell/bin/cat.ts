import { challengeStore } from "@storage/challenge";
import { gameStore } from "@storage/game";
import { t } from "@storage/theme";
import ansiColors from "ansi-colors";
import type { ParseEntry } from "shell-quote";
import { link } from "../escapes";
import type { Stdio } from "../stdio";
import type { Command } from "./interface";

export class Cat implements Command {
  name = "cat";
  man = t("shell.cat.man")!;
  func = async (io: Stdio, args: ParseEntry[]) => {
    if (!gameStore.current || !challengeStore.current) {
      io.error(t("shell.errors.noGameSpecified.title")!);
      return 1;
    }
    if (args.length === 0) {
      io.error(t("shell.cat.errors.noFileSpecified.title")!);
      return 1;
    }
    if (args.length > 1) {
      io.error(t("shell.cat.errors.tooManyFiles.title")!);
      return 1;
    }
    const file = args[0].toString().trim();
    if (file === "README.md") {
      io.println(challengeStore.current.content || "");
    } else if (file === "/etc/motd") {
      io.println(
        ansiColors.bold(
          t("shell.welcome", { shell: `${ansiColors.blue("Rx")}${ansiColors.dim("::")}${ansiColors.blue("Shell")}` })!
        )
      );
      io.info(
        t("shell.tip", {
          flag: ansiColors.red("flag"),
          help: link(ansiColors.green("help"), "rnix://command/help"),
        })!
      );
      io.println("");
    } else if (file.startsWith("checkers/")) {
      io.error(t("shell.errors.permissionDenied.title")!);
      return 1;
    } else {
      try {
        if (!challengeStore.files.find((f) => f.file === file)) {
          io.error(t("shell.cat.errors.fileNotFound.title")!);
          return 1;
        }
        io.warning("[BINARY DATA]");
      } catch {
        io.error(t("shell.cat.errors.read.title")!);
        return 1;
      }
    }
    return 0;
  };
}
