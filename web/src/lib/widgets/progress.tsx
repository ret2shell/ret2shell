import { Progress, type ProgressRootProps } from "@ark-ui/solid";

import { createMemo } from "solid-js";

export type ProgressProps = {
    static?: boolean;
};

export default function (props: ProgressRootProps & ProgressProps) {
    const p = createMemo(() => ((props.value || 0) / ((props.max || 1) - (props.min || 0))) * 100);
    return (
        <Progress.Root {...props}>
            <Progress.Track class="progress-track">
                <Progress.Range
                    class="progress-range"
                    classList={{
                        "progress-range-success": !props.static && p() > 60,
                        "progress-range-warning": !props.static && p() > 30 && p() <= 60,
                        "progress-range-error": !props.static && p() <= 30,
                        "progress-range-primary": props.static,
                    }}
                />
            </Progress.Track>
        </Progress.Root>
    );
}
