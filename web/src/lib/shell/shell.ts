import type { Terminal } from "@xterm/xterm";
import ansiColors from "ansi-colors";
import { DateTime } from "luxon";
import { parse } from "shell-quote";
import stripAnsi from "strip-ansi";
import type { Challenge } from "../models/challenge";
import { accountStore } from "../storage/account";
import { gameStore } from "../storage/game";
import { t } from "../storage/theme";
import { cursorDown1, cursorUp1, link } from "./escapes";
import { Exec } from "./exec";
import { slice, unicodeStrDisplayLength } from "./pty";
import { Stdio } from "./stdio";

export class BufferHistory {
  private readonly entries: string[];
  private cursor: number;
  private buffer: string;

  constructor() {
    this.cursor = 0;
    this.buffer = "";
    this.entries = [];
  }

  push(entry: string) {
    // check entry empty
    if (entry.trim() === "") return;
    // check last entry is same as current
    const lastEntry = this.entries[this.entries.length - 1];
    if (entry === lastEntry) return;

    this.entries.push(entry);
    this.cursor = this.entries.length;
  }

  previous(buffer?: string) {
    // save user's current input
    if (this.cursor === this.entries.length && buffer) {
      // console.log('saving buffer')
      this.buffer = buffer;
    }
    if (this.entries.length === 0) return this.buffer;
    this.cursor = Math.max(0, this.cursor - 1);
    return this.entries[this.cursor];
  }

  next() {
    // recover user's buffer
    if (this.cursor + 1 >= this.entries.length) {
      this.cursor = this.entries.length;
      return this.buffer;
    }
    if (this.entries.length === 0) return this.buffer;
    this.cursor = Math.min(this.entries.length, this.cursor + 1);
    return this.entries[this.cursor];
  }

  rewind() {
    this.cursor = this.entries.length;
  }
}

export class Shell {
  private readonly stdio: Stdio;
  private code = 0;
  private inputBuffer = "";
  private history: BufferHistory;
  private exec: Exec;
  private running = false;
  private challenge: Challenge | null = null;
  private onExecuted?: (cmd: string, code: number) => void;

  constructor(term: Terminal, onExecuted: (cmd: string, code: number) => void) {
    this.stdio = new Stdio(term);
    this.history = new BufferHistory();
    this.exec = new Exec();
    this.onExecuted = onExecuted;
    ansiColors.enabled = true;
  }

  public greet() {
    this.stdio.println(
      ansiColors.bold(
        t("shell.welcome", {
          shell: `${ansiColors.blue("Rx")}${ansiColors.dim("::")}${ansiColors.blue("Shell")}`,
        })!
      )
    );
    this.stdio.info(
      t("shell.tip", {
        flag: ansiColors.red("flag"),
        help: link(ansiColors.green("help"), "rnix://command/help"),
      })!
    );
    this.stdio.println("");
  }

  public setChallenge(challenge: Challenge | null) {
    if (this.challenge?.id === challenge?.id) return;
    this.challenge = challenge;
    if (this.running) {
      this.stdio.clearInput();
      this.stdio.clear();
      this.greet();
      this.stdio.print(this.prompt());
      this.inputBuffer = "";
    }
  }

  public emulateCommand(command: string) {
    this.stdio.clearInput();
    this.stdio.emulateInput(`${command}\n`);
  }

  public async run() {
    if (this.running) return;
    this.running = true;
    this.greet();
    let pendingBuffer = "";
    // eslint-disable-next-line no-constant-condition
    while (true) {
      this.stdio.print(this.prompt());
      // eslint-disable-next-line no-constant-condition
      while (true) {
        this.inputBuffer = await this.stdio.input(pendingBuffer);
        if (this.inputBuffer.endsWith(cursorUp1)) {
          this.stdio.clearInput();
          pendingBuffer = stripAnsi(this.history.previous(this.inputBuffer.trim()).trim());
          // console.log(pendingBuffer)
          continue;
        }
        if (this.inputBuffer.endsWith(cursorDown1)) {
          this.stdio.clearInput();
          pendingBuffer = stripAnsi(this.history.next().trim());
          // console.log(pendingBuffer)
          continue;
        }
        pendingBuffer = "";
        break;
      }
      this.stdio.print("\n");
      if (stripAnsi(this.inputBuffer).trim().length === 0) continue;
      if (this.inputBuffer.trim() === "exit") {
        this.stdio.error(`[exit from shell ${location.host}:${location.port}]`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        this.stdio.info("[auto reconnecting...]");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        this.stdio.clear();
        this.greet();
        continue;
      }
      this.history.push(stripAnsi(this.inputBuffer));
      const args = parse(this.inputBuffer);
      const result = await this.exec.exec(this.stdio, args, this.inputBuffer);
      this.onExecuted?.(result.cmd, result.code);
      this.code = result.code;
    }
  }

  private prompt() {
    const challengeName = this.challenge?.name || "unknown";
    let slicedChallengeName = "";
    if (challengeName.length > 16) {
      slicedChallengeName = `${slice(challengeName, 0, 16)}…`;
    } else {
      slicedChallengeName = challengeName;
    }
    const leftPart = `${ansiColors.green(accountStore.account || "guest")}:${ansiColors.blue(gameStore.team?.name || "wheel")} ${ansiColors.yellow(`~/${slicedChallengeName}`)}`;
    const rightPart = `${ansiColors.dim("in")} ${ansiColors.blue(gameStore.current?.name || "unknown")}${
      this.code === 0 ? "" : ansiColors.redBright(` [${this.code}]`)
    } [${DateTime.now().toFormat("HH:mm:ss")}]`;
    // console.log(this.stdio.termWidth());
    // console.log(unicodeStrDisplayLength(leftPart));
    // console.log(unicodeStrDisplayLength(rightPart));
    const padding = ansiColors.dim(
      "─".repeat(
        Math.max(2, this.stdio.termWidth() - unicodeStrDisplayLength(leftPart) - unicodeStrDisplayLength(rightPart)) - 2
      )
    );
    return `${leftPart} ${padding} ${rightPart}\n${this.code === 0 ? ansiColors.greenBright.bold("$") : ansiColors.redBright.bold("$")} `;
  }
}
