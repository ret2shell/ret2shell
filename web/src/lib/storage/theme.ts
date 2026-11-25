import { fetchDictionary, hasLocale, type Locale } from "@lib/i18n";
import { resolveTemplate, translator } from "@solid-primitives/i18n";
import { createPrefersDark } from "@solid-primitives/media";
import { makePersisted } from "@solid-primitives/storage";
import { createRoot, createStore, createTrackedEffect, untrack } from "solid-js";

let systemPrefersLocale = (window.navigator.language || window.navigator.languages[0])
  .replace("-", "_")
  .toLowerCase() as Locale;

if (!hasLocale(systemPrefersLocale)) {
  systemPrefersLocale = "zh_cn" as Locale;
}

type ThemeStoreShape = {
  theme: string;
  locale: Locale;
  colorScheme: "dark" | "light";
  colorSchemeFollowsSystem: boolean;
  showBackgroundImg: boolean;
};

const themeRoot = createRoot(() => {
  const prefersDark = createPrefersDark();
  const [themeStore, setThemeStore] = makePersisted(
    createStore<ThemeStoreShape>({
      theme: "cyber",
      locale: systemPrefersLocale,
      colorScheme: "dark",
      colorSchemeFollowsSystem: true,
      showBackgroundImg: true,
    }),
    { name: "theme" }
  );
  return { prefersDark, themeStore, setThemeStore };
});

export const themeStore = themeRoot.themeStore;
export const setThemeStore = themeRoot.setThemeStore;

const prefersDark = themeRoot.prefersDark;

// The dictionary is loaded before the app renders, so `t()` stays synchronous.
// Switching locale reloads the page, so it never needs to change at runtime.
const dict = await fetchDictionary(themeStore.locale || systemPrefersLocale);

export function setTheme(theme: string) {
  setThemeStore((s) => {
    s.theme = theme;
  });
}

export function setColorScheme(colorScheme: "dark" | "light") {
  setThemeStore((s) => {
    s.colorScheme = colorScheme;
  });
}

export function setLocale(locale: Locale) {
  setThemeStore((s) => {
    s.locale = locale;
  });
  setTimeout(() => location.reload());
}

export function toggleBackgroundImg() {
  setThemeStore((s) => {
    s.showBackgroundImg = !s.showBackgroundImg;
  });
}

export function fullTheme() {
  return `${themeStore.theme}-${themeStore.colorScheme}`;
}

export function initTheme() {
  createTrackedEffect(() => {
    document.documentElement.setAttribute("data-theme", fullTheme());
    document.documentElement.setAttribute("data-style", themeStore.colorScheme);
  });
  createTrackedEffect(() => {
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
export const t = translator(() => dict, resolveTemplate) as (
  key: string,
  vars?: Record<string, string | number>
) => string;
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

export const breakpoints = {
  "2xl": "1536px",
  xl: "1280px",
  lg: "1024px",
  md: "768px",
  sm: "640px",
  xs: "480px",
  "2xs": "320px",
} as const;
