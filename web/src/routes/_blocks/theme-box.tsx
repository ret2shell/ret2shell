import DarkmodeButton from "@blocks/darkmode-button";
import { platformStore, setPlatformStore } from "@storage/platform";
import { setLocale, setThemeStore, t, themeStore } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Popover from "@widgets/popover";
import { Show } from "solid-js";

export function ThemeBoxContent() {
  return (
    <div class="flex flex-col space-y-2 max-w-64">
      <Card contentClass="flex flex-col p-0 hover:p-2 hover:space-y-2 transition-all duration-300 group">
        <DarkmodeButton />
        <Button
          ghost
          size="sm"
          class="!min-h-0 !h-0 group-hover:!min-h-8 group-hover:!h-8 overflow-hidden border-none"
          onClick={() => {
            setThemeStore({ colorSchemeFollowsSystem: !themeStore.colorSchemeFollowsSystem });
          }}
        >
          <span class="flex-1 text-start">{t("platform.theme.followSystem")}</span>
          <Show
            when={themeStore.colorSchemeFollowsSystem}
            fallback={<span class="icon-[fluent--position-forward-20-regular] w-5 h-5 opacity-60" />}
          >
            <span class="icon-[fluent--position-forward-20-filled] w-5 h-5 text-primary" />
          </Show>
        </Button>
      </Card>
      <Card contentClass="p-2 flex flex-col space-y-2">
        <ul class="flex flex-row space-x-2">
          <li>
            <Button square onClick={() => setLocale("zh_cn")} ghost justify="center" size="sm">
              <span>简</span>
            </Button>
          </li>
          <li>
            <Button square onClick={() => setLocale("zh_tw")} ghost justify="center" size="sm">
              <span>繁</span>
            </Button>
          </li>
          <li>
            <Button square onClick={() => setLocale("en_us")} ghost justify="center" size="sm">
              <span>En</span>
            </Button>
          </li>
          <li>
            <Button square onClick={() => setLocale("ja_jp")} ghost justify="center" size="sm">
              <span>な</span>
            </Button>
          </li>
          <li>
            <Button
              size="sm"
              ghost
              square
              title={t("platform.ret2codec.title")}
              justify="center"
              onClick={() => {
                setPlatformStore({ enable_ret2codec: !platformStore.enable_ret2codec });
              }}
            >
              <Show
                when={platformStore.enable_ret2codec}
                fallback={<span class="icon-[fluent--emoji-20-regular] w-5 h-5" />}
              >
                <span class="icon-[fluent--emoji-meme-20-regular] w-5 h-5 text-success" />
              </Show>
            </Button>
          </li>
        </ul>
      </Card>
    </div>
  );
}

export default function DiyBox() {
  return (
    <Popover
      btnContent={<span class="icon-[fluent--wand-20-regular] w-5 h-5" />}
      square
      ghost
      popContentClass="pt-2"
      title={t("platform.theme.title")}
    >
      <ThemeBoxContent />
    </Popover>
  );
}
