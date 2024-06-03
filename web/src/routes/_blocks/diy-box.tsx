import DarkmodeButton from "@blocks/darkmode-button";
import { setLocale, setThemeStore, t, themeStore } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Popover from "@widgets/popover";
import { Show } from "solid-js";

export function DiyBoxContent() {
    return (
        <div class="flex flex-col space-y-2">
            <Card>
                <DarkmodeButton />
            </Card>
            <Card contentClass="p-2 flex flex-col space-y-2">
                <Button
                    size="sm"
                    ghost
                    class="flex-1"
                    onClick={() => {
                        setThemeStore({ colorSchemeFollowsSystem: !themeStore.colorSchemeFollowsSystem });
                    }}
                >
                    <span
                        class={`flex-1 text-start ${
                            themeStore.colorSchemeFollowsSystem ? "font-normal" : "font-normal opacity-60"
                        }`}
                    >
                        {t("platform.followSystem")}
                    </span>
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
            title={t("platform.diyBox")}
        >
            <DiyBoxContent />
        </Popover>
    );
}
