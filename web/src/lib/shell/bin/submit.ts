import { checkSubmissionStatus, submitFlag } from "@api/game";
import {
  challengeStore,
  refreshChallenges,
  refreshCurrentChallenge,
  refreshSolves,
  refreshStatus,
} from "@storage/challenge";
import { gameStore, inProgress, isGameAdmin, refreshSelfTeam } from "@storage/game";
import { t } from "@storage/theme";
import ansiColors from "ansi-colors";
import { HTTPError } from "ky";
import type { ParseEntry } from "shell-quote";
import type { Stdio } from "../stdio";
import type { Command } from "./interface";

export class Submit implements Command {
  name = "submit";
  man = t("shell.submit.man")!;
  func = async (io: Stdio, _args: ParseEntry[], origin: string) => {
    const flag = origin.replace("submit", "").trim();
    io.info(`${t("shell.submit.submitting")}: ${ansiColors.blue(flag)}`);
    try {
      const submission = await submitFlag(gameStore.current!.id, challengeStore.current!.id, flag);
      io.print(ansiColors.green(`${t("shell.submit.waitingForChecking")}`));
      let iter = 7;
      let checked = false;
      while (iter > 0) {
        const s = await checkSubmissionStatus(gameStore.current!.id, challengeStore.current!.id, submission.id);
        if (s.solved !== null) {
          io.println("");
          if (s.solved) {
            io.success(`${t("challenge.submission.status.solved.title")}: ${s.result}`);
            refreshStatus();
            refreshSolves();
            if (inProgress() && !isGameAdmin()) {
              refreshSelfTeam();
              refreshChallenges();
              refreshCurrentChallenge();
            }
          } else {
            io.error(`${t("challenge.submission.status.failed.title")}: ${s.result}`);
          }
          checked = true;
          break;
        }
        io.print(ansiColors.yellow("."));
        await new Promise((resolve) => setTimeout(resolve, 1000));
        iter--;
      }
      if (!checked) {
        io.error(`${t("shell.submit.errors.timeout.title")}`);
      }
    } catch (e) {
      if (e instanceof HTTPError) {
        const text = await e.response.text();
        io.error(`${t("challenge.submission.errors.submit.title")}: ${text}`);
      }
    }
    return 0;
  };
}
