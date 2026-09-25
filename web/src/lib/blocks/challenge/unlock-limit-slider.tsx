import { t } from "@storage/theme";
import Slider from "@widgets/slider";
import { Show } from "solid-js";

/** Unlock-limit picker: how many of the `total` prerequisites must be
 * solved. Dragging to 0 selects "all of them". The header (label + current
 * value) and the footer (min/max hints) can be hidden when the surrounding
 * layout already provides that context, e.g. inside a dialog. */
export default function (props: {
  total: number;
  value: number;
  onChange: (value: number) => void;
  hideHeader?: boolean;
  hideFooter?: boolean;
}) {
  const max = () => Math.max(1, props.total);

  return (
    <div class="flex flex-col space-y-1 w-full">
      <Show when={!props.hideHeader}>
        <div class="flex flex-row items-center justify-between">
          <span class="text-sm opacity-60">{t("challenge.settings.unlockLimit.label")}</span>
          <span class="text-sm font-bold text-primary">
            {props.value === 0 ? t("challenge.settings.unlockLimit.all") : props.value}
          </span>
        </div>
      </Show>
      <Slider
        min={0}
        max={max()}
        step={1}
        value={[props.value]}
        hideHeader
        onValueChange={(details) => {
          const value = details.value[0];
          if (value !== undefined && value !== props.value) props.onChange(value);
        }}
      />
      <Show when={!props.hideFooter}>
        <div class="flex flex-row justify-between text-xs opacity-60">
          <span>{t("challenge.settings.unlockLimit.all")}</span>
          <span>{max()}</span>
        </div>
      </Show>
    </div>
  );
}
