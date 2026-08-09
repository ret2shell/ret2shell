import { usePlatformInfo } from "@api/platform";
import LogoAnimate from "@assets/animates/logo-animate";
// import NarrowTips from "@blocks/narrow-tips";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { platformStore } from "@storage/platform";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Link from "@widgets/link";
import Popover from "@widgets/popover";
import { createEffect, onMount, Show } from "solid-js";
// import Calendar from "./calendar";

export default function () {
  const platformInfo = usePlatformInfo();
  const [searchParams] = useSearchParams();
  let calendarSection: HTMLElement;
  const navigate = useNavigate();
  onMount(() => {
    if (searchParams.event) {
      try {
        const result = Number.parseInt(searchParams.event as string, 10);
        if (result) {
          setTimeout(() => {
            calendarSection!.scrollIntoView({ behavior: "smooth" });
          }, 1000);
        }
      } catch {
        // prevent lint
      }
    }
  });

  createEffect(() => {
    if (platformInfo.data?.zen_game) {
      navigate(`/games/${platformInfo.data.zen_game}`);
    }
  });

  return (
    <div class="flex-1 relative">
      <div class="absolute h-full w-full overflow-scroll snap-mandatory snap-y">
        <section class="h-full min-h-full snap-center flex flex-col items-center justify-center relative">
          <div class="flex-1" />
          <h1 class="text-3xl font-bold opacity-80">
            &nbsp;&nbsp;
            <span>[&nbsp;{platformInfo.data?.name || t("platform.name")}&nbsp;]</span>
            &nbsp;
            <span class="text-primary animate-ping">_</span>
          </h1>
          <a
            class="text-xl text-error mt-8"
            href={platformInfo.data?.subject_url || "#"}
            target="_blank"
            rel="noreferrer"
          >
            {platformInfo.data?.subject_info || t("platform.subject")}
          </a>
          <div class="flex-1" />
          <div class="h-24" />
          <div class="absolute bottom-4 flex flex-row flex-wrap items-center justify-center h-auto p-2 space-x-2 opacity-60">
            <Button ghost class="inline-flex flex-row space-x-1 flex-wrap h-auto max-w-full">
              <span>(C) 2022 - {new Date().getFullYear()}</span>
              <a class="hover:underline" href={platformInfo.data?.footer_url || "#"} target="_blank" rel="noreferrer">
                {platformInfo.data?.footer_info}
              </a>
              <Show when={platformInfo.data?.record}>
                <span class="opacity-40">|</span>
                <a class="hover:underline" href="https://beian.miit.gov.cn" target="_blank" rel="noreferrer">
                  {platformInfo.data?.record}
                </a>
              </Show>
            </Button>
            <Show when={!platformInfo.data?.hide_maker}>
              <Popover
                aria-label="about"
                ghost
                popContentClass="p-2"
                square
                btnContent={<span class="shrink-0 icon-[fluent--info-20-regular] w-5 h-5" />}
              >
                <div class="w-max flex flex-col space-y-2">
                  <Card contentClass="p-2">
                    <Link ghost href="/magic/about" class="flex flex-row items-center h-auto! space-x-2 pl-2 pr-3 py-1">
                      <LogoAnimate width={56} height={56} />
                      <div class="flex flex-col">
                        <h2 class="text-xl font-bold flex flex-row">
                          <span class="text-primary">R</span>
                          <span class="opacity-80">et</span>
                          <span class="opacity-60">&nbsp;2&nbsp;</span>
                          <span class="text-error">S</span>
                          <span class="opacity-80">hell</span>
                          <span class="opacity-60">&nbsp;v{platformStore.version?.[0] || "3"}</span>
                        </h2>
                        <p class="opacity-60 space-x-2 flex">
                          <Show
                            when={(platformStore.version || "UNKNOWN").includes("*")}
                            fallback={<span class="text-primary">REL</span>}
                          >
                            <span class="text-warning">DEV</span>
                          </Show>
                          <span class="flex-1 truncate">{(platformStore.version || "UNKNOWN").replace("*", "")}</span>
                        </p>
                      </div>
                    </Link>
                  </Card>
                  <Card contentClass="flex flex-row p-2 space-x-2">
                    <a
                      href="mailto:ctf@cumt.edu.cn"
                      class="flex-1 btn btn-sm btn-ghost justify-start"
                      title={t("about.contact")}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span class="shrink-0 icon-[fluent--mail-20-regular] w-5 h-5" />
                      <span class="font-normal opacity-60">ctf@cumt.edu.cn</span>
                    </a>
                    {/* <Link
                      href="https://qm.qq.com/q/3Mf4STMTtS"
                      ghost
                      size="sm"
                      square
                      title={"QQ Group: 1104642385"}
                      target="_blank"
                    >
                      <span class="inline-block w-5 h-5">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                          <rect width="24" height="24" fill="none" />
                          <path
                            fill="currentColor"
                            fill-rule="evenodd"
                            d="M12.01 22.597c-.737.076-2.183.15-3.5.153a20 20 0 0 1-1.893-.07a5 5 0 0 1-.728-.12a1.7 1.7 0 0 1-.34-.123a1 1 0 0 1-.41-.37a1.1 1.1 0 0 1-.152-.684c.026-.235.123-.426.226-.569c.192-.268.476-.462.707-.597q.154-.088.319-.167a6.5 6.5 0 0 1-1.051-1.818a6 6 0 0 1-.379.431a2.4 2.4 0 0 1-.373.317c-.108.071-.369.229-.702.188a.87.87 0 0 1-.611-.39a1.3 1.3 0 0 1-.171-.39a3.3 3.3 0 0 1-.091-.908c.013-.72.174-1.76.613-3.173c.34-1.092.719-2.032 1.229-3.296l.007-.017l.296-.734c-.039-2.318.42-4.526 1.529-6.19c1.156-1.734 2.98-2.815 5.466-2.82h.018c2.486.005 4.31 1.086 5.466 2.82c1.108 1.664 1.568 3.872 1.53 6.19q.154.387.295.734l.007.018c.51 1.263.89 2.203 1.229 3.295c.439 1.412.6 2.452.613 3.173c.007.356-.023.663-.09.908c-.034.12-.085.26-.172.39a.87.87 0 0 1-.611.39c-.333.04-.594-.117-.702-.188a2.4 2.4 0 0 1-.373-.317a6 6 0 0 1-.379-.431a6.5 6.5 0 0 1-1.05 1.818q.163.078.317.167c.232.135.515.33.708.598c.103.142.2.333.226.567c.027.246-.032.481-.152.685a1 1 0 0 1-.41.37a1.7 1.7 0 0 1-.34.124a5 5 0 0 1-.728.119c-.531.052-1.206.071-1.893.07c-1.317-.002-2.763-.077-3.5-.153m-5.502-12.22c-.057-2.19.372-4.118 1.275-5.475c.877-1.316 2.235-2.15 4.227-2.152c1.992.003 3.35.836 4.227 2.152c.903 1.357 1.332 3.285 1.275 5.476a.8.8 0 0 0 .053.298l.354.88c.518 1.281.875 2.168 1.194 3.196c.256.822.401 1.48.477 1.987c-.274-.389-.49-.733-.51-.765a.75.75 0 0 0-.738-.347h-.002a.75.75 0 0 0-.647.742c-.002.996-.531 2.384-1.727 3.398a.75.75 0 0 0-.068 1.08v.001a.76.76 0 0 0 .332.21c.141.043.311.1.486.167c-.36.018-.77.026-1.204.025c-1.325-.002-2.86-.087-3.502-.157c-.643.07-2.177.155-3.502.157a25 25 0 0 1-1.205-.025a8 8 0 0 1 .487-.167a.75.75 0 0 0 .331-.21h.001a.75.75 0 0 0 .186-.636v-.001a.75.75 0 0 0-.254-.444c-1.196-1.014-1.725-2.402-1.727-3.398a.75.75 0 0 0-.647-.742h-.002a.75.75 0 0 0-.739.347c-.02.032-.235.376-.509.765a13.5 13.5 0 0 1 .477-1.987c.319-1.028.676-1.914 1.194-3.196l.354-.88a.8.8 0 0 0 .053-.298"
                            clip-rule="evenodd"
                          />
                        </svg>
                      </span>
                    </Link> */}
                    <a
                      href="mailto:support@ret.sh.cn"
                      class="btn btn-sm btn-ghost justify-center btn-square"
                      title={t("about.support")}
                      target="_blank"
                      rel="noopener"
                    >
                      <span class="shrink-0 icon-[fluent--person-support-20-regular] w-5 h-5" />
                    </a>
                    <Link
                      href="https://github.com/Reverier-Xu"
                      ghost
                      size="sm"
                      square
                      title={t("about.donate")}
                      target="_blank"
                    >
                      <span class="shrink-0 icon-[fluent--flash-sparkle-20-regular] w-5 h-5" />
                    </Link>
                    <Link
                      href="https://github.com/ret2shell"
                      ghost
                      size="sm"
                      square
                      title={t("about.source")}
                      target="_blank"
                    >
                      <span class="shrink-0 icon-[fluent--open-20-regular] w-5 h-5" />
                    </Link>
                  </Card>
                </div>
              </Popover>
            </Show>
          </div>
        </section>
      </div>
    </div>
  );
}
