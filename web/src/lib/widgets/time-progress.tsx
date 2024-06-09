import { Progress } from "@ark-ui/solid";
import { DateTime } from "luxon";
import { type ComponentProps, createEffect, createSignal, onCleanup, splitProps, untrack } from "solid-js";
import type { ProgressProps } from "./progress";

export default function TimeProgress(
    props: { startAt: DateTime; endAt: DateTime; onTimeout?: () => void } & ProgressProps & ComponentProps<"div">
) {
    const [progressProps, nativeProps] = splitProps(props, ["startAt", "endAt", "static"]);
    const [timeouted, setTimeouted] = createSignal(false);
    const [now, setNow] = createSignal(DateTime.now());
    const interval = setInterval(() => {
        setNow(DateTime.now());
    }, 1000);
    const progress = () =>
        (progressProps.startAt.diff(now()).milliseconds /
            progressProps.startAt.diff(progressProps.endAt).milliseconds) *
        100;
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
                    class="progress-range"
                    classList={{
                        "progress-range-error": !progressProps.static && progress() > 80,
                        "progress-range-warning": !progressProps.static && progress() > 50 && progress() <= 80,
                        "progress-range-success": !progressProps.static && progress() <= 50,
                        "progress-range-primary": progressProps.static,
                    }}
                />
            </Progress.Track>
        </Progress.Root>
    );
}
