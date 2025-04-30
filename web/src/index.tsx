/* @refresh reload */
import { render } from "solid-js/web";
import { routes } from "./routes/routes";
import "@fontsource/jetbrains-mono";
import "overlayscrollbars/overlayscrollbars.css";
import "@widgets/styles/base.css";
import { Router } from "@solidjs/router";
import { fullTheme, initTheme, t } from "@storage/theme";
import { addToast } from "@storage/toast";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { ErrorBoundary, onMount } from "solid-js";

function checkEdition() {
  const compact_edition: string = import.meta.env.VITE_COMPAT_EDITION as string;
  const edition = localStorage.getItem("edition");
  const needReload =
    edition !== compact_edition &&
    (localStorage.getItem("theme") !== null ||
      localStorage.getItem("account") !== null ||
      localStorage.getItem("platform") !== null);
  if (compact_edition && needReload) {
    localStorage.clear();
    localStorage.removeItem("theme");
    localStorage.setItem("edition", compact_edition);
    localStorage.setItem("updated", "true");
    location.reload();
  } else if (compact_edition) {
    localStorage.setItem("edition", compact_edition);
  }
}

function postUpdated() {
  const updated = localStorage.getItem("updated");
  if (updated === "true") {
    localStorage.removeItem("updated");
    setTimeout(() => {
      addToast({
        level: "warning",
        description: t("platform.updated")!,
        duration: 10000,
      });
    }, 1000);
  }
}

render(() => {
  checkEdition();
  initTheme();
  postUpdated();
  onMount(() => {
    setTimeout(() => {
      document.documentElement.classList.add("transition-colors", "duration-700");
      document.body.classList.add("transition-colors", "duration-700");
    }, 1000);
  });
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div class="relative w-screen h-screen gap-6 flex items-center justify-center bg-layer">
          <h1 class="text-2xl flex items-center gap-2">
            <span class="icon-[fluent-emoji-flat--globe-with-meridians] w-8 h-8" />
            <span class="icon-[fluent-emoji-flat--collision] w-8 h-8" />
            <span class="icon-[fluent-emoji-flat--right-arrow] w-8 h-8" />
            <span class="icon-[fluent-emoji-flat--crying-face] w-8 h-8" />
            <span class="icon-[fluent-emoji-flat--knocked-out-face] w-8 h-8" />
          </h1>
          <h1 class="text-2xl flex items-center gap-2">
            <span class="icon-[fluent-emoji-flat--thinking-face] w-8 h-8" />
            <span class="icon-[fluent-emoji-flat--right-arrow] w-8 h-8" />
            <span class="icon-[fluent-emoji-flat--index-pointing-up] w-8 h-8" />
            <span class="icon-[fluent-emoji-flat--nerd-face] w-8 h-8" />
          </h1>
          <h1 class="text-2xl flex items-center gap-2">
            <span class="icon-[fluent-emoji-flat--man-bowing] w-8 h-8" />
            <span class="icon-[fluent-emoji-flat--backhand-index-pointing-right] w-8 h-8" />
            <button
              class="icon-[fluent-emoji-flat--repeat-button] w-8 h-8 transition-all hover:bg-layer-content/15"
              type="button"
              onClick={reset}
            />
            <span class="icon-[fluent-emoji-flat--backhand-index-pointing-left] w-8 h-8" />
          </h1>
          <p>{error.message}</p>
        </div>
      )}
    >
      <OverlayScrollbarsComponent
        options={{
          scrollbars: {
            theme: `os-theme-${fullTheme()}`,
            autoHide: "scroll",
          },
        }}
        class="relative w-screen h-screen print:h-auto print:overflow-auto"
        defer
      >
        <div class="flex flex-col min-h-full min-w-fit">
          <Router explicitLinks>{routes}</Router>
        </div>
      </OverlayScrollbarsComponent>
    </ErrorBoundary>
  );
}, document.getElementById("root") || document.body);
