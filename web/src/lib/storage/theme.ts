import { type Locale, fetchDictionary, hasLocale } from "@lib/i18n";
import { DynamicRecord } from "@lib/utils/dynamic-record";
import { resolveTemplate, translator } from "@solid-primitives/i18n";
import { createPrefersDark } from "@solid-primitives/media";
import { makePersisted } from "@solid-primitives/storage";
import { gameStore } from "@storage/game";
import { createEffect, createResource, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { platformStore } from "./platform";

const prefersDark = createPrefersDark();

let systemPrefersLocale = (window.navigator.language || window.navigator.languages[0])
  .replace("-", "_")
  .toLowerCase() as Locale;

if (!hasLocale(systemPrefersLocale)) {
  systemPrefersLocale = "zh_cn" as Locale;
}

export const [themeStore, setThemeStore] = makePersisted(
  createStore({
    theme: "cyber",
    locale: systemPrefersLocale,
    colorScheme: "dark",
    colorSchemeFollowsSystem: true,
    showBackgroundImg: true,
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

export function toggleBackgroundImg() {
  setThemeStore("showBackgroundImg", !themeStore.showBackgroundImg);
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

const [dict] = createResource(themeStore.locale || systemPrefersLocale, fetchDictionary);
export const t = translator(dict, resolveTemplate);
export const colorPalette = {
  fg: () => (themeStore.colorScheme === "dark" ? "#eee" : "#121212"),
  primary: "#0991ed",
  secondary: "#bd63c5",
  accent: "#699f08",
  info: "#0991ed",
  success: "#17a750",
  warning: "#db640e",
  error: "#e05864",
};

const dynamicRecord = new DynamicRecord({
  "platform.name": () => platformStore.config.name || t("platform.name"),
  "gamestore.current.name": () => gameStore.current?.name,
});

export const j = dynamicRecord.dynamicJson();
export const E = dynamicRecord.createElement.bind(dynamicRecord);
