import { type ComponentProps, Show, onMount, splitProps } from "solid-js";
import { t } from "../storage/theme";
import { type ToastMessage, removeToast } from "../storage/toast";
import Button from "./button";
import Card from "./card";

export type ToastProps = {
    toast: ToastMessage;
    selfDestroy?: boolean;
    onTimeout?: () => void;
};

export default function (props: ComponentProps<"div"> & ToastProps) {
    const [toastMsgProps, otherProps] = splitProps(props, ["toast"]);
    let progressRef: HTMLDivElement;
    onMount(() => {
        if (props.selfDestroy && toastMsgProps.toast.duration && toastMsgProps.toast.duration > 0) {
            setTimeout(() => {
                progressRef.classList.remove("w-full");
                progressRef.style.transitionDuration = `${toastMsgProps.toast.duration}ms`;
                progressRef.classList.add("w-0");
            }, 100);
            if (!toastMsgProps.toast.duration) return;
            setTimeout(() => {
                props.onTimeout?.();
            }, toastMsgProps.toast.duration + 100);
        }
    });

    function getLevelIcon(level: typeof toastMsgProps.toast.level) {
        switch (level) {
            case "info":
                return "icon-[fluent--info-20-regular]";
            case "success":
                return "icon-[fluent--checkmark-circle-20-regular]";
            case "warning":
                return "icon-[fluent--warning-20-regular]";
            case "error":
                return "icon-[fluent--dismiss-circle-20-regular]";
            default:
                return "icon-[fluent--info-20-regular]";
        }
    }

    return (
        <Card {...otherProps} class={`toast ${otherProps.class}`} contentClass="p-2 group relative">
            <div class="flex flex-col space-y-2">
                <Show when={toastMsgProps.toast.img}>
                    <div class="flex flex-row items-center justify-center p-6">
                        <img src={toastMsgProps.toast.img} class="w-24 h-24" alt="Toast Broken" />
                    </div>
                </Show>
                {/* text-info text-success text-warning text-error */}
                <span class="inline-block space-x-2 px-2 py-1">
                    <span
                        class={`align-middle ${getLevelIcon(toastMsgProps.toast.level)} w-5 h-5 text-${
                            toastMsgProps.toast.level
                        }`}
                    />
                    <span class="text-wrap align-middle">{toastMsgProps.toast.description}</span>
                </span>
                <Show when={toastMsgProps.toast.reject || toastMsgProps.toast.accept}>
                    <div class="flex flex-row items-center justify-end space-x-2">
                        <Show when={toastMsgProps.toast.reject}>
                            <Button size="sm" ghost onClick={toastMsgProps.toast.reject}>
                                {toastMsgProps.toast.rejectLabel || t("platform.reject")}
                            </Button>
                        </Show>
                        <Show when={toastMsgProps.toast.accept}>
                            <Button size="sm" level="primary" onClick={toastMsgProps.toast.accept}>
                                {toastMsgProps.toast.acceptLabel || t("platform.accept")}
                            </Button>
                        </Show>
                    </div>
                </Show>
            </div>
            <Button
                class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                size="sm"
                square
                onClick={() => toastMsgProps.toast.id && removeToast(toastMsgProps.toast.id)}
            >
                <span class="icon-[fluent--dismiss-20-regular] w-5 h-5" />
            </Button>
            <Show when={props.selfDestroy && toastMsgProps.toast.duration}>
                {/* bg-info bg-success bg-warning bg-error */}
                <div class="absolute bottom-1 left-4 h-[2px] right-4">
                    <div
                        ref={progressRef!}
                        class={`w-full h-full bg-${toastMsgProps.toast.level} transition-all ease-linear`}
                    />
                </div>
            </Show>
        </Card>
    );
}
