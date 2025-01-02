type ReturnTypeOrSelf<T> = T extends () => unknown ? ReturnType<T> : T;
type ReduceGetter<T extends Record<string, unknown>> = { [K in keyof T]: ReturnTypeOrSelf<T[K]> };

export class DynamicElement<T extends Record<string, unknown> = { [k: string]: unknown }, K extends keyof T = keyof T> {
  key: K;
  fallback: (DynamicElement<T, K> | ReduceGetter<T>[K])[];
  /**
   * Wrapper of the value of the record.
   *
   * @param fallback Given same final type of `k`, or the `Element` object
   */
  constructor(k: K, ...fallback: (DynamicElement<T, K> | ReduceGetter<T>[K])[]) {
    this.key = k;
    this.fallback = fallback;
  }
  // implement this
  get(): ReduceGetter<T>[K] {
    let t = this.key as ReduceGetter<T>[K];
    for (const v of this.fallback) {
      if (!t) break;
      if (v instanceof DynamicElement) {
        t = v.get();
      } else {
        t = v;
      }
    }
    return t;
  }
  valueOf() {
    return this.get();
  }
  toString() {
    const t = this.get();
    if (typeof t === "undefined" || t === null) return String(t);
    return Object.prototype.hasOwnProperty.call(t, "toString") ? t!.toString() : String(t);
  }
}

export class DynamicRecord<G extends Record<string, unknown>> {
  protected getter: G;
  readonly Element: typeof DynamicElement<G>;

  /**
   * DynamicRecord is a class that transforms a record of getter functions into a record of values,
   * allowing use simple `[]` phrase to get the value of the record dynamically.
   */
  constructor(getters: G = {} as G) {
    this.getter = getters;
    const that = this;
    this.Element = class extends DynamicElement<G> {
      get() {
        return DynamicRecord.valOrReturnVal(that.getter[this.key]);
      }
    };
  }

  protected static valOrReturnVal<T>(t: T) {
    return (typeof t === "function" ? t() : t) as ReturnTypeOrSelf<T>;
  }

  protected static parseGetter<T extends Record<string, unknown>>(getters: T) {
    return new Proxy(getters, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && Object.prototype.hasOwnProperty.call(target, prop)) {
          return DynamicRecord.valOrReturnVal(Reflect.get(target, prop, receiver));
        }
        return undefined;
      },
    }) as ReduceGetter<T>;
  }

  /**
   * @example
   * ```ts
   * let i = 0;
   * const record = new DynamicRecord({
   *   "a": () => [0, ++i],
   *   "b": () => "hello",
   *   "c": 114514,
   *   "d": "world"
   * });
   * const j = record.dynamicJson();
   * console.log(j.a); // [0, 1]
   * console.log(j.a); // [0, 2]
   * console.log(j.b); // "hello"
   */
  dynamicJson() {
    return DynamicRecord.parseGetter(this.getter);
  }

  /**
   * Get the value of the record by key.
   */
  get(key: string) {
    return DynamicRecord.valOrReturnVal(this.getter[key]) as ReturnTypeOrSelf<G[keyof G]>;
  }

  /**
   * Create a DynamicElement instance by key. The element is a wrapper of the value of the record.
   *
   * @example
   * ```ts
   * let i = 0;
   * const record = new DynamicRecord({
   *  "a": () => [0, ++i]
   * });
   * const element = record.createElement("a");
   * console.log(element.get()); // [0, 1]
   * console.log(element.get()); // [0, 2]
   * console.log(element.toString()); // "0,3"
   * ```
   */
  createElement<K extends keyof G>(key: K, ...fallback: (DynamicElement<G, K> | ReduceGetter<G>[K])[]) {
    return new this.Element(key, ...fallback) as DynamicElement<G, K>;
  }
}
