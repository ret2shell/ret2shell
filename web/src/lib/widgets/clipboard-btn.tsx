import { Clipboard, type ClipboardRootProps } from "@ark-ui/solid";
import { t } from "@storage/theme";
import clsx from "clsx";
import { Show, splitProps } from "solid-js";

export default function ClipboardBtn(
  props: ClipboardRootProps & {
    size?: "sm" | "md";
    square?: boolean;
    icon?: string;
    iconCopied?: string;
    label?: string;
  }
) {
  const [btnProps, others] = splitProps(props, ["size", "square", "icon", "iconCopied", "label"]);
  return (
    <Clipboard.Root {...others}>
      <Clipboard.Control class="w-full flex flex-row space-x-2">
        <Clipboard.Input hidden class="hidden" />
        {/* btn-sm btn-md */}
        <Clipboard.Trigger
          class={clsx(
            "btn",
            btnProps.size && `btn-${btnProps.size}`,
            btnProps.square && "btn-square",
            "flex items-center space-x-2 justify-center",
            others.class
          )}
          title={others.title ?? t("general.actions.copy.title")}
        >
          <Clipboard.Indicator
            class="flex items-center justify-center m-0"
            copied={
              <span
                class={clsx("w-5 h-5 text-success", btnProps.iconCopied ?? "icon-[fluent--checkmark-20-regular]")}
              />
            }
          >
            <span class={clsx("w-5 h-5", btnProps.icon ?? "icon-[fluent--copy-20-regular]")} />
          </Clipboard.Indicator>
          <Show when={btnProps.label}>
            <span>{btnProps.label}</span>
          </Show>
        </Clipboard.Trigger>
      </Clipboard.Control>
    </Clipboard.Root>
  );
}
