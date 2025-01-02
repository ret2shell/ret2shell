import { handleHttpError } from "@api";
import { getTeamList } from "@api/game";
import NarrowTips from "@blocks/narrow-tips";
import { type Team, TeamState } from "@models/team";
import { A, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { gameStore } from "@storage/game";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Input from "@widgets/input";
import LoadingTips from "@widgets/loading-tips";
import Pagination from "@widgets/pagination";
import Select from "@widgets/select";
import Tag from "@widgets/tag";
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, untrack } from "solid-js";

type OrderType = "id" | "name" | "institute_id" | "state";

export default function () {
  const [searchParams, setSearchParams] = useSearchParams();
  const [teams, setTeams] = createSignal([] as Team[]);
  const page = createMemo(() => (searchParams.page && Number.parseInt(searchParams.page as string)) || 1);
  const pageSize = 15;
  const [loading, setLoading] = createSignal(false);
  const [total, setTotal] = createSignal(0);
  const filter = createMemo(() => (searchParams.filter as string) || null);
  const order = createMemo(() => (searchParams.order as string) || "id");
  const instituteId = createMemo(
    () => (searchParams.institute && Number.parseInt(searchParams.institute as string)) || null
  );

  const institutesSelect = createMemo(() => {
    return accountStore.institutes.map((i) => ({
      value: i.id.toString(),
      label: i.name,
      icon: "icon-[fluent--hat-graduation-20-regular] w-5 h-5",
    }));
  });
  async function refreshTeams() {
    setLoading(true);
    try {
      const resp = await getTeamList(
        gameStore.current!.id,
        page(),
        pageSize,
        order() || "id",
        filter() ?? undefined,
        instituteId() ?? undefined
      );
      setTeams(resp[0]);
      setTotal(resp[1]);
    } catch (err) {
      handleHttpError(err as Error, t("game.admin.teams.fetchFailed")!);
    }
    setLoading(false);
  }
  createEffect(() => {
    if (page() && gameStore.current) {
      untrack(refreshTeams);
    }
  });
  return (
    <>
      <Title page={t("game.admin.teams.title")} route={`/games/${gameStore.current?.id}/admin/teams`} />
      <div class="w-full p-3 lg:p-6 flex flex-col flex-1 relative">
        <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
          <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
          <span class="flex-1 text-start">{t("game.admin.teams.title")}</span>
          <Select
            class="flex-1 max-w-48 min-w-0"
            size="sm"
            placeholder={t("game.admin.teams.sortBy")}
            items={[
              {
                value: "id",
                label: "ID",
                icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
              },
              {
                value: "name",
                label: t("game.admin.teams.name")!,
                icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
              },
              {
                value: "institute_id",
                label: t("game.admin.teams.institute")!,
                icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
              },
              {
                value: "state",
                label: t("game.admin.teams.state")!,
                icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
              },
            ]}
            onValueChange={(v) => {
              setSearchParams({ order: (v.value.at(0) || "id") as OrderType });
              setTimeout(refreshTeams, 100);
            }}
            value={order() ? [order()!] : undefined}
          />
          <Select
            class="flex-1 max-w-64 min-w-0"
            size="sm"
            placeholder={t("game.admin.teams.selectInstitute")}
            items={institutesSelect()}
            onValueChange={(v) => {
              setSearchParams({ institute: (v.value.at(0) && Number.parseInt(v.value.at(0)!)) || null });
              setTimeout(refreshTeams, 100);
            }}
            value={instituteId() ? [instituteId()!.toString()] : undefined}
          />
          <Input
            class="w-80"
            size="sm"
            icon={<span class="icon-[fluent--filter-16-regular] w-5 h-5" />}
            value={filter() || undefined}
            placeholder={t("game.admin.teams.filterPlaceholder")}
            onChange={(e) => {
              setSearchParams({ filter: e.target.value });
              setTimeout(refreshTeams, 100);
            }}
          />
        </h3>
        <Show when={loading()}>
          <div class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-4 px-2 hover:bg-layer-content/5">
            <LoadingTips />
          </div>
        </Show>
        <div class="flex-1 flex flex-col">
          <For
            each={teams()}
            fallback={
              <div class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
                <span class="icon-[fluent--emoji-sad-slight-20-regular] w-5 h-5" />
                <span>{t("game.team.noExtras")}</span>
              </div>
            }
          >
            {(team) => (
              <A
                class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-4 px-2 hover:bg-layer-content/5 cursor-pointer"
                href={`/games/${gameStore.current?.id}/teams/${team.id}`}
              >
                <span class="icon-[fluent--flag-20-regular] w-5 h-5" />
                <span class="flex-1 truncate text-start">
                  <span>{team.name}</span>
                  <span class="font-normal px-2 opacity-60">#{team.id.toString(16).padStart(6, "0")}</span>
                </span>
                <Show when={team.institute_id}>
                  <Tag level="info">
                    <span>{accountStore.institutes.find((v) => v.id === team.institute_id)?.name}</span>
                  </Tag>
                </Show>
                <Switch>
                  <Match when={team.state === TeamState.Banned}>
                    <Tag level="error">
                      <span>{t("game.admin.teams.banned")}</span>
                    </Tag>
                  </Match>
                  <Match when={team.state === TeamState.Pending}>
                    <Tag level="warning">
                      <span>{t("game.admin.teams.pending")}</span>
                    </Tag>
                  </Match>
                  <Match when={team.state === TeamState.Hidden}>
                    <Tag level="warning">
                      <span>{t("game.admin.teams.hidden")}</span>
                    </Tag>
                  </Match>
                </Switch>
                <span class="font-bold opacity-60">{team.score} pts</span>
                <span class="font-normal">{team.last_active_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
              </A>
            )}
          </For>
        </div>
        <Pagination
          class="p-6 lg:p-9"
          count={total()}
          pageSize={pageSize}
          page={page()}
          onPageChange={(page) => setSearchParams({ page: page.page })}
        />

        <NarrowTips breakpoint="lg" />
      </div>
    </>
  );
}
