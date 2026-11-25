/**
 * Builds an object that exposes only the given keys of `source`, keeping reads
 * reactive (the properties are getters).
 *
 * Solid 2 replaced `splitProps(props, keys)` with `omit(props, ...keys)`, which
 * only yields the *rest*. When both halves are needed — routing a component's
 * props to two different children, for example — use `omit` for the rest and
 * `pick` for the selected keys.
 */
export function pick<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Record<PropertyKey, unknown>;
  for (const key of keys) {
    Object.defineProperty(result, key as PropertyKey, {
      enumerable: true,
      configurable: true,
      get: () => source[key],
    });
  }
  return result as Pick<T, K>;
}
