import type { ComponentProps } from "@solidjs/web";
import { CanvasAddon } from "@xterm/addon-canvas";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { type ITerminalOptions, Terminal } from "@xterm/xterm";
import { createTrackedEffect, onCleanup, onSettled, untrack } from "solid-js";
import { colorPalette, themeStore } from "../storage/theme";
import { Shell } from "./shell";
import "@xterm/xterm/css/xterm.css";
import { useChallenge } from "@api/challenge";
import { useGame } from "@api/game";
import { useSelfTeam } from "@api/team";
import { isAdminOfGame, isGameInProgress } from "@storage/game";
import clsx from "clsx";

export default function (
  props: ComponentProps<"div"> & {
    training?: boolean;
    gameId: number;
    challengeId: number;
  }
) {
  const challenge = useChallenge({
    game_id: () => props.gameId,
    challenge_id: () => props.challengeId,
  });
  const game = useGame({ id: () => props.gameId });
  const team = useSelfTeam({
    game_id: () => props.gameId,
    enabled: () => !props.training && !!game.data && isGameInProgress(game.data) && !isAdminOfGame(game.data),
  });
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
    fontFamily: "Reverier Mono",
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

  onSettled(() => {
    term.open(terminal!);
    term.focus();
    fitAddon.fit();

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminal!);
  });

  createTrackedEffect(() => {
    if (game.data && challenge.data) {
      untrack(() => {
        if (!shell) {
          shell = new Shell(term, game.data, team.data ?? null, (_cmd, _code) => {});
          shell.run();
        }
        shell?.setChallenge(challenge.data || null);
      });
    }
  });

  createTrackedEffect(() => {
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
