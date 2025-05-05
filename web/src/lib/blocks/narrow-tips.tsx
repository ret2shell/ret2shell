import TooNarrow from "@assets/animates/too-narrow";
import { createBreakpoints } from "@solid-primitives/media";
import { breakpoints, t } from "@storage/theme";
import { Show } from "solid-js";

export default function (props: { breakpoint: keyof typeof breakpoints }) {
  const matches = createBreakpoints(breakpoints);
  return (
    <Show when={!matches[props.breakpoint]} fallback={null}>
      <div class="fixed w-screen h-screen left-0 top-0 backdrop-blur-sm z-10">
        <div class="w-full h-full flex flex-col space-y-4 items-center justify-center bg-layer/60">
          <TooNarrow class="w-full aspect-square" />
          <h1 class="text-center opacity-80 font-bold">{t("platform.errors.tooNarrow.title")}</h1>
          <p class="text-center opacity-60">{t("platform.errors.tooNarrow.message")}</p>
        </div>
      </div>
    </Show>
  );
}
