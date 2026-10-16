import LoadingTips from "@widgets/loading-tips";
import clsx from "clsx";
import { createEffect, onCleanup, onMount, type ParentComponent, Show } from "solid-js";

/**
 * Invisible sentinel that triggers `onLoad` when it scrolls into view near
 * the top of `root` (defaults to the viewport). Used for upwards lazy
 * loading of chat history. Collapses to zero height when there is nothing
 * left to load so it never adds a gap between messages.
 */
const ChatHistorySentinel: ParentComponent<{
  onLoad: () => void;
  hasMore: boolean;
  loading: boolean;
  /** scroll container element; omitted = document viewport */
  root?: HTMLElement | null;
}> = (props) => {
  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;

  const arm = () => {
    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && props.hasMore && !props.loading) props.onLoad();
        }
      },
      { root: props.root ?? null, rootMargin: "160px 0px 0px 0px" }
    );
    if (sentinel) observer.observe(sentinel);
  };

  onMount(arm);
  // re-arm when the root element resolves later (overlay scrollbars mount
  // their viewport asynchronously)
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
