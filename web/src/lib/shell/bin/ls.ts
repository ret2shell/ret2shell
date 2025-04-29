import { challengeStore } from "@storage/challenge";
import { gameStore } from "@storage/game";
import { t } from "@storage/theme";
import ansiColors from "ansi-colors";
import type { ParseEntry } from "shell-quote";
import { link } from "../escapes";
import type { Stdio } from "../stdio";
import type { Command } from "./interface";

export class Ls implements Command {
  name = "ls";
  man = t("shell.ls.man")!;
  func = async (io: Stdio, args: ParseEntry[], _origin: string) => {
    // console.log(args);
    if (!gameStore.current || !challengeStore.current) {
      io.error(t("shell.errors.noGameSpecified.title")!);
      return 1;
    }
    if (args.find((arg) => arg.toString().trim().startsWith("-"))) {
      io.error(
        `${t("shell.ls.errors.invalidOption.title", { option: args.find((arg) => arg.toString().trim().startsWith("-"))?.toString() || "" })}`
      );
      return 1;
    }
    if (args.length > 1) {
      io.error(t("shell.ls.errors.tooManyArgs.title")!);
      return 1;
    }
    if (args.length > 0) {
      const path = args[0]?.toString().trim() || "";
      if (path.startsWith("/") || path.includes("..")) {
        io.error(t("shell.ls.errors.traversalDetected.title")!);
        return 1;
      }
      if (!path.startsWith("checkers")) {
        io.error(t("shell.ls.errors.fileNotFound.title")!);
        return 1;
      }
      io.error(t("shell.errors.permissionDenied.title")!);
      return 1;
    }
    try {
      io.println(
        `${ansiColors.blue("d")}rwx${ansiColors.dim("---")}${ansiColors.dim("---")} ${ansiColors.red("root")} ${ansiColors.blue("checkers")}${ansiColors.dim("/")}`
      );
      io.println(
        `.rw${ansiColors.dim("-")}r${ansiColors.dim("--")}r${ansiColors.dim("--")} ${ansiColors.red("root")} ${ansiColors.yellow(link("README.md\t", "rnix://command/cat README.md"))}`
      );
      for (const file of challengeStore.files) {
        io.println(
          `.rw-r--r-- ${ansiColors.red("root")} ${ansiColors.bold(link(`${file.file}\t`, `rnix://command/wget "${file.file}"`))}`
        );
      }
    } catch {
      io.error(t("shell.ls.errors.list.title")!);
      return 1;
    }
    return 0;
  };
}
