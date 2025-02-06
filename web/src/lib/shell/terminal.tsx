import { CanvasAddon } from "@xterm/addon-canvas";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { type ITerminalOptions, Terminal } from "@xterm/xterm";
import { type ComponentProps, createEffect, onCleanup, onMount, untrack } from "solid-js";
import { colorPalette, themeStore } from "../storage/theme";
import { Shell } from "./shell";
import "@xterm/xterm/css/xterm.css";
import { challengeStore } from "@storage/challenge";
import clsx from "clsx";

export default function (props: ComponentProps<"div">) {
  let terminal: HTMLDivElement;
  const linkHandler = {
    activate(_event: MouseEvent, text: string) {
      if (text.startsWith("rnix://")) {
        // dispatch rnix events.
        if (text.startsWith("rnix://command/")) {
          const command = text.replace("rnix://command/", "");
          shell?.emulateCommand(command);
        }
      } else if (
        text.startsWith("wsrx://") ||
        text.startsWith("http://") ||
        text.startsWith("https://") ||
        text.startsWith("mailto:")
      ) {
        window.open(text, "_blank");
      }
    },
    allowNonHttpProtocols: true,
  };
  const term = new Terminal({
    convertEol: true,
    allowTransparency: true,
    cursorBlink: true,
    cursorStyle: "underline",
    drawBoldTextInBrightColors: false,
    theme: {
      foreground: colorPalette.fg(),
      background: "#00000000",
      cursor: colorPalette.primary,
      selectionBackground: "#88888840",
      blue: colorPalette.info,
      yellow: colorPalette.warning,
      green: colorPalette.success,
      red: colorPalette.error,
    },
    fontFamily: "JetBrains Mono",
    fontSize: 16,
    lineHeight: 1.2,
    linkHandler: linkHandler,
    customGlyphs: true,
    letterSpacing: 0,
  } as ITerminalOptions);

  const fitAddon = new FitAddon();
  const webLinksAddon = new WebLinksAddon();
  const canvasAddon = new CanvasAddon();
  let shell = null as null | Shell;

  term.loadAddon(fitAddon);
  term.loadAddon(canvasAddon);
  term.loadAddon(webLinksAddon);

  onMount(() => {
    term.open(terminal);
    term.focus();
    fitAddon.fit();

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminal);

    shell = new Shell(term, (_cmd, _code) => {});
    shell.run();
  });

  createEffect(() => {
    if (challengeStore.current) {
      untrack(() => shell?.setChallenge(challengeStore.current || null));
    }
  });

  createEffect(() => {
    if (themeStore.colorScheme) {
      term.options.theme = {
        foreground: colorPalette.fg(),
        background: "#00000000",
        cursor: colorPalette.primary,
        selectionBackground: "#88888840",
        blue: colorPalette.info,
        yellow: colorPalette.warning,
        green: colorPalette.success,
        red: colorPalette.error,
      };
    }
  });

  onCleanup(() => {
    shell?.emulateCommand("exit");
  });

  return (
    <div {...props} class={clsx("flex-1 relative overflow-hidden h-full backdrop-blur-sm p-3 lg:p-6", props.class)}>
      <div class="w-full h-full overflow-hidden" ref={terminal!} id="terminal" />
    </div>
  );
}
