import { handleHttpError } from "@api";
import { getGame } from "@api/game";
import ChallengeList from "@blocks/challenge/list";
import { useNavigate, useParams } from "@solidjs/router";
import { gameStore, setGameStore } from "@storage/game";
import { t } from "@storage/theme";
import Link from "@widgets/link";
import { HTTPError } from "ky";
import { Show, createEffect, untrack } from "solid-js";
import Playgrounds from "./playgrounds";

export default function SideBar() {
  const params = useParams();
  const selectedGameId = () => Number.parseInt(params.game) ?? null;
  const navigate = useNavigate();
  createEffect(() => {
    if (selectedGameId()) {
      untrack(async () => {
        try {
          const resp = await getGame(selectedGameId());
          setGameStore({ current: resp });
        } catch (err) {
          handleHttpError(err as Error, t("game.errors.fetch.title")!);
          if (err instanceof HTTPError) navigate(`/sigtrap/${err.response.status}`, { replace: true });
          else navigate("/sigtrap/unknown", { replace: true });
        }
      });
    }
  });
  return (
    <div class="flex flex-col overflow-hidden w-full h-full">
      <div class="border-b border-b-layer-content/10 px-2 h-16 flex space-x-2 items-center">
        <Show
          when={gameStore.current}
          fallback={
            <Link class="flex-1" ghost justify="start" href="/training">
              <span class="icon-[fluent--dumbbell-20-filled] w-5 h-5 text-primary" />
              <span>{t("training.list")}</span>
            </Link>
          }
        >
          <Link class="flex-1" ghost justify="start" href={`/training/${gameStore.current?.id}`}>
            <span class="icon-[fluent--dumbbell-20-filled] w-5 h-5 text-primary" />
            <span class="flex-1 text-start">{gameStore.current?.name}</span>
            <Show when={gameStore.current?.hidden}>
              <span class="icon-[fluent--eye-off-20-regular] w-5 h-5 text-warning" />
            </Show>
          </Link>
          <Link square ghost href="/training" title={t("general.actions.back.title")}>
            <span class="icon-[fluent--arrow-hook-up-left-20-regular] w-5 h-5 text-warning" />
          </Link>
        </Show>
      </div>
      <Show when={selectedGameId()} fallback={<Playgrounds />}>
        <ChallengeList />
      </Show>
    </div>
  );
}
