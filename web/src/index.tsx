/* @refresh reload */
import { render } from "@solidjs/web";
import { routes } from "./routes/routes";
import "overlayscrollbars/overlayscrollbars.css";
import "@widgets/styles/base.css";
import { inflyClient } from "@api";
import { createRouter } from "@solidjs/router";
import { fullTheme, initTheme, t } from "@storage/theme";
import { addToast } from "@storage/toast";
import { QueryClientProvider } from "@tanstack/solid-query";
import { OverlayScrollbarsComponent } from "@widgets/overlay-scrollbars";
import { Errored, onSettled } from "solid-js";

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
        description: t("platform.updated"),
        duration: 10000,
      });
    }, 1000);
  }
}

function BoundarySection(props: { error: Error; reset: () => void }) {
  return (
    <div class="relative w-screen h-screen gap-12 flex flex-col items-center justify-center bg-layer">
      <h1 class="text-3xl font-bold space-x-2">
        <span class="opacity-60">Oops x_x,</span>
        <span>
          <span class="text-primary">R</span>
          <span>et</span>
          <span>&nbsp;</span>
          <span class="opacity-60">2</span>
          <span>&nbsp;</span>
          <span class="text-error">S</span>
          <span>hell</span>
          <span>&nbsp;</span>
          <span>seems load failed.</span>
        </span>
      </h1>
      <p class="opacity-60 max-w-5xl text-wrap p-3 text-center">
        Sometimes this error will happen after an update of frontend, just refresh this page and everything will work
        normally.
      </p>
      <h2 class="text-2xl flex items-center gap-2">
        <span class="shrink-0 icon-[fluent-emoji-flat--globe-with-meridians] w-8 h-8" />
        <span class="shrink-0 icon-[fluent-emoji-flat--collision] w-8 h-8" />
        <span class="shrink-0 icon-[fluent-emoji-flat--right-arrow] w-8 h-8" />
        <span class="shrink-0 icon-[fluent-emoji-flat--knocked-out-face] w-8 h-8" />
        <span>,</span>
        <span class="shrink-0 icon-[fluent-emoji-flat--thinking-face] w-8 h-8" />
        <span class="shrink-0 icon-[fluent-emoji-flat--right-arrow] w-8 h-8" />
        <span class="shrink-0 icon-[fluent-emoji-flat--index-pointing-up] w-8 h-8" />
        <span class="shrink-0 icon-[fluent-emoji-flat--nerd-face] w-8 h-8" />
        <span>,</span>
        <span class="shrink-0 icon-[fluent-emoji-flat--man-bowing] w-8 h-8" />
        <span class="shrink-0 icon-[fluent-emoji-flat--backhand-index-pointing-right] w-8 h-8" />
        <button
          class="icon-[fluent-emoji-flat--repeat-button] w-8 h-8 transition-all hover:bg-layer-content/15 cursor-pointer"
          type="button"
          onClick={() => {
            props.reset();
            window.location.reload();
          }}
        />
        <span class="shrink-0 icon-[fluent-emoji-flat--backhand-index-pointing-left] w-8 h-8" />
      </h2>
      <p class="opacity-60 max-w-5xl w-full text-wrap p-8 rounded-md bg-layer-content/5">{props.error.toString()}</p>
    </div>
  );
}

// `<A>` is gone in router 2: links are plain anchors, intercepted by delegation.
const Router = createRouter({ routes });

render(() => {
  checkEdition();
  initTheme();
  postUpdated();
  onSettled(() => {
    setTimeout(() => {
      document.documentElement.classList.add("transition-colors", "duration-700");
      document.body.classList.add("transition-colors", "duration-700");
    }, 1000);
  });
  return (
    <Errored fallback={(error, reset) => <BoundarySection error={error()} reset={reset} />}>
      <QueryClientProvider client={inflyClient}>
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
          <Router>{(props) => <div class="flex flex-col min-h-full min-w-fit">{props.children}</div>}</Router>
        </OverlayScrollbarsComponent>
      </QueryClientProvider>
    </Errored>
  );
}, document.getElementById("root") || document.body);
