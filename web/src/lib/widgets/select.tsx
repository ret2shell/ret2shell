import { type CollectionItem, Select, type SelectRootProps, createListCollection } from "@ark-ui/solid";
import { createBreakpoints } from "@solid-primitives/media";
import { breakpoints, fullTheme } from "@storage/theme";
import clsx from "clsx";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { type ComponentProps, Index, Show, createMemo, splitProps } from "solid-js";
import { Portal } from "solid-js/web";

export type SelectProps = {
  label?: string;
  placeholder?: string;
  inputProps?: ComponentProps<"select">;
  size?: "sm" | "md";
  ghost?: boolean;
  error?: string;
  items: SelectItemType[];
};

export interface SelectItemType extends CollectionItem {
  label: string;
  icon?: string;
  value: string;
  disabled?: boolean;
}

export default function (
  props: Pick<SelectRootProps<SelectItemType>, Exclude<keyof SelectRootProps<SelectItemType>, "collection">> &
    SelectProps
) {
  const [selectProps, others] = splitProps(props, [
    "label",
    "placeholder",
    "size",
    "ghost",
    "error",
    "inputProps",
    "items",
  ]);

  const collection = createMemo(() =>
    createListCollection({
      items: selectProps.items,
    })
  );

  let selectEl: HTMLSelectElement;
  const matches = createBreakpoints(breakpoints);

  // const [, setSelectedItems] = createSignal<SelectItemType[]>([]);

  return (
    <Select.Root
      {...others}
      class={clsx("flex flex-col", others.class)}
      immediate
      collection={collection()}
      // value={[selectProps.inputProps?.value?.toString() || ""]}
      positioning={{
        sameWidth: true,
      }}
      onValueChange={(e) => {
        selectEl!.value = e.value[0] || "";
        if (selectProps.inputProps?.onInput && typeof selectProps.inputProps.onInput === "function")
          selectEl!.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
        // if (selectProps.inputProps?.onChange && typeof selectProps.inputProps.onChange === "function")
        //   selectProps.inputProps.onChange(e);
        others.onValueChange?.(e);
      }}
    >
      <Show when={selectProps.label}>
        <Select.Label class="label mb-1">{selectProps.label}</Select.Label>
      </Show>
      <Select.Control class="w-full">
        <Select.Trigger
          class={clsx(
            "btn",
            "flex",
            "flex-row",
            "gap-0",
            "items-center",
            "w-full",
            selectProps.size === "sm" ? "btn-sm" : matches.lg ? "btn-md" : "btn-sm",
            selectProps.ghost && "btn-ghost",
            selectProps.error && "border-error",
            selectProps.size === "sm" ? "px-1" : "px-2"
          )}
        >
          <Show
            when={props.error}
            fallback={
              <Select.ValueText
                class={clsx(
                  selectProps.size === "sm" ? "px-1" : "px-2",
                  "text-start",
                  "truncate",
                  !props.error && "flex-1"
                )}
                placeholder={selectProps.placeholder}
              />
            }
          >
            <span class="text-error flex-1 px-4 text-start">{props.error}</span>
          </Show>
          <Select.Indicator
            class={clsx(
              "btn btn-square btn-ghost items-center justify-center",
              selectProps.size === "sm" ? "btn-xs" : "btn-sm"
            )}
          >
            <span class="icon-[fluent--chevron-double-down-20-regular] w-5 h-5" />
          </Select.Indicator>
          <Select.ClearTrigger
            class={clsx(
              "btn btn-square btn-ghost items-center justify-center",
              selectProps.size === "sm" ? "btn-xs" : "btn-sm"
            )}
          >
            <span class="icon-[fluent--dismiss-circle-20-regular] w-5 h-5" />
          </Select.ClearTrigger>
        </Select.Trigger>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content class="card w-full popover">
            <OverlayScrollbarsComponent
              options={{
                scrollbars: {
                  theme: `os-theme-${fullTheme()}`,
                  autoHide: "scroll",
                },
              }}
              class="relative w-full print:h-auto print:overflow-auto max-h-80"
              defer
            >
              <Select.ItemGroup class="card-content p-2">
                <div class="flex flex-col space-y-2">
                  <Index each={selectProps.items}>
                    {(item) => (
                      <Select.Item
                        item={item().value}
                        class="btn btn-ghost btn-sm items-center overflow-hidden"
                        title={item().label}
                      >
                        <Select.ItemText class="flex-1 text-start data-[state=checked]:text-primary flex flex-row space-x-2 items-center overflow-hidden">
                          <Show when={item().icon}>
                            <span class={clsx(item().icon, "shrink-0")} />
                          </Show>
                          <span class="truncate">{item().label}</span>
                        </Select.ItemText>
                        <Select.ItemIndicator class="flex items-center">
                          <span class="icon-[fluent--checkmark-20-regular] w-5 h-5 text-success shrink-0" />
                        </Select.ItemIndicator>
                      </Select.Item>
                    )}
                  </Index>
                </div>
              </Select.ItemGroup>
            </OverlayScrollbarsComponent>
          </Select.Content>
        </Select.Positioner>
      </Portal>
      <Select.HiddenSelect {...selectProps.inputProps} ref={selectEl!} />
    </Select.Root>
  );
}
