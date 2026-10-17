import LoadingTips from "@widgets/loading-tips";
import clsx from "clsx";
import { createEffect, onCleanup, onMount, type ParentComponent, Show } from "solid-js";

/**
 * Find the scroll container driving a subtree: overlay scrollbars mark
 * their viewport with an attribute, plain layouts rely on overflow styles,
 * and page-level flows fall back to the document scrolling element.
 */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    if (node.hasAttribute("data-overlayscrollbars-viewport")) return node;
    const { overflowY } = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(overflowY)) return node;
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

/**
 * Invisible sentinel that triggers `onLoad` when it scrolls into view near
 * the top of its scroll container. Used for upwards lazy loading of chat
 * history: after older messages are prepended the scroll offset is shifted
 * by the height delta so the viewport keeps showing the same content —
 * the scrollbar moves down instead of the content jumping. Collapses to
 * zero height when there is nothing left to load.
 */
const ChatHistorySentinel: ParentComponent<{
  onLoad: () => Promise<unknown> | unknown;
  hasMore: boolean;
  loading: boolean;
  /** explicit scroll container override; auto-detected when omitted */
  root?: HTMLElement | null;
}> = (props) => {
  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;
  let inFlight = false;

  const arm = () => {
    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || inFlight) continue;
          if (!props.hasMore || props.loading) continue;
          inFlight = true;
          // anchor the viewport before loading; after the prepended content
          // is rendered, shift the offset by the height delta so the user
          // keeps seeing the same messages (scrollbar moves, content does not)
          const scroller = props.root ?? findScrollParent(sentinel ?? null);
          const prevHeight = scroller?.scrollHeight ?? 0;
          const prevTop = scroller?.scrollTop ?? 0;
          Promise.resolve(props.onLoad()).then(() => {
            if (scroller) scroller.scrollTop = prevTop + (scroller.scrollHeight - prevHeight);
            inFlight = false;
          });
        }
      },
      { root: props.root ?? findScrollParent(sentinel ?? null), rootMargin: "160px 0px 0px 0px" }
    );
    if (sentinel) observer.observe(sentinel);
  };

  onMount(() => {
    arm();
    // overlay scrollbars initialize their viewport asynchronously; re-arm
    // once more after they settle to pick the real scroll container
    const timer = setTimeout(arm, 600);
    onCleanup(() => clearTimeout(timer));
  });
  // re-arm when an explicit root resolves later
  createEffect(() => {
    props.root;
    arm();
  });

  onCleanup(() => observer?.disconnect());

  return (
    <div
      ref={sentinel}
      class={clsx(
        "w-full flex items-center justify-center overflow-hidden transition-[height] duration-200",
        props.hasMore || props.loading ? "min-h-6" : "h-0!"
      )}
    >
      <Show when={props.loading}>
        <LoadingTips />
      </Show>
    </div>
  );
};

export default ChatHistorySentinel;
