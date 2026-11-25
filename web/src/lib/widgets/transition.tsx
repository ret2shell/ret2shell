// Local replacement for `solid-transition-group`, which only supports Solid 1.
// The transition state machine itself comes from `@solid-primitives/transition-group`
// (the same primitive that package delegated to since 0.3); this module keeps the
// `<Transition>` / `<TransitionGroup>` component surface and the CSS class naming
// (`<name>-enter`, `<name>-enter-active`, `<name>-enter-to`, ...).

import { resolveElements, resolveFirst } from "@solid-primitives/refs";
import { createListTransition, createSwitchTransition, type TransitionMode } from "@solid-primitives/transition-group";
import type { JSX } from "@solidjs/web";
import { createMemo } from "solid-js";

type Element = globalThis.Element;
type TransitionEvents = {
  appear?: boolean;
  mode?: "inout" | "outin" | TransitionMode;
  name?: string;
  enterClass?: string;
  enterActiveClass?: string;
  enterToClass?: string;
  exitClass?: string;
  exitActiveClass?: string;
  exitToClass?: string;
  moveClass?: string;
  onBeforeEnter?: (el: Element) => void;
  onEnter?: (el: Element, done: () => void) => void;
  onAfterEnter?: (el: Element) => void;
  onBeforeExit?: (el: Element) => void;
  onExit?: (el: Element, done: () => void) => void;
  onAfterExit?: (el: Element) => void;
  children?: JSX.Element;
};

type Classnames = {
  enterActiveClasses: string[];
  enterClasses: string[];
  enterToClasses: string[];
  exitActiveClasses: string[];
  exitClasses: string[];
  exitToClasses: string[];
  moveClasses: string[];
};

function createClassnames(props: TransitionEvents) {
  return createMemo<Classnames>(() => {
    const name = props.name || "s";
    return {
      enterActiveClasses: (props.enterActiveClass || `${name}-enter-active`).split(" "),
      enterClasses: (props.enterClass || `${name}-enter`).split(" "),
      enterToClasses: (props.enterToClass || `${name}-enter-to`).split(" "),
      exitActiveClasses: (props.exitActiveClass || `${name}-exit-active`).split(" "),
      exitClasses: (props.exitClass || `${name}-exit`).split(" "),
      exitToClasses: (props.exitToClass || `${name}-exit-to`).split(" "),
      moveClasses: (props.moveClass || `${name}-move`).split(" "),
    };
  });
}

function nextFrame(fn: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

function enterTransition(classnames: Classnames, events: TransitionEvents, el: Element, done?: () => void) {
  const { enterClasses, enterActiveClasses, enterToClasses } = classnames;
  const { onBeforeEnter, onEnter, onAfterEnter } = events;
  onBeforeEnter?.(el);
  el.classList.add(...enterClasses);
  el.classList.add(...enterActiveClasses);
  queueMicrotask(() => {
    if (!el.parentNode) return done?.();
    onEnter?.(el, () => endTransition());
  });
  nextFrame(() => {
    el.classList.remove(...enterClasses);
    el.classList.add(...enterToClasses);
    if (!onEnter || onEnter.length < 2) {
      el.addEventListener("transitionend", endTransition);
      el.addEventListener("animationend", endTransition);
    }
  });

  function endTransition(e?: Event) {
    if (!e || e.target === el) {
      done?.();
      el.removeEventListener("transitionend", endTransition);
      el.removeEventListener("animationend", endTransition);
      el.classList.remove(...enterActiveClasses);
      el.classList.remove(...enterToClasses);
      onAfterEnter?.(el);
    }
  }
}

function exitTransition(classnames: Classnames, events: TransitionEvents, el: Element, done?: () => void) {
  const { exitClasses, exitActiveClasses, exitToClasses } = classnames;
  const { onBeforeExit, onExit, onAfterExit } = events;
  if (!el.parentNode) return done?.();
  onBeforeExit?.(el);
  el.classList.add(...exitClasses);
  el.classList.add(...exitActiveClasses);
  onExit?.(el, () => endTransition());
  nextFrame(() => {
    el.classList.remove(...exitClasses);
    el.classList.add(...exitToClasses);
    if (!onExit || onExit.length < 2) {
      el.addEventListener("transitionend", endTransition);
      el.addEventListener("animationend", endTransition);
    }
  });

  function endTransition(e?: Event) {
    if (!e || e.target === el) {
      done?.();
      el.removeEventListener("transitionend", endTransition);
      el.removeEventListener("animationend", endTransition);
      el.classList.remove(...exitActiveClasses);
      el.classList.remove(...exitToClasses);
      onAfterExit?.(el);
    }
  }
}

const TRANSITION_MODE_MAP: Record<string, TransitionMode> = {
  inout: "in-out",
  outin: "out-in",
};

export function Transition(props: TransitionEvents) {
  const classnames = createClassnames(props);
  return createSwitchTransition(
    resolveFirst(() => props.children),
    {
      mode: props.mode ? TRANSITION_MODE_MAP[props.mode] : undefined,
      appear: props.appear,
      onEnter(el, done) {
        enterTransition(classnames(), props, el, done);
      },
      onExit(el, done) {
        exitTransition(classnames(), props, el, done);
      },
    }
  );
}

export function TransitionGroup(props: TransitionEvents) {
  const classnames = createClassnames(props);
  return createListTransition(resolveElements(() => props.children).toArray, {
    appear: props.appear,
    exitMethod: "keep-index",
    onChange({ added, removed, finishRemoved, list }) {
      const classes = classnames();
      for (const el of added) {
        enterTransition(classes, props, el);
      }

      // animate moved elements with the FLIP technique
      const toMove: { el: Element; rect: DOMRect }[] = [];
      for (const el of list) {
        if (el.isConnected && (el instanceof HTMLElement || el instanceof SVGElement)) {
          toMove.push({ el, rect: el.getBoundingClientRect() });
        }
      }
      queueMicrotask(() => {
        const moved: Element[] = [];
        for (const { el, rect } of toMove) {
          if (!el.isConnected) continue;
          const newRect = el.getBoundingClientRect();
          const dX = rect.left - newRect.left;
          const dY = rect.top - newRect.top;
          if (dX || dY) {
            (el as HTMLElement).style.transform = `translate(${dX}px, ${dY}px)`;
            (el as HTMLElement).style.transitionDuration = "0s";
            moved.push(el);
          }
        }
        // force a reflow so the transform above is committed
        document.body.offsetHeight;
        for (const el of moved) {
          const htmlEl = el as HTMLElement;
          const endMove = (e: Event) => {
            if (e.target === el || /transform$/.test((e as TransitionEvent).propertyName)) {
              el.removeEventListener("transitionend", endMove);
              el.classList.remove(...classes.moveClasses);
            }
          };
          el.classList.add(...classes.moveClasses);
          htmlEl.style.transform = "";
          htmlEl.style.transitionDuration = "";
          el.addEventListener("transitionend", endMove);
        }
      });

      for (const el of removed) {
        exitTransition(classes, props, el, () => finishRemoved([el]));
      }
    },
  });
}
