// Local replacement for `overlayscrollbars-solid`, which only supports Solid 1
// (its bundle imports the removed `solid-js/web` / `solid-js/store` subpaths and
// Solid 1 runtime internals). Only the surface this project uses is implemented.
import type { JSX } from "@solidjs/web";
import { OverlayScrollbars, type PartialOptions } from "overlayscrollbars";
import { createEffect, onCleanup, onSettled } from "solid-js";

export type OverlayScrollbarsComponentProps = {
  options?: PartialOptions;
  /** Kept for API parity with `overlayscrollbars-solid`; initialization is always deferred to `onSettled`. */
  defer?: boolean;
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
};

export function OverlayScrollbarsComponent(props: OverlayScrollbarsComponentProps) {
  let host: HTMLDivElement | undefined;
  let instance: OverlayScrollbars | undefined;

  onSettled(() => {
    if (!host) return;
    instance = OverlayScrollbars(host, props.options ?? {}, {});
  });

  createEffect(
    () => props.options,
    (options) => {
      instance?.options(options ?? {});
    }
  );

  onCleanup(() => instance?.destroy());

  return (
    <div ref={host} class={props.class} style={props.style}>
      {props.children}
    </div>
  );
}

export default OverlayScrollbarsComponent;
