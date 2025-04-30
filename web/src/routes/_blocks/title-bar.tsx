import LogoAnimate from "@assets/animates/logo-animate";
import { mediaPath } from "@lib/utils/media";
import { wsrx } from "@lib/wsrx";
import { HostType } from "@models/game";
import { Permission } from "@models/user";
import { useLocation, useParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { canAccessChallenges, currentTimelinePeriod, gameStore, inProgress, isGameAdmin } from "@storage/game";
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
import { WsrxState } from "@xdsec/wsrx";
import clsx from "clsx";
import { DateTime } from "luxon";
import { Match, Show, Switch, createMemo, createSignal } from "solid-js";
import InstanceBox, { InstanceBoxContent } from "./instance-box";
import NotificationBox, { NotificationBoxContent } from "./notification-box";
import ThemeBox, { ThemeBoxContent } from "./theme-box";
import UserBox from "./user-box";
function GlobalTitleLink() {
  const location = useLocation();
  const inDocs = createMemo(() => location.pathname.startsWith("/docs"));
  return (
    <Link ghost href={inDocs() ? "/docs" : "/"}>
      <LogoAnimate class="hidden lg:inline-block" width={24} height={24} />
      <span />
      <span>
        {inDocs() ? `${t("docs.title")} - ${t("platform.name")}` : platformStore.config.name || t("platform.name")}
      </span>
    </Link>
  );
}

function GameTitleLink() {
  return (
    <Link ghost href={`/games/${gameStore.current?.id}/`}>
      <Show when={gameStore.current?.logo} fallback={<LogoAnimate width={24} height={24} />}>
        <img src={mediaPath(gameStore.current!.logo!)} width={24} height={24} alt="CTF" />
      </Show>
      <span />
      <span>{gameStore.current?.name}</span>
    </Link>
  );
}

function GlobalNav(props: { size: "sm" | "md" }) {
  return (
    <>
      <li class="nav whitespace-nowrap">
        <Link class="w-full" href="/wiki" activeMatch="partial" ghost justify="start" size={props.size}>
          <span class="icon-[fluent--book-number-20-regular] w-5 h-5" />
          <span>{t("wiki.title")}</span>
        </Link>
      </li>
      <li class="nav whitespace-nowrap">
        <Link class="w-full" href="/training" activeMatch="partial" ghost justify="start" size={props.size}>
          <span class="icon-[fluent--dumbbell-20-regular] w-5 h-5" />
          <span>{t("training.title")}</span>
        </Link>
      </li>
      <li class="nav whitespace-nowrap">
        <Link class="w-full" href="/games" activeMatch="partial" ghost justify="start" size={props.size}>
          <span class="icon-[fluent--flag-20-regular] w-5 h-5" />
          <span>{t("game.title")}</span>
        </Link>
      </li>
      <li class="nav whitespace-nowrap">
        <Link class="w-full" href="/bulletin" activeMatch="partial" ghost justify="start" size={props.size}>
          <span class="icon-[fluent--megaphone-20-regular] w-5 h-5" />
          <span>{t("bulletin.title")}</span>
        </Link>
      </li>
      <Show
        when={
          accountStore.token &&
          accountStore.info &&
          (accountStore.info?.permissions.includes(Permission.Statistics) ||
            accountStore.info?.permissions.includes(Permission.DevOps) ||
            accountStore.info?.permissions.includes(Permission.User))
        }
      >
        <li class="nav whitespace-nowrap">
          <Link class="w-full" href="/admin" activeMatch="partial" ghost justify="start" size={props.size}>
            <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
            <span>{t("admin.title")}</span>
          </Link>
        </li>
      </Show>
    </>
  );
}

function GameNav(props: { size: "sm" | "md" }) {
  return (
    <>
      <li class="nav whitespace-nowrap">
        <Link
          class="w-full"
          href={`/games/${gameStore.current?.id}/challenges`}
          activeMatch="partial"
          ghost
          justify="start"
          size={props.size}
          disabled={!canAccessChallenges()[0]}
          title={canAccessChallenges()[1]}
        >
          <span class="icon-[fluent--code-20-regular] w-5 h-5" />
          <span>{t("challenge.title")}</span>
        </Link>
      </li>
      <li class="nav whitespace-nowrap">
        <Link
          class="w-full"
          href={`/games/${gameStore.current?.id}/scoreboard`}
          activeMatch="partial"
          ghost
          justify="start"
          size={props.size}
        >
          <span class="icon-[fluent--trophy-20-regular] w-5 h-5" />
          <span>{t("game.scoreboard.title")}</span>
        </Link>
      </li>
      <Show when={isGameAdmin()}>
        <li class="nav whitespace-nowrap">
          <Link
            class="w-full"
            href={`/games/${gameStore.current?.id}/admin`}
            activeMatch="partial"
            ghost
            justify="start"
            size={props.size}
          >
            <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
            <span>{t("game.admin.title")}</span>
          </Link>
        </li>
      </Show>
      <li class="nav whitespace-nowrap">
        <Link class="w-full" href={"/games/"} ghost justify="start" size={props.size} level="warning">
          <span class="icon-[fluent--arrow-exit-20-regular] w-5 h-5" />
          <span>{t("general.actions.exit.title")}</span>
        </Link>
      </li>
    </>
  );
}

export default function TitleBar() {
  const [additionalMobileBox, setAdditionalMobileBox] = createSignal<"wsrx" | "notification" | "diy" | null>(null);
  const params = useParams();
  const location = useLocation();
  const inDocs = () => location.pathname.startsWith("/docs");
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
        <span>{inDocs() ? t("docs.tip") : platformStore.config.name || t("platform.name")}</span>
        <span class="flex-1" />
        <span>{DateTime.now().toFormat("yyyy-MM-dd HH:mm:ss")}</span>
      </div>
      <div class="h-16 border-b border-b-layer-content/15 w-screen bg-layer/60 backdrop-blur-sm z-50 print:hidden print:static print:h-0 print:max-h-0 print:overflow-hidden sticky top-0 left-0 transition-colors duration-700">
        <div class="bg-layer-content/5 w-full h-full px-2 py-0 flex flex-row items-center relative">
          <div class="lg:hidden">
            <Popover
              btnContent={<span class="icon-[fluent--navigation-20-regular] w-5 h-5" />}
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
                          gameStore.current &&
                          gameStore.current.host_type === HostType.Game &&
                          params.game &&
                          location.pathname.startsWith(`/games/${params.game}`)
                        }
                      >
                        <GameNav size="sm" />
                      </Match>
                      <Match when={platformStore.isOnline}>
                        <GlobalNav size="sm" />
                      </Match>
                    </Switch>
                    <Divider direction="horizontal" />
                    <Show when={platformStore.isOnline && accountStore.token !== null && gameStore.current}>
                      <Button
                        justify="start"
                        size="sm"
                        ghost={additionalMobileBox() !== "wsrx"}
                        onClick={() => setAdditionalMobileBox("wsrx")}
                      >
                        <span
                          class={clsx(
                            wsrx.instances().length > 0
                              ? "icon-[fluent--fluid-20-filled]"
                              : "icon-[fluent--fluid-20-regular]",
                            "w-5 h-5",
                            wsrx.instances().length > 0 &&
                              (wsrx.state() === WsrxState.Usable ? "text-success" : "text-warning")
                          )}
                        />
                        <span>{t("wsrx.title")}</span>
                      </Button>
                    </Show>
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
                        ghost={additionalMobileBox() !== "diy"}
                        onClick={() => setAdditionalMobileBox("diy")}
                      >
                        <span class="icon-[fluent--wand-20-regular] w-5 h-5" />
                        <span>{t("platform.theme.title")}</span>
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
                  <Match when={additionalMobileBox() === "diy"}>
                    <ThemeBoxContent />
                  </Match>
                </Switch>
              </div>
            </Popover>
          </div>
          <Switch fallback={<GlobalTitleLink />}>
            <Match
              when={
                gameStore.current &&
                gameStore.current.host_type === HostType.Game &&
                params.game &&
                location.pathname.startsWith(`/games/${params.game}`)
              }
            >
              <GameTitleLink />
            </Match>
          </Switch>
          <div class="w-4" />
          <ul class="lg:flex flex-row space-x-2 items-center hidden">
            <Switch fallback={<LoadingTips class="opacity-60" />}>
              <Match
                when={
                  platformStore.isOnline &&
                  gameStore.current &&
                  gameStore.current.host_type === HostType.Game &&
                  params.game &&
                  location.pathname.startsWith(`/games/${params.game}`)
                }
              >
                <GameNav size="md" />
              </Match>
              <Match when={inDocs()}>
                <span class="flex flex-row items-center space-x-2">
                  <span class="opacity-60">{t("docs.forVersion")}:</span>
                  <span class="font-bold opacity-80">{platformStore.version}</span>
                </span>
              </Match>
              <Match when={platformStore.isOnline}>
                <GlobalNav size="md" />
              </Match>
            </Switch>
          </ul>
          <div class="flex-1" />
          <div class="flex flex-row space-x-2">
            <div class="hidden lg:flex flex-row space-x-2">
              <Show when={platformStore.isOnline && accountStore.token !== null && gameStore.current}>
                <Switch>
                  <Match when={gameStore.current && gameStore.current.host_type === HostType.Training}>
                    <div class="grid grid-cols-1 items-center justify-center px-4 relative">
                      <div>
                        <span class="space-x-2 truncate max-w-full">{t("training.openForever")}</span>
                        <TimeProgress
                          class="w-full"
                          startAt={gameStore.current!.start_at}
                          endAt={gameStore.current!.start_at}
                        />
                      </div>
                    </div>
                  </Match>
                  <Match when={inProgress()}>
                    <div class="grid grid-cols-1 items-center justify-center px-4 relative">
                      <div>
                        <div class="space-x-2 truncate max-w-full">
                          <Show when={currentTimelinePeriod()?.end_at}>
                            <span>[</span>
                            <span class="font-bold text-primary">{currentTimelinePeriod()?.label ?? ""}</span>
                            <Timer class="text-primary" end={currentTimelinePeriod()!.end_at} hasHours />
                            <span>]</span>
                          </Show>
                          <Timer end={gameStore.current!.end_at} hasHours />
                        </div>
                        <TimeProgress
                          class="w-full"
                          startAt={gameStore.current!.start_at}
                          endAt={gameStore.current!.end_at}
                        />
                      </div>
                    </div>
                  </Match>
                </Switch>
                <InstanceBox />
              </Show>
              <NotificationBox />
              <ThemeBox />
            </div>
            <Switch
              fallback={
                <Button level="error" loading={offlineLoading()} onClick={reloadPage}>
                  <Show when={!offlineLoading()}>
                    <span class="icon-[fluent--dismiss-circle-20-filled] w-5 h-5" />
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
                    <span class="icon-[fluent--warning-20-filled] w-5 h-5" />
                  </Show>
                  <span>{t("platform.errors.maintaining.title")}</span>
                </Button>
              </Match>
            </Switch>
          </div>
          <Show when={platformStore.config.highlight_banner && !bannerRead()}>
            <div class="absolute left-0 right-0 top-16 h-12 bg-primary/30 flex items-center px-2 space-x-2">
              <span class="icon-[fluent--warning-20-filled] mx-2" />
              <span class="font-bold flex-1 truncate">{platformStore.config.highlight_banner}</span>
              <Button ghost size="sm" onClick={() => setBannerRead(true)}>
                <span class="icon-[fluent--dismiss-20-regular] w-5 h-5" />
              </Button>
            </div>
          </Show>
        </div>
      </div>
    </>
  );
}
