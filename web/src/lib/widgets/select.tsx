import { type CollectionItem, createListCollection, Select, type SelectRootProps } from "@ark-ui/solid";
import { fullTheme, t } from "@storage/theme";
import clsx from "clsx";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import {
  type ComponentProps,
  createEffect,
  createMemo,
  createSignal,
  Index,
  Show,
  splitProps,
  untrack,
} from "solid-js";
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
  let selectEl!: HTMLSelectElement;
  let forwardingInputEvent = false;

  const [proxiedValue, setProxiedValue] = createSignal<string[] | undefined>(others.value);

  createEffect(() => {
    if (others.value) {
      untrack(() => {
        requestAnimationFrame(() => {
          if (others?.value !== undefined) {
            setProxiedValue(others.value);
          }
        });
      });
    } else {
      setProxiedValue(undefined);
    }
  });

  return (
    <Select.Root
      {...others}
      disabled={props.disabled}
      class={clsx("flex flex-col", others.class)}
      // immediate
      collection={collection()}
      // value={JSON.parse(JSON.stringify([selectProps.inputProps?.value?.toString()]))}
      positioning={{
        sameWidth: true,
      }}
      value={proxiedValue()}
      onValueChange={(e) => {
        if (selectEl) {
          const nextValue = e.value[0] || "";
          const prevValue = selectEl.value;
          selectEl.value = nextValue;

          if (!forwardingInputEvent && prevValue !== nextValue) {
            forwardingInputEvent = true;
            queueMicrotask(() => {
              try {
                selectEl.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
              } finally {
                forwardingInputEvent = false;
              }
            });
          }
        }
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
            selectProps.size === "sm" ? "btn-sm" : "btn-md",
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
            title={t("general.actions.select.title")}
          >
            <span class="shrink-0 icon-[fluent--chevron-double-down-20-regular] w-5 h-5" />
          </Select.Indicator>
          <Select.ClearTrigger
            class={clsx(
              "btn btn-square btn-ghost items-center justify-center",
              selectProps.size === "sm" ? "btn-xs" : "btn-sm"
            )}
            title={t("general.actions.clear.title")}
          >
            <span class="shrink-0 icon-[fluent--dismiss-circle-20-regular] w-5 h-5" />
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
                        item={item()}
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
                          <span class="shrink-0 icon-[fluent--checkmark-20-regular] w-5 h-5 text-success" />
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
      <Select.HiddenSelect {...props.inputProps} ref={selectEl} />
    </Select.Root>
  );
}
