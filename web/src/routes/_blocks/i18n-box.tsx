import { platformStore, setPlatformStore } from "@storage/platform";
import { setLocale, t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Popover from "@widgets/popover";
import { Show } from "solid-js";

export function I18nBoxContent() {
  return (
    <div class="flex flex-col space-y-2 max-w-64">
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
                setPlatformStore((s) => {
                  s.enable_ret2codec = !s.enable_ret2codec;
                });
              }}
            >
              <Show
                when={platformStore.enable_ret2codec}
                fallback={<span class="shrink-0 icon-[fluent--emoji-20-regular] w-5 h-5" />}
              >
                <span class="shrink-0 icon-[fluent--emoji-meme-20-regular] w-5 h-5 text-success" />
              </Show>
            </Button>
          </li>
        </ul>
      </Card>
    </div>
  );
}

export default function I18nBox() {
  return (
    <Popover
      btnContent={<span class="shrink-0 icon-[fluent--local-language-20-regular] w-5 h-5" />}
      square
      ghost
      popContentClass="pt-2"
    >
      <I18nBoxContent />
    </Popover>
  );
}
