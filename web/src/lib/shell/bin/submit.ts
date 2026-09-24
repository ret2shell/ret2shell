import { inflyClient } from "@api";
import { checkSubmissionStatus, getSelfSolves, submitFlag } from "@api/game";
import { fetchNewlyAchievedMilestones } from "@api/milestone";
import type { Challenge } from "@models/challenge";
import type { Game } from "@models/game";
import { isAdminOfGame, isGameInProgress } from "@storage/game";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import ansiColors from "ansi-colors";
import { HTTPError } from "ky";
import type { ParseEntry } from "shell-quote";
import type { Stdio } from "../stdio";
import type { Command } from "./interface";

export class Submit implements Command {
  name = "submit";
  man = t("shell.submit.man");
  func = async (
    io: Stdio,
    _args: ParseEntry[],
    origin: string,
    {
      game,
      challenge,
    }: {
      game?: Game;
      challenge?: Challenge;
    }
  ) => {
    if (!game || !challenge) {
      io.error(t("shell.errors.noGameSpecified.title"));
      return 1;
    }
    const flag = origin.replace("submit", "").trim();
    io.info(`${t("shell.submit.submitting")}: ${ansiColors.blue(flag)}`);
    // snapshot the solved set so milestones newly completed by this solve
    // can be celebrated once the checker confirms it
    let beforeSolved: Set<number> | null = null;
    try {
      beforeSolved = new Set((await getSelfSolves(game.id)).map((s) => s.challenge_id));
    } catch {
      // without a snapshot the celebration below is skipped entirely
    }
    try {
      const submission = await submitFlag(game!.id, challenge!.id, flag);
      io.print(ansiColors.green(`${t("shell.submit.waitingForChecking")}`));
      await new Promise((resolve) => setTimeout(resolve, 1000));
      let iter = 7;
      let checked = false;
      while (iter > 0) {
        const st = await checkSubmissionStatus(game!.id, challenge!.id, submission.id);
        if (st.solved !== null) {
          io.println("");
          if (st.solved) {
            inflyClient.invalidateQueries({
              queryKey: ["game", game!.id, "challenge"],
            });
            inflyClient.invalidateQueries({
              queryKey: ["game", game!.id, "selfSolves"],
            });
            io.success(`${t("challenge.submission.status.solved.title")}: ${st.result}`);
            if (beforeSolved) {
              try {
                const achieved = await fetchNewlyAchievedMilestones(game!.id, beforeSolved);
                for (const milestone of achieved) {
                  addToast({
                    level: "success",
                    description: t("challenge.milestone.newAchievement"),
                    subtitle: milestone.name,
                    duration: 10000,
                  });
                }
              } catch {
                // best-effort celebration, never blocks the submit flow
              }
            }
            if (isGameInProgress(game) && !isAdminOfGame(game)) {
              inflyClient.invalidateQueries({
                queryKey: ["game", game.id, "team", "self"],
              });
            }
          } else {
            io.error(`${t("challenge.submission.status.failed.title")}: ${st.result}`);
          }
          checked = true;
          break;
        }
        io.print(ansiColors.green("."));
        await new Promise((resolve) => setTimeout(resolve, 1000));
        iter--;
      }
      if (!checked) {
        io.error(`${t("shell.submit.errors.timeout.title")}`);
      }
    } catch (e) {
      if (e instanceof HTTPError) {
        const text = typeof e.data === "string" ? e.data : JSON.stringify(e.data);
        io.error(`${t("challenge.submission.errors.submit.title")}: ${text}`);
      }
    }
    return 0;
  };
}
