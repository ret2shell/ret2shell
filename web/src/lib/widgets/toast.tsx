import type { ComponentProps } from "@solidjs/web";
import { t } from "@storage/theme";
import { removeToast, type ToastMessage } from "@storage/toast";
import clsx from "clsx";
import { omit, onSettled, Show } from "solid-js";
import Button from "./button";
import Card from "./card";

export type ToastProps = {
  toast: ToastMessage;
  selfDestroy?: boolean;
  onTimeout?: () => void;
};

export default function (props: ComponentProps<"div"> & ToastProps) {
  const otherProps = omit(props, "toast");
  let progressRef: HTMLDivElement;
  onSettled(() => {
    if (props.selfDestroy && props.toast.duration && props.toast.duration > 0) {
      setTimeout(() => {
        progressRef!.classList.remove("w-full");
        progressRef!.style.transitionDuration = `${props.toast.duration}ms`;
        progressRef!.classList.add("w-0");
      }, 100);
      if (!props.toast.duration) return;
      setTimeout(() => {
        props.onTimeout?.();
      }, props.toast.duration + 100);
    }
  });

  function getLevelIcon(level: typeof props.toast.level) {
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
    <Card {...otherProps} class={clsx("toast", otherProps.class)} contentClass="p-2 group relative">
      <div class="flex flex-col space-y-2">
        <Show when={props.toast.img}>
          <div class="flex flex-row items-center justify-center p-6">
            <img src={props.toast.img} class="w-24 h-24" alt="Toast Broken" />
          </div>
        </Show>
        {/* text-info text-success text-warning text-error */}
        <span class="inline-block space-x-2 px-2 py-1">
          <span class={clsx("align-middle", getLevelIcon(props.toast.level), "w-5 h-5", `text-${props.toast.level}`)} />
          <span class="text-wrap align-middle">{props.toast.description}</span>
        </span>
        <Show when={props.toast.reject || props.toast.accept}>
          <div class="flex flex-row items-center justify-end space-x-2">
            <Show when={props.toast.reject}>
              <Button size="sm" ghost onClick={props.toast.reject}>
                {props.toast.rejectLabel || t("general.actions.no.title")}
              </Button>
            </Show>
            <Show when={props.toast.accept}>
              <Button size="sm" level="primary" onClick={props.toast.accept}>
                {props.toast.acceptLabel || t("general.actions.ok.title")}
              </Button>
            </Show>
          </div>
        </Show>
      </div>
      <Button
        class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        size="sm"
        square
        onClick={() => props.toast.id && removeToast(props.toast.id)}
      >
        <span class="shrink-0 icon-[fluent--dismiss-20-regular] w-5 h-5" />
      </Button>
      <Show when={props.selfDestroy && props.toast.duration}>
        {/* bg-info bg-success bg-warning bg-error */}
        <div class="absolute bottom-1 left-4 h-0.5 right-4">
          <div
            ref={progressRef!}
            class={clsx("w-full h-full", `bg-${props.toast.level}`, "transition-all ease-linear")}
          />
        </div>
      </Show>
    </Card>
  );
}
