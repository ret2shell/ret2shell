import type { ComponentProps } from "@solidjs/web";
import { DateTime, Duration } from "luxon";
import { createSignal, createTrackedEffect, onCleanup, untrack } from "solid-js";

const ZERO = Duration.fromObject({ seconds: 0 });

export default function (
  props: ComponentProps<"span"> & { end: DateTime; hasHours?: boolean; onTimeout?: () => void }
) {
  // A timer can be mounted after its end (stale query data, a page restored
  // from the background, or a clock that is slightly ahead). Never render a
  // negative duration, and make sure `onTimeout` still fires so the caller can
  // refresh the stale value instead of getting stuck at 00:00.
  const [duration, setDuration] = createSignal(props.end > DateTime.now() ? props.end.diffNow() : ZERO);
  let interval: ReturnType<typeof setInterval> | undefined;
  // `onTimeout` must fire at most once for a given deadline. Without this guard
  // a parent that refetches the same overdue deadline would keep retriggering
  // the callback on every effect run.
  let firedFor: number | undefined;

  function clear() {
    if (interval !== undefined) {
      clearInterval(interval);
      interval = undefined;
    }
  }

  function expire(end: DateTime) {
    clear();
    setDuration(ZERO);
    const deadline = end.toMillis();
    if (firedFor !== deadline) {
      firedFor = deadline;
      props.onTimeout?.();
    }
  }

  function setup(end: DateTime) {
    clear();
    if (end <= DateTime.now()) {
      expire(end);
      return;
    }
    setDuration(end.diffNow());
    interval = setInterval(() => {
      if (end <= DateTime.now()) {
        expire(end);
      } else {
        setDuration(end.diffNow());
      }
    }, 1000);
  }

  createTrackedEffect(() => {
    const end = props.end;
    untrack(() => setup(end));
  });

  onCleanup(clear);

  const format = props.hasHours ? "hh:mm:ss" : "mm:ss";
  return <span {...props}>{duration().toFormat(format)}</span>;
}
