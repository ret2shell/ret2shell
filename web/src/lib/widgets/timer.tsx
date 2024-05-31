import { DateTime, Duration } from "luxon";
import { type ComponentProps, createSignal, onCleanup } from "solid-js";

export default function (props: ComponentProps<"span"> & { end: DateTime }) {
    const [duration, setDuration] = createSignal(props.end.diffNow());
    const interval = setInterval(() => {
        setDuration(props.end > DateTime.now() ? props.end.diffNow() : Duration.fromObject({ seconds: 0 }));
    }, 1000);
    const cleanup = () => clearInterval(interval);
    onCleanup(cleanup);
    return <span {...props}>{duration().toFormat("hh:mm:ss")}</span>;
}
