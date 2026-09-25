import { t } from "@storage/theme";
import { createMemo } from "solid-js";

/** Unlock-limit picker: how many of the `total` prerequisites must be
 * solved. Dragging to 0 selects "all of them". */
export default function (props: { total: number; value: number; onChange: (value: number) => void }) {
  const max = () => Math.max(1, props.total);
  const display = () => (props.value === 0 ? t("challenge.settings.unlockLimit.all") : String(props.value));

  return (
    <div class="flex flex-col space-y-1 w-full">
      <div class="flex flex-row items-center justify-between">
        <span class="text-sm opacity-60">{t("challenge.settings.unlockLimit.label")}</span>
        <span class="text-sm font-bold text-primary">{display()}</span>
      </div>
      <input
        type="range"
        min="0"
        max={max()}
        step="1"
        value={Math.min(props.value, max())}
        class="w-full cursor-pointer accent-primary"
        onInput={(e) => props.onChange(Number(e.currentTarget.value))}
      />
      <div class="flex flex-row justify-between text-xs opacity-60">
        <span>{t("challenge.settings.unlockLimit.all")}</span>
        <span>{max()}</span>
      </div>
    </div>
  );
}
