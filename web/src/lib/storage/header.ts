import { useLocation } from "@solidjs/router";
import { createEffect, untrack } from "solid-js";
import { t } from "./theme";

class RouteHeader {
  page?: string;
  domain?: string;
  route: string;
  children: RouteHeader[];
  constructor() {
    this.route = "";
    this.children = [];
  }

  public insert(fullRoutes: string[], domain?: string, page?: string) {
    if (fullRoutes.length === 0) {
      this.page = page;
      this.domain = domain;
      this.page = page;
    } else {
      const [current, ...rest] = fullRoutes;
      let child = this.children.find((c) => c.route === current);
      if (!child) {
        child = new RouteHeader();
        child.route = current;
        this.children.push(child);
      }
      child.insert(rest, domain, page);
    }
  }

  public title(fullRoutes: string[]): string {
    let head: RouteHeader = this;
    let page = this.page;
    let domain = this.domain;
    for (const route of fullRoutes) {
      const child = head.children.find((c) => c.route === route);
      if (child) {
        head = child;
        if (child.domain) {
          domain = child.domain;
          page = undefined;
        }
        if (child.page) page = child.page;
      }
    }
    if (page) return `${page} - ${domain}`;
    return domain ?? t("platform.name")!;
  }

  public duplicate(fullRoutes: string[]): boolean {
    if (fullRoutes.length === 0) {
      return true;
    }
    const [current, ...rest] = fullRoutes;
    const child = this.children.find((c) => c.route === current);
    if (child) {
      return child.duplicate(rest);
    }
    return false;
  }
}

export const headerStore = new RouteHeader();

export function Title(props: { page?: string; route: string; domain?: string }) {
  const watchedLocation = useLocation();
  createEffect(() => {
    if (props.page || props.domain || props.route) {
      const fullRoutes = props.route.split("/").filter((r) => r);
      untrack(() => headerStore.insert(fullRoutes, props.domain, props.page));
    }
    if (watchedLocation.pathname.startsWith(props.route)) {
      untrack(() => {
        document.title = headerStore.title(watchedLocation.pathname.split("/").filter((r) => r));
      });
    }
  });
  return null;
}
