import { Checkbox, type CheckboxRootProps, Popover } from "@ark-ui/solid";
import clsx from "clsx";
import { type JSX, splitProps } from "solid-js";
import { Portal } from "solid-js/web";

export type CheckboxProps = {
  ghost?: boolean;
  error?: string;
  uncheckedIcon?: string;
  checkedIcon?: string;
  inputProps?: JSX.IntrinsicElements["input"];
};

export default function (
  props: CheckboxProps &
    CheckboxRootProps & {
      children?: JSX.Element;
    }
) {
  const [checkboxProps, rest] = splitProps(props, ["ghost", "error", "inputProps", "uncheckedIcon", "checkedIcon"]);

  return (
    <Popover.Root autoFocus={false} open={!!checkboxProps.error} closeOnInteractOutside={false}>
      <Popover.Anchor class="flex flex-col">
        <Checkbox.Root
          {...rest}
          class={clsx(
            "btn",
            "btn-md",
            "items-center",
            "justify-center",
            "btn-square",
            checkboxProps.ghost && "btn-ghost",
            rest.disabled && "btn-disabled",
            rest.class,
            rest.classList
          )}
        >
          <Checkbox.Control class="w-5 h-5 relative">
            <span class={clsx(checkboxProps.uncheckedIcon, "!w-5 !h-5 absolute top-0 left-0")} />
            <Checkbox.Indicator class={clsx(checkboxProps.checkedIcon, "text-primary", "!w-5", "!h-5")} />
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
