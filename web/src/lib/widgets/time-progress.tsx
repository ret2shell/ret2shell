import { Progress } from "@ark-ui/solid";
import { DateTime } from "luxon";
import { type ComponentProps, createEffect, createSignal, onCleanup, splitProps, untrack } from "solid-js";
import type { ProgressProps } from "./progress";
import clsx from "clsx";

export default function TimeProgress(
  props: {
    startAt: DateTime;
    endAt: DateTime;
    onTimeout?: () => void;
  } & ProgressProps &
    ComponentProps<"div">
) {
  const [progressProps, nativeProps] = splitProps(props, ["startAt", "endAt", "static"]);
  const [timeouted, setTimeouted] = createSignal(false);
  const [now, setNow] = createSignal(DateTime.now());
  const interval = setInterval(() => {
    setNow(DateTime.now());
  }, 1000);
  const progress = () => {
    if (progressProps.startAt.diff(progressProps.endAt).milliseconds >= 0) {
      return 0;
    }
    const result =
      (progressProps.startAt.diff(now()).milliseconds / progressProps.startAt.diff(progressProps.endAt).milliseconds) *
      100;
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
  createEffect(() => {
    if (now() > progressProps.endAt && !timeouted()) {
      untrack(() => {
        setTimeouted(true);
        props.onTimeout?.();
      });
    }
  });
  createEffect(() => {
    if (progressProps.endAt > DateTime.now()) {
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
