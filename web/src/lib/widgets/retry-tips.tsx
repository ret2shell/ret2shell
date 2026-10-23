import { t } from "@storage/theme";
import Button from "@widgets/button";
import { Show } from "solid-js";

export default function (props: { title?: string; description?: string; loading?: boolean; onRetry: () => void }) {
  return (
    <div class="flex-1 flex flex-col items-center justify-center space-y-4 p-6 text-center">
      <span class="shrink-0 icon-[fluent--warning-24-filled] w-12 h-12 text-warning" />
      <Show when={props.title}>
        <h2 class="font-bold text-xl">{props.title}</h2>
      </Show>
      <Show when={props.description}>
        <p class="max-w-md opacity-60">{props.description}</p>
      </Show>
      <Button level="primary" loading={props.loading} onClick={() => props.onRetry()}>
        <Show when={!props.loading}>
          <span class="shrink-0 icon-[fluent--arrow-clockwise-20-regular] w-5 h-5" />
        </Show>
        <span>{t("general.actions.refresh.title")}</span>
      </Button>
    </div>
  );
}
