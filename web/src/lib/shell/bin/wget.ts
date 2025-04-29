import { api_root } from "@api";
import { downloadFile } from "@api/file";
import { challengeStore } from "@storage/challenge";
import { gameStore } from "@storage/game";
import { t } from "@storage/theme";
import { HTTPError } from "ky";
import type { ParseEntry } from "shell-quote";
import { cursorTo } from "../escapes";
import type { Stdio } from "../stdio";
import type { Command } from "./interface";

export class Wget implements Command {
  name = "wget";
  man = t("shell.wget.man")!;
  func = async (io: Stdio, args: ParseEntry[], _origin: string) => {
    if (!gameStore.current) {
      io.error(t("shell.errors.noGameSpecified.title")!);
      return 1;
    }
    if (!challengeStore.current) {
      io.error(t("shell.errors.noChallengeSpecified.title")!);
      return 1;
    }
    if (args.length !== 1) {
      io.error(t("shell.wget.usage")!);
      return 1;
    }
    const file = args[0].toString().trim();
    const found = challengeStore.files.find((f) => f.file === file);
    if (!found) {
      io.error(t("shell.wget.errors.fileNotFound.title")!);
      return 1;
    }
    try {
      const blob = await downloadFile(
        `${api_root}/game/${gameStore.current.id}/challenge/${challengeStore.current.id}/file`,
        { file: found.file, folder: found.folder },
        (progress) => {
          io.print(
            `${cursorTo(0)}${t("shell.wget.downloading")}: [${"=".repeat(Math.ceil(progress.percent * 25)).padEnd(25, ".")}] ${Math.ceil(
              progress.percent * 100
            )
              .toString()
              .padStart(3)}%`
          );
        }
      );
      io.println("");
      io.success(t("general.actions.download.status.success")!);
      const url = window.URL.createObjectURL(blob as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = found.file;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      io.println("");
      if (err instanceof HTTPError) {
        const text = await err.response.text();
        io.error(`${t("general.actions.download.status.fail")}: ${text}`);
        return 255;
      }

      io.error(`${t("general.actions.download.status.fail")}: ${err}`);
      return 255;
    }
    return 0;
  };
}
