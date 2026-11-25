// Solid 1.x compatibility helpers for third-party packages that have no Solid 2
// release yet (currently only `@modular-forms/solid`, wired up through a pnpm
// patch that rewrites its `solid-js` imports to this module).
//
// Only what those packages actually use is implemented. Delete this file once
// every dependency ships a Solid 2 build.
import { createMemo, createTrackedEffect, For, type JSX, createEffect as solidCreateEffect, untrack } from "solid-js";

export * from "solid-js";

/**
 * Solid 1 `batch`: writes inside are deferred to the batch flush. Solid 2 batches
 * by default, so running the callback is enough — the callback must not read a
 * value it wrote earlier in the same batch (the patched packages do not).
 */
export function batch<T>(fn: () => T): T {
  return fn();
}

/** Solid 1 `mergeProps`: later sources win, `undefined` values are skipped and reads stay reactive. */
export function mergeProps<T extends readonly object[]>(...sources: T): T[number] {
  return new Proxy({} as T[number], {
    get(_, key) {
      for (let i = sources.length - 1; i >= 0; i--) {
        const value = (sources[i] as Record<PropertyKey, unknown>)[key as PropertyKey];
        if (value !== undefined) return value;
      }
      return undefined;
    },
    has(_, key) {
      return sources.some((source) => key in (source as object));
    },
    ownKeys() {
      return [...new Set(sources.flatMap((source) => Reflect.ownKeys(source as object)))];
    },
    getOwnPropertyDescriptor(_, key) {
      for (let i = sources.length - 1; i >= 0; i--) {
        if (key in (sources[i] as object)) {
          return {
            enumerable: true,
            configurable: true,
            get: () => (sources[i] as Record<PropertyKey, unknown>)[key as PropertyKey],
          };
        }
      }
      return undefined;
    },
  });
}

/** Solid 1 `splitProps`: partitions props into picked groups plus the remainder, keeping reads reactive. */
export function splitProps<T extends object, K extends (keyof T)[][]>(
  props: T,
  ...groups: K
): [...{ [I in keyof K]: Pick<T, Extract<K[I][number], keyof T>> }, Omit<T, Extract<K[number][number], keyof T>>] {
  const used = new Set<PropertyKey>();
  const result = groups.map((keys) => {
    const picked = {} as Record<PropertyKey, unknown>;
    for (const key of keys) {
      used.add(key as PropertyKey);
      Object.defineProperty(picked, key, {
        enumerable: true,
        configurable: true,
        get: () => props[key as keyof T],
      });
    }
    return picked;
  });
  const rest = {} as Record<PropertyKey, unknown>;
  for (const key of Reflect.ownKeys(props)) {
    if (used.has(key)) continue;
    Object.defineProperty(rest, key, {
      enumerable: true,
      configurable: true,
      get: () => props[key as keyof T],
    });
  }
  return [...result, rest] as never;
}

/** Solid 1 `onMount`: runs once after render settles, cleanup is returned. */
/** Solid 1 `createComputed`: a single tracked callback. */
/** Solid 1 `unwrap`: plain value of a store. */
export { createTrackedEffect as createComputed, onSettled as onMount, snapshot as unwrap } from "solid-js";

/** Solid 1 `produce`: Solid 2 setters already take a draft mutator. */
export function produce<T>(fn: (draft: T) => void): (draft: T) => void {
  return fn;
}

/** Solid 1 `memo` from `solid-js/web`: memoized accessor around a JSX expression. */
export function memo<T>(fn: () => T, equals?: false | ((prev: T, next: T) => boolean)) {
  const value = createMemo(() => untrack(fn), { equals });
  return () => value();
}

/** Solid 1 `on`: gates an effect body on a dependency list, optionally skipping the first run. */
export function on<T>(
  deps: (() => T) | T,
  fn: (value: T, previous: T | undefined) => unknown,
  options?: { defer?: boolean }
) {
  let initialized = false;
  let previous: T | undefined;
  return () => {
    const value = typeof deps === "function" ? (deps as () => T)() : (deps as T);
    if (!initialized) {
      initialized = true;
      if (options?.defer) {
        previous = value;
        return;
      }
      const result = fn(value, undefined);
      previous = value;
      return result;
    }
    const result = fn(value, previous);
    previous = value;
    return result;
  };
}

/** Solid 1 `<Index>`: renders a list by index instead of by identity. */
export function Index<T>(props: {
  each: readonly T[];
  fallback?: JSX.Element;
  children: (item: () => T, index: number) => JSX.Element;
}) {
  return (For as unknown as (p: Record<string, unknown>) => JSX.Element)({ ...props, keyed: false });
}

/**
 * Dispatches between the Solid 1 single-callback form (still used by the patched
 * Solid 1 packages) and the Solid 2 compute/apply form.
 */
export function createEffect<C, A>(compute: C, apply?: A, options?: Record<string, unknown>): unknown {
  if (apply === undefined && options === undefined) {
    return createTrackedEffect(compute as unknown as () => void);
  }
  return (solidCreateEffect as unknown as (...args: unknown[]) => unknown)(compute, apply, options);
}

/**
 * Solid 1 `$TRACK`: reading it on a store subscribed to every property. Solid 2
 * tracks stores deeply by default, so a plain sentinel is enough to keep the
 * patched packages' `store[$TRACK]` probes from throwing.
 */
export const $TRACK = Symbol("$TRACK");
