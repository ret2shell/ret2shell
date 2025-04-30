import { handleHttpError } from "@api";
import { getUser, getUserTeams } from "@api/user";
import SidebarLayout from "@blocks/sidebar-layout";
import type { Team } from "@models/team";
import type { User } from "@models/user";
import { createBreakpoints } from "@solid-primitives/media";
import { A, useNavigate, useParams } from "@solidjs/router";
import { Title } from "@storage/header";
import { breakpoints, t } from "@storage/theme";
import Article from "@widgets/article";
import Button from "@widgets/button";
import LoadingTips from "@widgets/loading-tips";
import clsx from "clsx";
import { For, Match, Show, Switch, createEffect, createSignal, untrack } from "solid-js";
import { Transition } from "solid-transition-group";
import Sidebar from "./_blocks/sidebar";

export default function () {
  const [user, setUser] = createSignal(null as null | User);
  const [loading, setLoading] = createSignal(true);
  const params = useParams();
  const navigate = useNavigate();
  const userId = () => Number.parseInt(params.user) || null;
  const [teams, setTeams] = createSignal([] as Team[]);
  createEffect(() => {
    if (!userId()) {
      navigate("/sigtrap/404", { replace: true });
    }
    untrack(async () => {
      setLoading(true);
      try {
        setUser(await getUser(userId()!));
        setTeams(
          (await getUserTeams(userId()!)).sort((a, b) => a.last_active_at.toMillis() - b.last_active_at.toMillis())
        );
      } catch (err) {
        handleHttpError(err as Error, t("team.errors.fetchList.title")!);
      }
      setLoading(false);
    });
  });
  const matches = createBreakpoints(breakpoints);
  const [showSidebar, setShowSidebar] = createSignal(false);

  return (
    <>
      <Title page={user()?.nickname} route={`/users/${user()?.id}`} />
      <SidebarLayout leftBar={() => <Sidebar user={user()} loading={loading()} />} showLeftBar={showSidebar()}>
        <div class="flex-1 flex flex-col items-center p-3 lg:p-6">
          <div class="flex flex-col w-full max-w-5xl">
            <h3 class="h-12 flex items-center border-b border-b-layer-content/15 font-bold space-x-2">
              <span class="icon-[fluent--person-20-regular] w-5 h-5" />
              <span>{t("user.description.title")}</span>
            </h3>
            <section>
              <Switch>
                <Match when={loading()}>
                  <LoadingTips />
                </Match>
                <Match when={true}>
                  <Article content={user()?.description || t("user.description.empty")!} />
                </Match>
              </Switch>
            </section>
            <h3 class="h-12 flex items-center border-b border-b-layer-content/15 font-bold space-x-2">
              <span class="icon-[fluent--flag-20-regular] w-5 h-5" />
              <span>{t("user.joinedGames")}</span>
            </h3>
            <section class="flex flex-col">
              <For each={teams()}>
                {(team) => (
                  <A
                    class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 hover:bg-layer-content/5 hover:cursor-pointer"
                    href={`/games/${team.game_id}/teams/${team.id}`}
                  >
                    <span class="icon-[fluent--flag-20-regular] w-5 h-5 text-warning" />
                    <span class="flex-1 text-start truncate">
                      {t("user.gameJournal", { team: team.name, game: team.game_name! })}
                    </span>
                    <span class="opacity-60">{team.last_active_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
                  </A>
                )}
              </For>
              <div class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
                <span class="icon-[fluent--search-sparkle-20-regular] w-5 h-5 text-info" />
                <span>{t("user.moreJournal")}</span>
              </div>
            </section>
          </div>
        </div>
      </SidebarLayout>
      <Transition name="slide-fade-right">
        <Show when={!matches.lg}>
          <Button
            class="fixed bottom-3 right-3 z-30"
            square
            onClick={() => setShowSidebar(!showSidebar())}
            type="button"
          >
            <span
              class={clsx(
                "transition-transform",
                showSidebar() ? "rotate-90" : "rotate-0",
                showSidebar() ? "icon-[fluent--dismiss-20-regular]" : "icon-[fluent--person-20-regular]",
                "w-5 h-5"
              )}
            />
          </Button>
        </Show>
      </Transition>
    </>
  );
}
