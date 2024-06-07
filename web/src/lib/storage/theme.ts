import { type Locale, fetchDictionary, hasLocale } from "@lib/i18n";
import { resolveTemplate, translator } from "@solid-primitives/i18n";
import { createPrefersDark } from "@solid-primitives/media";
import { makePersisted } from "@solid-primitives/storage";
import { createEffect, createResource, untrack } from "solid-js";
import { createStore } from "solid-js/store";

const prefersDark = createPrefersDark();

let systemPrefersLocale = (window.navigator.language || window.navigator.languages[0])
    .replace("-", "_")
    .toLowerCase() as Locale;

if (!hasLocale(systemPrefersLocale)) {
    systemPrefersLocale = "en_us" as Locale;
}

export const [themeStore, setThemeStore] = makePersisted(
    createStore({
        theme: "cyber",
        locale: systemPrefersLocale,
        colorScheme: "dark",
        colorSchemeFollowsSystem: false,
    }),
    { name: "theme" }
);

export function setTheme(theme: string) {
    setThemeStore({ theme });
}

export function setColorScheme(colorScheme: "dark" | "light") {
    setThemeStore({ colorScheme });
}

export function setLocale(locale: Locale) {
    setThemeStore({ locale });
    setTimeout(() => location.reload());
}

export function fullTheme() {
    return `${themeStore.theme}-${themeStore.colorScheme}`;
}

export function initTheme() {
    createEffect(() => {
        document.documentElement.setAttribute("data-theme", fullTheme());
        document.documentElement.setAttribute("data-style", themeStore.colorScheme);
    });
    createEffect(() => {
        if (themeStore.colorSchemeFollowsSystem)
            if (prefersDark()) untrack(() => setColorScheme("dark"));
            else untrack(() => setColorScheme("light"));
    });

    function onBeforePrint() {
        document.documentElement.setAttribute("data-theme", `${themeStore.theme}-light`);
        document.documentElement.setAttribute("data-style", "light");
    }
    function onAfterPrint() {
        document.documentElement.setAttribute("data-theme", fullTheme());
        document.documentElement.setAttribute("data-style", themeStore.colorScheme);
    }
    window.onbeforeprint = onBeforePrint;
    window.onafterprint = onAfterPrint;
}

const [dict] = createResource(themeStore.locale || "en_us", fetchDictionary);
export const t = translator(dict, resolveTemplate);
