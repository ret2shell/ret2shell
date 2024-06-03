import { setColorScheme, t, themeStore } from "@storage/theme";
import "./darkmode-button.scss";
import { Show } from "solid-js";
import darkmodeStars from "./darkmode-stars.svg";

export default function () {
    let wrapper: HTMLButtonElement;

    return (
        <button
            ref={wrapper!}
            data-color-scheme={themeStore.colorScheme}
            class="darkmode-wrapper"
            onClick={() => {
                setColorScheme(themeStore.colorScheme === "dark" ? "light" : "dark");
            }}
            type="button"
            disabled={themeStore.colorSchemeFollowsSystem}
        >
            <img
                onContextMenu={() => {
                    return false;
                }}
                class="darkmode-stars"
                src={darkmodeStars}
                alt="Darkmode stars"
            />
            <span class="darkmode-button" />
            <Show when={themeStore.colorSchemeFollowsSystem}>
                <div class="absolute top-0 left-0 w-full h-full opacity-0 hover:opacity-100 transition-opacity bg-layer/60 flex items-center justify-center space-x-2">
                    <span class="icon-[fluent--tab-desktop-link-20-regular] w-5 h-5" />
                    <span>{t("platform.systemTheme")}</span>
                </div>
            </Show>
        </button>
    );
}
