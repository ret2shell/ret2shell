import { type ComponentProps, type JSX, Show, createSignal, splitProps } from "solid-js";

import { Popover } from "@ark-ui/solid";
import { Portal } from "solid-js/web";
import clsx from "clsx";

export type TextInputProps = {
  icon?: JSX.Element;
  extraBtn?: JSX.Element;
  size?: "sm" | "md";
  error?: string;
  noLabel?: boolean;
  extraLabel?: JSX.Element;
};

export default function (props: TextInputProps & ComponentProps<"input">) {
  const size = props.size || "md";
  const [inputProps, others] = splitProps(props, ["icon", "extraBtn", "size", "error", "noLabel", "extraLabel"]);

  const [type, setType] = createSignal(props.type);
  return (
    <Popover.Root autoFocus={false} open={!!props.error} closeOnInteractOutside={false}>
      <Popover.Anchor class={clsx("flex flex-col relative space-y-1", props.class, props.classList)}>
        <Show when={!inputProps.noLabel && (props.title || props.name)}>
          <label class="label" for={props.name}>
            <span class="flex-1 text-start">{props.title || props.name}</span>
            {inputProps.extraLabel}
          </label>
        </Show>
        <div class="flex flex-row">
          <Show when={props.icon}>
            {/* rounded-l-lg rounded-l-md */}
            <div
              class={clsx(
                size === "md" ? "rounded-l-lg" : "rounded-l-md",
                "flex shrink-0 flex-row items-center justify-center",
                size === "md" ? "h-12 w-12" : "h-8 w-8",
                "bg-layer-content/10"
              )}
            >
              {props.icon}
            </div>
          </Show>
          <input
            id={props.name}
            {...others}
            value={others.value || ""}
            class={clsx(
              // input-sm input-md
              `input w-0 flex-1 input-${size}`,
              inputProps.icon && "!rounded-l-none",
              (others.type === "password" || inputProps.extraBtn) && "!rounded-r-none",
              inputProps.error && "input-error"
            )}
            type={type()}
          />
          <Show when={props.type === "password"}>
            {/* btn-sm btn-md */}
            <button
              class={clsx("btn", "!rounded-l-none", `btn-${size}`, "justify-center", props.extraBtn && "!rounded-none")}
              onClick={() => setType(type() === "password" ? "text" : "password")}
              type="button"
            >
              {/* icon-[fluent--eye-20-regular] icon-[fluent--eye-off-20-regular] */}
              <span class={clsx(`icon-[fluent--${type() === "password" ? "eye" : "eye-off"}-20-regular]`, "w-5 h-5")} />
            </button>
          </Show>
          <Show when={props.extraBtn}>{props.extraBtn}</Show>
        </div>
      </Popover.Anchor>
      <Portal>
        <Popover.Positioner>
          <Popover.Content class={clsx("card", props.error && "card-error")}>
            <p class="card-content px-4 p-2">{props.error}</p>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
