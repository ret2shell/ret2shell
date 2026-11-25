import { useInstitutes } from "@api/account";
import { useTeamList } from "@api/team";
import { type Team, TeamState } from "@models/team";
import { createBreakpoints } from "@solid-primitives/media";
import { useParams, useSearchParams } from "@solidjs/router";
import { Title } from "@storage/header";
import { breakpoints, t } from "@storage/theme";
import Input from "@widgets/input";
import LoadingTips from "@widgets/loading-tips";
import Pagination from "@widgets/pagination";
import Select from "@widgets/select";
import Tag from "@widgets/tag";
import { createMemo, For, Match, Show, Switch } from "solid-js";

type OrderType = "id" | "name" | "institute_id" | "state";

export default function () {
  const params = useParams();
  const gameId = createMemo(() => Number.parseInt(params.game ?? "", 10) || -1);
  const [searchParams, setSearchParams] = useSearchParams();
  const page = createMemo(() => (searchParams.page && Number.parseInt(searchParams.page as string, 10)) || 1);
  const pageSize = 15;
  const filter = createMemo(() => (searchParams.filter as string) || null);
  const order = createMemo(() => (searchParams.order as string) || "id");
  const instituteId = createMemo(
    () => (searchParams.institute && Number.parseInt(searchParams.institute as string, 10)) || null
  );
  const institutes = useInstitutes();

  const institutesSelect = createMemo(() => {
    return (
      institutes.data?.map((i) => ({
        value: i.id.toString(),
        label: i.name,
        icon: "icon-[fluent--hat-graduation-20-regular] w-5 h-5",
      })) ?? []
    );
  });

  const teams = useTeamList({
    game_id: gameId,
    page: () => page(),
    page_size: () => pageSize,
    order: () => order() || "id",
    filter: () => filter() ?? "",
    institute_id: () => instituteId(),
    enabled: () => gameId() > 0,
  });

  const matches = createBreakpoints(breakpoints);
  return (
    <>
      <Title page={t("team.list.title")} route={`/games/${gameId()}/admin/teams`} />
      <div class="w-full p-3 lg:p-6 flex flex-col flex-1 relative">
        <h3 class="min-h-12 flex flex-wrap justify-end py-2 gap-y-2 items-center border-b border-b-layer-content/10 font-bold space-x-2">
          <div class="flex flex-row items-center space-x-2">
            <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
            <span class="flex-1 text-start">{t("team.list.title")}</span>
          </div>
          <span class="flex-1" />
          <Select
            class="flex-1 max-w-48 min-w-32"
            size="sm"
            placeholder={t("team.sortBy")}
            items={[
              {
                value: "id",
                label: "ID",
                icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
              },
              {
                value: "name",
                label: t("team.form.name.label"),
                icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
              },
              {
                value: "institute_id",
                label: t("team.form.institute.label"),
                icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
              },
              {
                value: "state",
                label: t("team.form.state.label"),
                icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
              },
            ]}
            onValueChange={(v) => {
              setSearchParams({ order: (v.value.at(0) || "id") as OrderType });
            }}
            value={order() ? [order()!] : undefined}
          />
          <Select
            class="flex-1 max-w-64 min-w-48"
            size="sm"
            placeholder={t("team.list.selectInstitute")}
            items={institutesSelect()}
            onValueChange={(v) => {
              setSearchParams({ institute: (v.value.at(0) && Number.parseInt(v.value.at(0)!, 10)) || null });
            }}
            value={instituteId() ? [instituteId()!.toString()] : undefined}
          />
          <Input
            class="w-80"
            size="sm"
            icon={<span class="shrink-0 icon-[fluent--filter-16-regular] w-5 h-5" />}
            value={filter() ?? ""}
            placeholder={t("team.list.filter")}
            onChange={(e) => {
              setSearchParams({ filter: e.target.value || undefined, page: null });
            }}
          />
        </h3>
        <Show when={teams.isLoading}>
          <div class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-4 px-2 hover:bg-layer-content/5">
            <LoadingTips />
          </div>
        </Show>
        <div class="grid grid-cols-1 w-full">
          <For
            each={teams.data?.[0] || ([] as Team[])}
            fallback={
              <div class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
                <span class="shrink-0 icon-[fluent--emoji-sad-slight-20-regular] w-5 h-5" />
                <span>{t("team.empty")}</span>
              </div>
            }
          >
            {(team) => (
              <a
                class="h-12 flex flex-row items-center border-b border-b-layer-content/10 font-bold space-x-4 px-2 hover:bg-layer-content/5 cursor-pointer"
                href={`/games/${gameId()}/teams/${team.id}`}
              >
                <span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />
                <span class="flex truncate text-start">
                  <span class="flex-1 min-w-16 truncate">
                    <span>{team.name}</span>
                    <span class="font-normal px-2 opacity-60">#{team.id.toString(16).padStart(6, "0")}</span>
                  </span>
                </span>
                <span class="flex-1" />
                <span class="flex flex-row items-center justify-end space-x-4 overflow-auto">
                  <Show when={team.institute_id}>
                    <Tag class="min-w-16" level="info">
                      <span class="flex-1 truncate">
                        {institutes.data?.find((v) => v.id === team.institute_id)?.name}
                      </span>
                    </Tag>
                  </Show>
                  <Switch>
                    <Match when={team.state === TeamState.Banned}>
                      <Tag class="min-w-16" level="error">
                        <span class="flex-1 truncate">{t("team.status.banned.title")}</span>
                      </Tag>
                    </Match>
                    <Match when={team.state === TeamState.Pending}>
                      <Tag class="min-w-16" level="warning">
                        <span class="flex-1 truncate">{t("team.status.pending.title")}</span>
                      </Tag>
                    </Match>
                    <Match when={team.state === TeamState.Hidden}>
                      <Tag class="min-w-16" level="warning">
                        <span class="flex-1 truncate">{t("team.status.hidden.title")}</span>
                      </Tag>
                    </Match>
                  </Switch>
                </span>
                <span class="font-bold opacity-60 whitespace-nowrap">{team.score} pts</span>
                <span class="font-normal whitespace-nowrap">
                  <Switch fallback={team.last_active_at.toFormat("MM-dd HH:mm")}>
                    <Match when={matches.lg}>{team.last_active_at.toFormat("yyyy-MM-dd HH:mm:ss")}</Match>
                    <Match when={matches.md}>{team.last_active_at.toFormat("MM-dd HH:mm:ss")}</Match>
                  </Switch>
                </span>
              </a>
            )}
          </For>
        </div>
        <Pagination
          class="p-6 lg:p-9"
          count={teams.data?.[1] || 0}
          pageSize={pageSize}
          page={page()}
          onPageChange={(page) => setSearchParams({ page: page.page })}
        />

        {/* <NarrowTips breakpoint="md" /> */}
      </div>
    </>
  );
}
