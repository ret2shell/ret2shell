import { Popover as ArkPopover } from "@ark-ui/solid";
import { MOJI_CATEGORIES } from "@lib/moji";
import { t } from "@storage/theme";
import clsx from "clsx";
import { createMemo, createSignal, For, Show } from "solid-js";

/**
 * Common emoji picker: a search field on top, category tabs at the bottom
 * and a scrollable square-icon grid in between.
 */
export default function MojiPicker(props: { onPick: (code: string) => void }) {
  const [query, setQuery] = createSignal("");
  const [category, setCategory] = createSignal(MOJI_CATEGORIES[0].id);

  const activeCategory = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (q.length > 0) {
      return {
        id: "search",
        icon: "",
        items: MOJI_CATEGORIES.flatMap((c) => c.items).filter((item) => item.code.includes(q)),
      };
    }
    return MOJI_CATEGORIES.find((c) => c.id === category()) ?? MOJI_CATEGORIES[0];
  });

  return (
    <div class="flex flex-col w-72" data-testid="moji-picker">
      <input
        class="input input-sm mb-2"
        type="text"
        placeholder={t("moji.search")}
        value={query()}
        onInput={(e) => setQuery(e.currentTarget.value)}
      />
      <div class="h-56 overflow-y-auto">
        <div class="grid grid-cols-8 gap-1 p-1">
          <For each={activeCategory().items}>
            {(item) => (
              <ArkPopover.CloseTrigger
                asChild={(childProps) => (
                  <button
                    {...childProps}
                    type="button"
                    class="flex items-center justify-center w-8 h-8 rounded-md hover:bg-layer-content/10 active:bg-layer-content/20 transition-colors"
                    title={`:${item.code}:`}
                    onClick={(e) => {
                      childProps.onClick?.(e);
                      props.onPick(item.code);
                    }}
                  >
                    <span class={clsx("w-6 h-6", item.icon)} />
                  </button>
                )}
              />
            )}
          </For>
          <Show when={activeCategory().items.length === 0}>
            <div class="col-span-8 py-8 text-center text-sm opacity-60">{t("moji.notFound")}</div>
          </Show>
        </div>
      </div>
      <div class="flex flex-row items-center justify-between gap-1 pt-2 mt-1 border-t border-t-layer-content/10">
        <For each={MOJI_CATEGORIES}>
          {(c) => (
            <button
              type="button"
              class={clsx(
                "flex items-center justify-center w-8 h-8 rounded-md hover:bg-layer-content/10 transition-colors",
                activeCategory().id === c.id && "bg-layer-content/10"
              )}
              title={t(`moji.categories.${c.id}`)}
              onClick={() => {
                setQuery("");
                setCategory(c.id);
              }}
            >
              <span class={clsx("w-5 h-5", c.icon)} />
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
