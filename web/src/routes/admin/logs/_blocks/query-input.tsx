import { getCompletions, highlight, parse, QUERY_PRESETS } from "@lib/logql";
import type { Diagnostic, Suggestion } from "@lib/logql/types";
import { t } from "@storage/theme";
import clsx from "clsx";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";

type Mode = { type: "presets" } | { type: "suggestions"; from: number; to: number; items: Suggestion[] };

const KIND_ICONS: Record<Suggestion["kind"], string> = {
  field: "icon-[fluent--tag-16-regular]",
  value: "icon-[fluent--text-case-title-16-regular]",
  keyword: "icon-[fluent--code-16-regular]",
  pipe: "icon-[fluent--pipeline-16-regular]",
  operator: "icon-[fluent--math-formula-16-regular]",
  prefix: "icon-[fluent--folder-open-16-regular]",
};

export default function LogQueryInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  class?: string;
}) {
  let inputRef!: HTMLInputElement;
  const [open, setOpen] = createSignal(false);
  const [selected, setSelected] = createSignal(-1);
  const [cursor, setCursor] = createSignal(0);
  const [scrollLeft, setScrollLeft] = createSignal(0);

  function syncCursor() {
    if (inputRef) setCursor(inputRef.selectionStart ?? props.value.length);
  }

  const diagnostics = createMemo<Diagnostic[]>(() => {
    const value = props.value;
    if (!value.trim()) return [];
    return parse(value).diagnostics;
  });

  // colored segments rendered behind the transparent-text input
  const segments = createMemo(() => highlight(props.value, diagnostics()));

  const mode = createMemo<Mode>(() => {
    const value = props.value;
    if (!value.trim()) return { type: "presets" };
    const pos = Math.min(cursor(), value.length);
    const result = getCompletions(value, pos);
    return { type: "suggestions", from: result.from, to: result.to, items: result.items };
  });

  const itemCount = createMemo(() => {
    const m = mode();
    return m.type === "presets" ? QUERY_PRESETS.length : m.items.length;
  });

  function refresh() {
    // recompute mode; close when there is nothing to show
    const m = mode();
    if (m.type === "suggestions" && m.items.length === 0) {
      setOpen(false);
      setSelected(-1);
      return;
    }
    setSelected(-1);
  }

  function accept(item: Suggestion) {
    const m = mode();
    if (m.type !== "suggestions") return;
    const value = props.value;
    const next = value.slice(0, m.from) + item.insert + value.slice(m.to);
    const cursor = m.from + item.insert.length - (item.cursorBack ?? 0);
    props.onChange(next);
    setCursor(cursor);
    requestAnimationFrame(() => {
      inputRef.focus();
      inputRef.setSelectionRange(cursor, cursor);
      // only chained completions (field:, keywords, …) keep the menu open
      setOpen(item.retrigger === true);
      refresh();
    });
  }

  function acceptPreset(query: string) {
    props.onChange(query);
    setOpen(false);
    const star = query.indexOf("*");
    setCursor(star >= 0 ? star : query.length);
    requestAnimationFrame(() => {
      inputRef.focus();
      if (star >= 0) {
        inputRef.setSelectionRange(star, star + 1);
      } else {
        inputRef.setSelectionRange(query.length, query.length);
      }
    });
  }

  function onKeyDown(e: KeyboardEvent) {
    // never steal keys while an IME composition (e.g. Chinese/Japanese
    // candidate selection) is in progress
    if (e.isComposing) return;
    if (!open() || itemCount() === 0) {
      if (e.key === "ArrowDown" && !props.disabled) {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        setSelected((s) => (s + 1) % itemCount());
        e.preventDefault();
        break;
      case "ArrowUp":
        setSelected((s) => (s <= 0 ? itemCount() - 1 : s - 1));
        e.preventDefault();
        break;
      case "Tab": {
        if (e.shiftKey) {
          // Shift+Tab moves focus backward; never insert a completion
          setOpen(false);
          setSelected(-1);
          return;
        }
        const idx = selected() >= 0 ? selected() : 0;
        pick(idx);
        e.preventDefault();
        break;
      }
      case "Enter":
        if (selected() >= 0) {
          pick(selected());
          e.preventDefault();
          e.stopPropagation();
        } else {
          setOpen(false);
        }
        break;
      case "Escape":
        setOpen(false);
        setSelected(-1);
        e.preventDefault();
        e.stopPropagation();
        break;
    }
  }

  function pick(idx: number) {
    const m = mode();
    if (m.type === "presets") {
      const preset = QUERY_PRESETS[idx];
      if (preset) acceptPreset(preset.query);
    } else {
      const item = m.items[idx];
      if (item) accept(item);
    }
  }

  const firstError = createMemo(() => diagnostics()[0]);

  // keep the keyboard-highlighted option visible inside the scrollable menu
  createEffect(() => {
    const idx = selected();
    if (idx >= 0 && open()) {
      document.getElementById(`logql-suggestion-${idx}`)?.scrollIntoView({ block: "nearest" });
    }
  });

  // the dropdown is portaled to <body> so its backdrop-blur escapes the
  // sticky header, which is a backdrop root and would swallow the blur
  let rootRef: HTMLDivElement;
  let popupRef: HTMLDivElement;

  function placePopup() {
    const popup = popupRef;
    const root = rootRef;
    if (!popup || !root) return;
    const rect = root.getBoundingClientRect();
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.bottom + 4}px`;
    popup.style.width = `${rect.width}px`;
  }

  createEffect(() => {
    if (open() && itemCount() > 0) {
      placePopup();
      window.addEventListener("scroll", placePopup, true);
      window.addEventListener("resize", placePopup);
      onCleanup(() => {
        window.removeEventListener("scroll", placePopup, true);
        window.removeEventListener("resize", placePopup);
      });
    }
  });

  return (
    <div ref={rootRef} class={clsx("relative", props.class)}>
      <div
        class={clsx(
          "flex flex-row rounded-md border border-transparent",
          "has-[input:focus]:outline-2 has-[input:focus]:outline-offset-2 has-[input:focus]:outline-layer-content/60",
          firstError() && "border-error! outline-error!"
        )}
      >
        <div class="rounded-l-md flex shrink-0 flex-row items-center justify-center h-8 w-8 bg-layer-content/10">
          <span class="icon-[fluent--code-16-regular]" />
        </div>
        <div class="relative min-w-0 flex-1 h-8">
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 flex flex-row items-center overflow-hidden font-mono text-sm px-2"
          >
            <span class="whitespace-pre" style={{ transform: `translateX(${-scrollLeft()}px)` }}>
              <For each={segments()}>
                {(seg) => <span class={seg.cls}>{props.value.slice(seg.start, seg.end)}</span>}
              </For>
              {/* keep the caret visible when text reaches the right edge */}
              &nbsp;
            </span>
          </div>
          <input
            ref={inputRef}
            class="input w-full h-8 input-sm border-0 outline-none rounded-l-none! relative bg-transparent! text-transparent caret-layer-content placeholder:text-layer-content/40 selection:bg-primary/30"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open() && itemCount() > 0}
            aria-controls="logql-suggestion-listbox"
            aria-activedescendant={selected() >= 0 ? `logql-suggestion-${selected()}` : undefined}
            value={props.value}
            disabled={props.disabled}
            placeholder={props.placeholder}
            spellcheck={false}
            autocomplete="off"
            onInput={(e) => {
              props.onChange(e.currentTarget.value);
              syncCursor();
              setOpen(true);
              refresh();
            }}
            onScroll={() => setScrollLeft(inputRef.scrollLeft)}
            onFocus={() => {
              syncCursor();
              setOpen(true);
              refresh();
            }}
            onBlur={() => {
              // defer so pointer selection in the dropdown wins
              setTimeout(() => setOpen(false), 150);
            }}
            onKeyDown={onKeyDown}
            onClick={() => {
              syncCursor();
              if (open()) refresh();
            }}
            onKeyUp={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                syncCursor();
                refresh();
              }
            }}
          />
        </div>
      </div>
      <Show when={firstError()}>
        {(diag) => (
          <div class="absolute left-0 top-full mt-1 z-10 text-error text-xs">
            {t(`platform.logs.assist.diag.${diag().code}`, diag().params ?? {})}
          </div>
        )}
      </Show>
      <Show when={open() && itemCount() > 0}>
        <Portal>
          <div
            ref={popupRef}
            data-open=""
            class="fixed z-50 card shadow-lg popover"
            style={{ left: "-9999px", top: "-9999px" }}
          >
            <div class="card-content p-2 max-h-80 overflow-y-auto" role="listbox" id="logql-suggestion-listbox">
              <div class="px-2 pb-1 text-xs opacity-60 flex flex-row justify-between">
                <span>
                  {mode().type === "presets"
                    ? t("platform.logs.assist.presetsTitle")
                    : t("platform.logs.assist.suggestionsTitle")}
                </span>
                <span>{t("platform.logs.assist.hint")}</span>
              </div>
              <div class="flex flex-col space-y-1">
                <Show
                  when={mode().type === "suggestions"}
                  fallback={
                    <For each={QUERY_PRESETS}>
                      {(preset, idx) => (
                        <button
                          type="button"
                          role="option"
                          id={`logql-suggestion-${idx()}`}
                          aria-selected={selected() === idx()}
                          class={clsx(
                            "btn btn-ghost btn-sm items-center overflow-hidden h-auto py-1",
                            selected() === idx() && "bg-layer-content/10"
                          )}
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={() => acceptPreset(preset.query)}
                          onMouseEnter={() => setSelected(idx())}
                        >
                          <div class="flex-1 flex flex-col items-start overflow-hidden text-start">
                            <span class="truncate font-bold">
                              {t(`platform.logs.assist.presets.${preset.labelKey}`)}
                            </span>
                            <span class="truncate font-mono text-xs opacity-60">{preset.query}</span>
                          </div>
                          <span class="shrink-0 text-xs opacity-40">
                            {t(`platform.logs.assist.presets.${preset.descKey}`)}
                          </span>
                        </button>
                      )}
                    </For>
                  }
                >
                  <For each={(mode() as Extract<Mode, { type: "suggestions" }>).items}>
                    {(item, idx) => (
                      <button
                        type="button"
                        role="option"
                        id={`logql-suggestion-${idx()}`}
                        aria-selected={selected() === idx()}
                        class={clsx(
                          "btn btn-ghost btn-sm items-center overflow-hidden",
                          selected() === idx() && "bg-layer-content/10"
                        )}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => accept(item)}
                        onMouseEnter={() => setSelected(idx())}
                      >
                        <span class={clsx("shrink-0 w-4 h-4 mr-2 opacity-60", KIND_ICONS[item.kind])} />
                        <span class="flex-1 truncate text-start font-mono">{item.label}</span>
                        <Show when={item.detailKey}>
                          <span class="shrink-0 text-xs opacity-40">
                            {t(
                              `platform.logs.assist.${item.kind === "field" || item.kind === "prefix" ? "fields" : "detail"}.${item.detailKey}`
                            )}
                          </span>
                        </Show>
                      </button>
                    )}
                  </For>
                </Show>
              </div>
            </div>
          </div>
        </Portal>
      </Show>
    </div>
  );
}
