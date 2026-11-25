import { Checkbox, type CheckboxRootProps, Popover } from "@ark-ui/solid";
import { type JSX, Portal } from "@solidjs/web";
import { t } from "@storage/theme";
import clsx from "clsx";
import { omit } from "solid-js";

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
  const rest = omit(props, "ghost", "error", "inputProps", "uncheckedIcon", "checkedIcon");

  return (
    <Popover.Root autoFocus={false} open={!!props.error} closeOnInteractOutside={false}>
      <Popover.Anchor class="flex flex-col">
        <Checkbox.Root
          {...rest}
          title={
            rest.title ??
            props.inputProps?.title ??
            props.inputProps?.["aria-label"] ??
            t("general.actions.select.title")
          }
          class={clsx(
            "btn",
            "btn-md",
            "items-center",
            "justify-center",
            "btn-square",
            props.ghost && "btn-ghost",
            rest.disabled && "btn-disabled",
            rest.class
          )}
        >
          <Checkbox.Control class="w-5 h-5 relative">
            <span class={clsx(props.uncheckedIcon, "w-5! h-5! absolute top-0 left-0")} />
            <Checkbox.Indicator class={clsx(props.checkedIcon, "text-primary", "w-5!", "h-5!")} />
          </Checkbox.Control>
          <Checkbox.HiddenInput {...props.inputProps} />
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
