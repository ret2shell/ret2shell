// `solid-js/web` compatibility layer for packages that still import the removed
// Solid 1 subpath (currently `@ark-ui/solid` 6.0.0-next).
//
// Everything that exists in `@solidjs/web` is re-exported; only the removed
// helpers are reimplemented. Delete this file once the packages import
// `@solidjs/web` themselves.
import { For, type JSX } from "solid-js";
import { mergeProps } from "../vendor/solid-compat";

export * from "@solidjs/web";

export { mergeProps };

/** Solid 1 `<Index>`: renders a list by index instead of by identity. */
export function Index<T>(props: {
  each: readonly T[];
  fallback?: JSX.Element;
  children: (item: () => T, index: number) => JSX.Element;
}) {
  return (For as unknown as (p: Record<string, unknown>) => JSX.Element)({ ...props, keyed: false });
}
