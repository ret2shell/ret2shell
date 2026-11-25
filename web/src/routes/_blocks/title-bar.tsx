import { useAccountProfile } from "@api/account";
import { useGame } from "@api/game";
import { usePlatformInfo } from "@api/platform";
import { useSelfTeam } from "@api/team";
import LogoAnimate from "@assets/animates/logo-animate";
import { unicodeStrDisplayLength } from "@lib/shell/pty";
import { mediaPath } from "@lib/utils/media";
import { HostType } from "@models/game";
import { Permission } from "@models/user";
import { useLocation, useParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import {
  currentTimelinePeriod,
  isAdminOfGame,
  isGameCanParticipate,
  isGameInProgress,
  isPlayerCanAccessChallenges,
} from "@storage/game";
import { platformStore } from "@storage/platform";
import { t } from "@storage/theme";
import { toastStore } from "@storage/toast";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Divider from "@widgets/divider";
import Link from "@widgets/link";
import LoadingTips from "@widgets/loading-tips";
import Popover from "@widgets/popover";
import TimeProgress from "@widgets/time-progress";
import Timer from "@widgets/timer";
import { Transition, TransitionGroup } from "@widgets/transition";
import clsx from "clsx";
import { DateTime } from "luxon";
import { createMemo, createSignal, createTrackedEffect, Match, Show, Switch, untrack } from "solid-js";
import I18nBox, { I18nBoxContent } from "./i18n-box";
import InstanceBox, { InstanceBoxContent } from "./instance-box";
import NotificationBox, { NotificationBoxContent } from "./notification-box";
import ThemeBox, { ThemeBoxContent } from "./theme-box";
import UserBox from "./user-box";

function TitleLink() {
  const platformInfo = usePlatformInfo();
  const params = useParams();
  const location = useLocation();
  const gameId = () => Number.parseInt(params.game || "", 10);
  const game = useGame({ id: () => gameId(), enabled: () => !!gameId() });
  const link = createMemo(() => {
    if (game.data && game.data.host_type === HostType.Game && params.game) {
      return `/games/${game.data.id}/`;
    }
    return "/";
  });

  const name = createMemo(() => {
    if (game.data && game.data.host_type === HostType.Game && location.pathname.startsWith("/games/")) {
      return game.data.name;
    }
    return platformInfo.data?.name || t("platform.name");
  });

  const [typedName, setTypedName] = createSignal("");
  const [inClear, setInClear] = createSignal(false);

  createTrackedEffect(() => {
    if (name()) {
      untrack(() => {
        setInClear(true);
        setTimeout(() => {
          setTypedName(name());
          setInClear(false);
        }, 500);
      });
    }
  });

  return (
    <Link href={link()} ghost>
      <div class="w-6 h-6">
        <Transition
          name="fade-group-flip"
          mode="outin"
          onExit={(_el, done) => {
            setTimeout(() => {
              done();
            }, 300);
          }}
        >
          <Show
            when={game.data?.logo && location.pathname.startsWith("/games/")}
            fallback={<LogoAnimate class="fade-group-flip" width={24} height={24} />}
          >
            <img class="fade-group-flip" src={mediaPath(game.data?.logo)} width={24} height={24} alt="CTF" />
          </Show>
        </Transition>
      </div>
      <span />
      <div
        class={clsx(
          "transition-all duration-500 text-nowrap overflow-hidden border-r-2",
          inClear() ? "border-r-layer-content" : "border-r-transparent"
        )}
        style={{
          "max-width": inClear() ? "0px" : `${unicodeStrDisplayLength(typedName()) / 2 + 0.5}rem`,
        }}
      >
        {typedName()}
      </div>
    </Link>
  );
}

function GlobalNav(props: { size: "sm" | "md" }) {
  const accountInfo = useAccountProfile({
    enabled: () => !!accountStore.token,
  });
  const platformInfo = usePlatformInfo();
  return (
    <div class="fade-group-dive-left flex flex-col lg:flex-row items-center space-y-2 lg:space-y-0 lg:space-x-2">
      <Show
        when={!platformInfo.data?.zen_game}
        fallback={
          <li class="nav whitespace-nowrap w-full lg:w-auto">
            <Link
              class="w-full"
              href={`/games/${platformInfo.data?.zen_game}`}
              activeMatch="partial"
              ghost
              justify="start"
              size={props.size}
            >
              <span class="shrink-0 icon-[fluent--book-number-20-regular] w-5 h-5" />
              <span>{t("general.actions.back.title")}</span>
            </Link>
          </li>
        }
      >
        <li class="nav whitespace-nowrap w-full lg:w-auto">
          <Link class="w-full" href="/wiki" activeMatch="partial" ghost justify="start" size={props.size}>
            <span class="shrink-0 icon-[fluent--book-number-20-regular] w-5 h-5" />
            <span>{t("wiki.title")}</span>
          </Link>
        </li>
        <li class="nav whitespace-nowrap w-full lg:w-auto">
          <Link class="w-full" href="/training" activeMatch="partial" ghost justify="start" size={props.size}>
            <span class="shrink-0 icon-[fluent--dumbbell-20-regular] w-5 h-5" />
            <span>{t("training.title")}</span>
          </Link>
        </li>
        <li class="nav whitespace-nowrap w-full lg:w-auto">
          <Link class="w-full" href="/games" activeMatch="partial" ghost justify="start" size={props.size}>
            <span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />
            <span>{t("game.title")}</span>
          </Link>
        </li>
        <li class="nav whitespace-nowrap w-full lg:w-auto">
          <Link class="w-full" href="/bulletin" activeMatch="partial" ghost justify="start" size={props.size}>
            <span class="shrink-0 icon-[fluent--megaphone-20-regular] w-5 h-5" />
            <span>{t("bulletin.title")}</span>
          </Link>
        </li>
      </Show>
      <Show
        when={
          accountStore.token &&
          accountInfo.data &&
          (accountInfo.data?.permissions.includes(Permission.Statistics) ||
            accountInfo.data?.permissions.includes(Permission.DevOps) ||
            accountInfo.data?.permissions.includes(Permission.User))
        }
      >
        <li class="nav whitespace-nowrap w-full lg:w-auto">
          <Link class="w-full" href="/admin" activeMatch="partial" ghost justify="start" size={props.size}>
            <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
            <span>{t("admin.title")}</span>
          </Link>
        </li>
      </Show>
    </div>
  );
}

function GameNav(props: { size: "sm" | "md" }) {
  const params = useParams();
  const gameId = Number.parseInt(params.game || "", 10);
  const game = useGame({ id: () => gameId, enabled: () => !!gameId });
  const team = useSelfTeam({
    game_id: () => gameId,
    enabled: () => !!accountStore.token && !!game.data && !isAdminOfGame(game.data),
    silenced: true,
  });
  const accountInfo = useAccountProfile({
    enabled: () => !!accountStore.token,
  });
  const platformInfo = usePlatformInfo();
  return (
    <div class="fade-group-dive-left flex flex-col lg:flex-row items-center space-y-2 lg:space-y-0 lg:space-x-2">
      <li class="nav whitespace-nowrap w-full lg:w-auto">
        <Link
          class="w-full"
          href={`/games/${gameId}/challenges`}
          activeMatch="partial"
          ghost
          justify="start"
          size={props.size}
          disabled={!isPlayerCanAccessChallenges(game.data, team.data)[0]}
          title={isPlayerCanAccessChallenges(game.data, team.data)[1]}
        >
          <span class="shrink-0 icon-[fluent--code-20-regular] w-5 h-5" />
          <span>{t("challenge.title")}</span>
        </Link>
      </li>
      <li class="nav whitespace-nowrap w-full lg:w-auto">
        <Link
          class="w-full"
          href={`/games/${gameId}/scoreboard`}
          activeMatch="partial"
          ghost
          justify="start"
          size={props.size}
        >
          <span class="shrink-0 icon-[fluent--trophy-20-regular] w-5 h-5" />
          <span>{t("game.scoreboard.title")}</span>
        </Link>
      </li>
      <Switch>
        <Match when={team.data}>
          <li class="nav whitespace-nowrap w-full lg:w-auto">
            <Link
              class="w-full"
              href={`/games/${gameId}/teams/${team.data?.id}`}
              activeMatch="partial"
              ghost
              justify="start"
              size={props.size}
            >
              <span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />
              <span>{t("team.selfManagement")}</span>
            </Link>
          </li>
        </Match>
        <Match when={isGameCanParticipate(game.data)}>
          <li class="nav whitespace-nowrap w-full lg:w-auto">
            <Link
              class="w-full"
              href={`/games/${gameId}/teams/choose`}
              activeMatch="partial"
              ghost
              justify="start"
              size={props.size}
            >
              <span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />
              <span>{t("game.join")}</span>
            </Link>
          </li>
        </Match>
      </Switch>
      <Show when={isAdminOfGame(game.data)}>
        <li class="nav whitespace-nowrap w-full lg:w-auto">
          <Link
            class="w-full"
            href={`/games/${gameId}/admin`}
            activeMatch="partial"
            ghost
            justify="start"
            size={props.size}
          >
            <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
            <span>{t("game.admin.title")}</span>
          </Link>
        </li>
      </Show>
      <Show
        when={!platformInfo.data?.zen_game}
        fallback={
          <Show
            when={
              accountStore.token &&
              accountInfo.data &&
              (accountInfo.data?.permissions.includes(Permission.Statistics) ||
                accountInfo.data?.permissions.includes(Permission.DevOps) ||
                accountInfo.data?.permissions.includes(Permission.User))
            }
          >
            <li class="nav whitespace-nowrap w-full lg:w-auto">
              <Link class="w-full" href="/admin" activeMatch="partial" ghost justify="start" size={props.size}>
                <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
                <span>{t("admin.platformTitle")}</span>
              </Link>
            </li>
          </Show>
        }
      >
        <li class="nav whitespace-nowrap w-full lg:w-auto">
          <Link class="w-full" href={"/games/"} ghost justify="start" size={props.size} level="warning">
            <span class="shrink-0 icon-[fluent--arrow-exit-20-regular] w-5 h-5" />
            <span>{t("general.actions.back.title")}</span>
          </Link>
        </li>
      </Show>
    </div>
  );
}

export default function TitleBar() {
  const [additionalMobileBox, setAdditionalMobileBox] = createSignal<"wsrx" | "notification" | "theme" | "i18n" | null>(
    null
  );
  const platformInfo = usePlatformInfo();
  const params = useParams();
  const location = useLocation();
  const gameId = () => Number.parseInt(params.game || "NaN", 10);
  const game = useGame({ id: () => gameId(), enabled: () => !!gameId() });
  const [offlineLoading, setOfflineLoading] = createSignal(false);
  const [bannerRead, setBannerRead] = createSignal(false);
  function reloadPage() {
    setOfflineLoading(true);
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }

  return (
    <>
      <div id="page-top" class="print:hidden" />
      <div class="hidden print:flex flex-row border-b border-b-layer-content/60 w-full">
        <span>{platformInfo.data?.name || t("platform.name")}</span>
        <span class="flex-1" />
        <span>{DateTime.now().toFormat("yyyy-MM-dd HH:mm:ss")}</span>
      </div>
      <div
        class={clsx(
          "w-screen bg-layer/60 backdrop-blur-sm z-50",
          "print:hidden print:static print:h-0 print:max-h-0 print:overflow-hidden",
          "sticky top-0 left-0 transition-colors duration-700 flex flex-col"
        )}
      >
        <div class="bg-layer-content/5 border-b border-b-layer-content/15 w-full h-16 px-2 py-0 flex flex-row items-center relative">
          <div class="lg:hidden">
            <Popover
              btnContent={<span class="shrink-0 icon-[fluent--navigation-20-regular] w-5 h-5" />}
              square
              ghost
              popContentClass="pt-2"
            >
              <div class="flex flex-col space-y-2 max-w-64">
                <Card contentClass="p-2 flex flex-col space-y-2">
                  <ul class="flex flex-col space-y-2">
                    <Switch>
                      <Match
                        when={
                          platformStore.isOnline && params.game && game.data && location.pathname.startsWith("/games/")
                        }
                      >
                        <GameNav size="sm" />
                      </Match>
                      <Match when={platformStore.isOnline}>
                        <GlobalNav size="sm" />
                      </Match>
                    </Switch>
                    <Divider direction="horizontal" />
                    <li>
                      <Button
                        justify="start"
                        class="w-full"
                        size="sm"
                        ghost={additionalMobileBox() !== "notification"}
                        onClick={() => setAdditionalMobileBox("notification")}
                      >
                        <span
                          class={clsx(
                            toastStore.toasts.length > 0
                              ? "icon-[fluent--alert-badge-20-filled] text-primary"
                              : "icon-[fluent--alert-20-regular]",
                            "w-5 h-5"
                          )}
                        />
                        <span>{t("notification.title")}</span>
                      </Button>
                    </li>
                    <li>
                      <Button
                        justify="start"
                        class="w-full"
                        size="sm"
                        ghost={additionalMobileBox() !== "theme"}
                        onClick={() => setAdditionalMobileBox("theme")}
                      >
                        <span class="shrink-0 icon-[fluent--wand-20-regular] w-5 h-5" />
                        <span>{t("platform.theme.title")}</span>
                      </Button>
                    </li>
                    <li>
                      <Button
                        justify="start"
                        class="w-full"
                        size="sm"
                        ghost={additionalMobileBox() !== "i18n"}
                        onClick={() => setAdditionalMobileBox("i18n")}
                      >
                        <span class="shrink-0 icon-[fluent--local-language-20-regular] w-5 h-5" />
                        <span class="shrink-0 icon-[fluent-emoji-flat--construction-worker] w-5 h-5" />
                        <span class="shrink-0 icon-[fluent-emoji-flat--construction-worker-dark] w-5 h-5" />
                        <span class="shrink-0 icon-[fluent-emoji-flat--construction-worker-light] w-5 h-5" />
                        <span class="shrink-0 icon-[fluent-emoji-flat--construction-worker-medium] w-5 h-5" />
                        <span class="shrink-0 icon-[fluent-emoji-flat--construction-worker-medium-dark] w-5 h-5" />
                      </Button>
                    </li>
                  </ul>
                </Card>
                <Switch fallback={null}>
                  <Match when={additionalMobileBox() === "wsrx"}>
                    <InstanceBoxContent />
                  </Match>
                  <Match when={additionalMobileBox() === "notification"}>
                    <NotificationBoxContent />
                  </Match>
                  <Match when={additionalMobileBox() === "theme"}>
                    <ThemeBoxContent />
                  </Match>
                  <Match when={additionalMobileBox() === "i18n"}>
                    <I18nBoxContent />
                  </Match>
                </Switch>
              </div>
            </Popover>
          </div>
          <TitleLink />
          <div class="w-4" />
          <ul class="lg:flex flex-row space-x-2 items-center hidden">
            <Show when={platformStore.isOnline} fallback={<LoadingTips class="fade-group-dive-left opacity-60" />}>
              <Transition
                name="fade-group-dive-left"
                mode="outin"
                onExit={(_el, done) => {
                  setTimeout(() => {
                    done();
                  }, 300);
                }}
              >
                <Show
                  when={platformStore.isOnline && params.game && game.data && location.pathname.startsWith("/games/")}
                  fallback={<GlobalNav size="md" />}
                >
                  <GameNav size="md" />
                </Show>
              </Transition>
            </Show>
          </ul>
          <div class="flex-1" />
          <div class="flex flex-row space-x-2">
            <div class="hidden lg:flex flex-row space-x-2">
              <TransitionGroup name="fade-group-right">
                <Show when={platformStore.isOnline && accountStore.token !== null && game.data}>
                  <Switch>
                    <Match when={game.data && game.data.host_type === HostType.Training}>
                      <div class="fade-group-right grid grid-cols-1 items-center justify-center px-4 relative">
                        <div>
                          <span class="space-x-2 truncate max-w-full">{t("training.openForever")}</span>
                          <TimeProgress
                            class="w-full"
                            startAt={game.data?.start_at || DateTime.now()}
                            endAt={game.data?.start_at || DateTime.now()}
                          />
                        </div>
                      </div>
                    </Match>
                    <Match when={isGameInProgress(game.data)}>
                      <div class="fade-group-right grid grid-cols-1 items-center justify-center px-4 relative">
                        <div>
                          <div class="space-x-2 truncate max-w-full">
                            <Show when={currentTimelinePeriod(game.data)?.end_at}>
                              <span>[</span>
                              <span class="font-bold text-primary">
                                {currentTimelinePeriod(game.data)?.label ?? ""}
                              </span>
                              <Timer class="text-primary" end={currentTimelinePeriod(game.data)!.end_at} hasHours />
                              <span>]</span>
                            </Show>
                            <Timer end={game.data!.end_at} hasHours />
                          </div>
                          <TimeProgress class="w-full" startAt={game.data!.start_at} endAt={game.data!.end_at} />
                        </div>
                      </div>
                    </Match>
                  </Switch>
                  <InstanceBox />
                </Show>
              </TransitionGroup>
              <NotificationBox />
              <ThemeBox />
              <I18nBox />
            </div>
            <Switch
              fallback={
                <Button level="error" loading={offlineLoading()} onClick={reloadPage}>
                  <Show when={!offlineLoading()}>
                    <span class="shrink-0 icon-[fluent--dismiss-circle-20-filled] w-5 h-5" />
                  </Show>
                  <span>{t("platform.errors.offline.title")}</span>
                </Button>
              }
            >
              <Match when={platformStore.isOnline}>
                <UserBox />
              </Match>
              <Match when={platformStore.under_maintenance}>
                <Button level="warning" loading={offlineLoading()} onClick={reloadPage}>
                  <Show when={!offlineLoading()}>
                    <span class="shrink-0 icon-[fluent--warning-20-filled] w-5 h-5" />
                  </Show>
                  <span>{t("platform.errors.maintaining.title")}</span>
                </Button>
              </Match>
            </Switch>
          </div>
        </div>
        <div
          class={clsx(
            platformInfo.data?.highlight_banner && !bannerRead() ? "h-12" : "h-0",
            "transition-all overflow-hidden bg-primary/30 flex items-center px-2 space-x-2 backdrop-blur-lg"
          )}
        >
          <span class="shrink-0 icon-[fluent--warning-20-filled] mx-2" />
          <span class="font-bold flex-1 truncate">{platformInfo.data?.highlight_banner}</span>
          <Button square ghost size="sm" onClick={() => setBannerRead(true)}>
            <span class="shrink-0 icon-[fluent--dismiss-20-regular] w-5 h-5" />
          </Button>
        </div>
      </div>
    </>
  );
}
