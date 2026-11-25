import { Progress } from "@ark-ui/solid";
import type { ComponentProps } from "@solidjs/web";
import clsx from "clsx";
import { DateTime } from "luxon";
import { createSignal, createTrackedEffect, omit, onCleanup, untrack } from "solid-js";
import type { ProgressProps } from "./progress";

export default function TimeProgress(
  props: {
    startAt: DateTime;
    endAt: DateTime;
    onTimeout?: () => void;
  } & ProgressProps &
    ComponentProps<"div">
) {
  const nativeProps = omit(props, "startAt", "endAt", "static");
  const [timeouted, setTimeouted] = createSignal(false);
  const [now, setNow] = createSignal(DateTime.now());
  const interval = setInterval(() => {
    setNow(DateTime.now());
  }, 1000);
  const progress = () => {
    if (props.startAt.diff(props.endAt).milliseconds >= 0) {
      return 0;
    }
    const result = (props.startAt.diff(now()).milliseconds / props.startAt.diff(props.endAt).milliseconds) * 100;
    if (result > 100) {
      return 100;
    }
    if (result < 0) {
      return 0;
    }
    return result;
  };
  const cleanup = () => clearInterval(interval);
  onCleanup(cleanup);
  createTrackedEffect(() => {
    if (now() > props.endAt && !timeouted()) {
      untrack(() => {
        setTimeouted(true);
        props.onTimeout?.();
      });
    }
  });
  createTrackedEffect(() => {
    if (props.endAt > DateTime.now()) {
      untrack(() => {
        setTimeouted(false);
      });
    }
  });
  return (
    <Progress.Root {...nativeProps} min={0} max={100} value={progress()}>
      <Progress.Track class="progress-track">
        <Progress.Range
          class={clsx("progress-range", {
            "progress-range-success": !props.static && progress() > 60,
            "progress-range-warning": !props.static && progress() > 30 && progress() <= 60,
            "progress-range-error": !props.static && progress() <= 30,
            "progress-range-primary": props.static,
          })}
        />
      </Progress.Track>
    </Progress.Root>
  );
}
