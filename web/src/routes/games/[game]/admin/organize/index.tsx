import { handleHttpError } from "@api";
import { updateGame } from "@api/game";
import AdministratorsManagement from "@blocks/game/administrators";
import NarrowTips from "@blocks/narrow-tips";
import { accountStore } from "@storage/account";
import { gameStore, setGameStore } from "@storage/game";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Checkbox from "@widgets/checkbox";
import LoadingTips from "@widgets/loading-tips";
import type { HTTPError } from "ky";
import { For, Show, createSignal } from "solid-js";

function InstituteManagement() {
  const [loading, setLoading] = createSignal(false);

  async function handleChangePolicy(restrict: boolean) {
    if (gameStore.current) {
      setLoading(true);
      try {
        const resp = await updateGame(gameStore.current.id, {
          ...gameStore.current,
          access_policy: {
            ...gameStore.current.access_policy,
            restrict,
          },
        });
        addToast({
          level: "success",
          description: t("form.saveSuccess")!,
          duration: 5000,
        });
        setGameStore({ current: resp });
      } catch (err) {
        handleHttpError(err as HTTPError, t("form.saveFailed")!);
      }
      setLoading(false);
    }
  }
  async function handleChangeInstitute(institute: number, enabled: boolean) {
    if (gameStore.current) {
      setLoading(true);
      const institutes = JSON.parse(JSON.stringify(gameStore.current.access_policy.institutes));
      if (enabled) {
        institutes.push(institute);
      } else {
        institutes.splice(institutes.indexOf(institute), 1);
      }
      try {
        const resp = await updateGame(gameStore.current.id, {
          ...gameStore.current,
          access_policy: {
            ...gameStore.current.access_policy,
            institutes,
          },
        });
        addToast({
          level: "success",
          description: t("form.saveSuccess")!,
          duration: 5000,
        });
        setGameStore({ current: resp });
      } catch (err) {
        handleHttpError(err as HTTPError, t("form.saveFailed")!);
      }
      setLoading(false);
    }
  }
  return (
    <>
      <Title page={t("game.admin.organize.title")} route={`/games/${gameStore.current?.id}/admin/organize`} />
      <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
        <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
        <span>{t("game.admin.organize.title")}</span>
      </h3>
      <Show when={loading()}>
        <div class="h-12 flex flex-row items-center border-b border-b-layer-content/10">
          <LoadingTips />
        </div>
      </Show>
      <div class="flex flex-wrap items-center">
        <span class="flex-1">{t("game.admin.organize.restrictWarning")}</span>
        <Checkbox
          checked={gameStore.current?.access_policy.restrict}
          title={t("game.admin.organize.restrict")}
          onChange={() => handleChangePolicy(!gameStore.current?.access_policy.restrict)}
        >
          <span class="flex-1 text-start">{t("game.admin.organize.restrict")}</span>
        </Checkbox>
      </div>
      <div class="flex flex-col space-y-1">
        <header class="label">{t("game.admin.organize.instituteEnabled")}</header>
        <div class="flex flex-row flex-wrap">
          <For each={accountStore.institutes}>
            {(institute) => (
              <Checkbox
                class="m-1 flex-none"
                checked={gameStore.current?.access_policy.institutes.includes(institute.id)}
                onChange={() => {
                  handleChangeInstitute(
                    institute.id,
                    !gameStore.current?.access_policy.institutes.includes(institute.id)
                  );
                }}
              >
                <span class="flex-1 text-start">{institute.name}</span>
              </Checkbox>
            )}
          </For>
        </div>
      </div>
    </>
  );
}

export default function () {
  return (
    <div class="flex flex-col p-3 lg:p-6 w-full items-center flex-1 min-h-full relative">
      <div class="flex flex-col w-full max-w-5xl relative space-y-2">
        <InstituteManagement />
        <div class="h-12" />
        <AdministratorsManagement />
      </div>
      <NarrowTips breakpoint="lg" />
    </div>
  );
}
