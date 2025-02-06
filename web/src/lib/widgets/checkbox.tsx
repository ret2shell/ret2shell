import { Checkbox, type CheckboxRootProps, Popover } from "@ark-ui/solid";
import clsx from "clsx";
import { type JSX, Show, splitProps } from "solid-js";
import { Portal } from "solid-js/web";

export type CheckboxProps = {
  ghost?: boolean;
  error?: string;
  inputProps?: JSX.IntrinsicElements["input"];
};

export default function (
  props: CheckboxProps &
    CheckboxRootProps & {
      children?: JSX.Element;
    }
) {
  const [checkboxProps, _1] = splitProps(props, ["ghost", "error", "inputProps"]);
  const [{ children }, rest] = splitProps(_1, ["children"]);

  return (
    <Popover.Root autoFocus={false} open={!!checkboxProps.error} closeOnInteractOutside={false}>
      <Popover.Anchor class={clsx("flex flex-col space-y-1 flex-1", rest.class)}>
        <Show when={props.title}>
          <label class="label" for={checkboxProps.inputProps?.id ?? "input_NOTPOSSIBLE"}>
            {props.title}
          </label>
        </Show>
        <Checkbox.Root
          {...rest}
          class={clsx(
            "btn",
            checkboxProps.ghost && "btn-ghost",
            rest.disabled && "btn-disabled",
            "data-[state=checked]:border-2 data-[state=checked]:border-primary",
            rest.class,
            rest.classList
          )}
        >
          <Checkbox.Label asChild={() => children} />
          <Checkbox.Control class="w-5 h-5 relative">
            <span class="icon-[fluent--checkmark-circle-20-regular] !w-5 !h-5 absolute top-0 left-0" />
            <Checkbox.Indicator class="icon-[fluent--checkmark-circle-20-filled] text-primary !w-5 !h-5" />
          </Checkbox.Control>
          <Checkbox.HiddenInput {...checkboxProps.inputProps} />
        </Checkbox.Root>
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
