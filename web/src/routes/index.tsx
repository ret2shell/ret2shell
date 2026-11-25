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
import { createTrackedEffect, onSettled, Show } from "solid-js";
// import Calendar from "./calendar";

export default function () {
  const platformInfo = usePlatformInfo();
  const [searchParams] = useSearchParams();
  let calendarSection: HTMLElement;
  const navigate = useNavigate();
  onSettled(() => {
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

  createTrackedEffect(() => {
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
                      href="mailto:support@ret.sh.cn"
                      class="flex-1 btn btn-sm btn-ghost justify-start"
                      title={t("about.contact")}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span class="shrink-0 icon-[fluent--mail-20-regular] w-5 h-5" />
                      <span class="font-normal opacity-60">support@ret.sh.cn</span>
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
                    <Link href="https://ret.sh.cn/" ghost size="sm" square title={t("about.source")} target="_blank">
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
