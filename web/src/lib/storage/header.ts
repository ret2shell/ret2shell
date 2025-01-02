import { DynamicElement } from "@lib/utils/dynamic-record";
import { useLocation } from "@solidjs/router";
import { createEffect, untrack } from "solid-js";
import { platformStore } from "./platform";
import { t } from "./theme";

class RichTitle {
  raw: TemplateStringsArray;
  args: (string | DynamicElement)[];
  /**
   * Template string with dynamic elements.
   */
  constructor(raw: TemplateStringsArray, args: (string | DynamicElement)[]) {
    this.raw = raw;
    this.args = args;
  }

  /**
   * The template function, same usage as `String.raw`.
   *
   * @example
   * ```ts
   * RichTitle.fromTemplate`Hello, ${"world"}!` // "Hello, world!"
   * ```
   * @example
   * ```ts
   * let i = 0;
   * const record = new DynamicRecord({
   *   "a": () => [0, ++i]
   * });
   * const E = record.createElement.bind(record);
   * RichTitle.fromTemplate`Output: ${E("a")}!` // "Output: 0,1!"
   * ```
   */
  static fromTemplate(raw: TemplateStringsArray, ...args: unknown[]) {
    return new RichTitle(raw, args as (string | DynamicElement)[]);
  }

  /**
   * From a string, or a DynamicElement, or a RichTitle.
   */
  static from(o: string | DynamicElement | RichTitle) {
    if (o instanceof RichTitle) {
      return new RichTitle(o.raw, o.args);
    }
    if (o instanceof DynamicElement) {
      return RichTitle.fromTemplate`${o}`;
    }
    const raw = [RichTitle.toString(o)];
    Object.defineProperty(raw, "raw", { value: Array.from(raw), writable: false });
    return new RichTitle(Object.freeze(raw) as TemplateStringsArray, []);
  }

  toString() {
    const _Args = this.args.map((arg) => {
      if (typeof arg === "undefined" || arg === null) return String(arg);
      return Object.prototype.hasOwnProperty.call(arg, "toString") ? arg.toString() : String(arg);
    });
    return this.raw.reduce((acc, val, idx) => {
      return acc + val + (_Args[idx] || "");
    }, "");
  }

  static toString(title: string | DynamicElement | RichTitle) {
    if (title instanceof RichTitle) {
      return title.toString();
    }
    if (typeof title === "undefined" || title === null) return String(title);
    return Object.prototype.hasOwnProperty.call(title, "toString") ? title.toString() : String(title);
  }
}

/**
 * Template string generator for RichTitle
 */
export function tmpl(raw: TemplateStringsArray, ...args: unknown[]) {
  return new RichTitle(raw, args as (string | DynamicElement)[]);
}

class RouteHeader {
  title?: RichTitle;
  path: string;
  subRoutes: RouteHeader[];
  constructor() {
    this.title = undefined;
    this.path = "(root)";
    this.subRoutes = [];
  }

  /**
   * @returns ```
   * [parentRoute, exactRoute]
   * ```
   */
  findRoute(subPath: string[]): [RouteHeader, RouteHeader | null] {
    let parent: RouteHeader = this;
    let current: RouteHeader = this;
    for (const pathnode of subPath) {
      const next = current.subRoutes.find((r) => r.path === pathnode);
      if (next) {
        parent = next;
        current = next;
      } else {
        return [parent, null];
      }
    }
    return [parent, current];
  }

  insertRoute(subPath: string[], title: RichTitle) {
    let current: RouteHeader = this;
    for (let i = 0; i < subPath.length; i++) {
      const pathnode = subPath[i];
      const next = current.subRoutes.find((r) => r.path === pathnode);
      if (next) {
        current = next;
      } else {
        const newRoute = new RouteHeader();
        newRoute.path = pathnode;
        current.subRoutes.push(newRoute);
        current = newRoute;
      }
    }
    current.title = title;
    return current;
  }
}

export const headerStore = new RouteHeader();

/// React component
export function Title(props: { title: string | DynamicElement | RichTitle }) {
  let path = useLocation().pathname;
  if (path.endsWith("/")) path = path.slice(0, path.length - 1);
  const pathArr = path.split("/");
  const [, exactRoute] = headerStore.findRoute(pathArr);
  if (exactRoute) {
    exactRoute.title = RichTitle.from(props.title);
  } else {
    headerStore.insertRoute(pathArr, RichTitle.from(props.title));
  }
  document.title = RichTitle.toString(props.title);
  return null;
}

export function resolveTitle(pathname: string) {
  const path = pathname.endsWith("/") ? pathname.slice(0, pathname.length - 1) : pathname;
  const pathArr = path.split("/");
  const [parentRoute, exactRoute] = headerStore.findRoute(pathArr);
  document.title = RichTitle.toString(
    exactRoute?.title || parentRoute.title || platformStore.config.name || t("platform.name")!
  );
}

export function setupTitleResolver() {
  const watchedLocation = useLocation();
  createEffect(() => {
    const path = watchedLocation.pathname;
    untrack(() => {
      resolveTitle(path);
    });
  });
}
