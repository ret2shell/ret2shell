import { Progress, type ProgressRootProps } from "@ark-ui/solid";
import clsx from "clsx";

import { createMemo } from "solid-js";

export type ProgressProps = {
  static?: boolean;
};

export default function (props: ProgressRootProps & ProgressProps) {
  const value = createMemo(() => {
    if (props.value && props.min && props.value < props.min) {
      return props.min;
    }
    if (props.value && props.max && props.value > props.max) {
      return props.max;
    }
    return props.value;
  });
  const p = createMemo(() => ((props.value || 0) / ((props.max || 1) - (props.min || 0))) * 100);
  return (
    <Progress.Root {...props} value={value()}>
      <Progress.Track class="progress-track">
        <Progress.Range
          class={clsx("progress-range", {
            "progress-range-success": !props.static && p() > 60,
            "progress-range-warning": !props.static && p() > 30 && p() <= 60,
            "progress-range-error": !props.static && p() <= 30,
            "progress-range-primary": props.static,
          })}
        />
      </Progress.Track>
    </Progress.Root>
  );
}
