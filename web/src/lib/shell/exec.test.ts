import type { ParseEntry } from "shell-quote";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Stdio } from "./stdio";

const commandFns = vi.hoisted(() => ({
  echo: vi.fn(async () => 7),
  submit: vi.fn(async () => 42),
}));

vi.mock("../storage/theme", () => ({
  t: (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
}));

vi.mock("./bin", () => ({
  echo: class Echo {
    name = "echo";
    man = "echo";
    func = commandFns.echo;
  },
  submit: class Submit {
    name = "submit";
    man = "submit";
    func = commandFns.submit;
  },
}));

import { Exec } from "./exec";

function createIo() {
  return {
    error: vi.fn(),
  } as unknown as Stdio;
}

describe("Exec", () => {
  beforeEach(() => {
    commandFns.echo.mockReset().mockResolvedValue(7);
    commandFns.submit.mockReset().mockResolvedValue(42);
  });

  it("registers available commands from the shell command module", () => {
    const exec = new Exec();

    expect([...exec.commands.keys()].sort()).toEqual(["echo", "submit"]);
  });

  it("dispatches known commands and forwards sliced arguments", async () => {
    const exec = new Exec();
    const io = createIo();
    const env = { game: { id: 1 } };

    const result = await exec.exec(io, [" echo ", "hello", "world"] as ParseEntry[], "echo hello world", env);

    expect(result).toEqual({ cmd: "echo", code: 7 });
    expect(commandFns.echo).toHaveBeenCalledWith(io, ["hello", "world"], "echo hello world", env);
  });

  it("routes detected flag submissions to the submit command", async () => {
    const exec = new Exec();
    const io = createIo();

    const result = await exec.exec(io, ["echo", "flag{test}"] as ParseEntry[], "flag{test}", {});

    expect(result).toEqual({ cmd: "submit", code: 42 });
    expect(commandFns.submit).toHaveBeenCalledWith(io, ["flag{test}"], "flag{test}", {});
    expect(commandFns.echo).not.toHaveBeenCalled();
  });

  it("rejects non-string parse entries and blocks directory traversal commands", async () => {
    const exec = new Exec();

    const invalidIo = createIo();
    await expect(exec.exec(invalidIo, [{ op: "glob" } as ParseEntry], "*", {})).resolves.toEqual({
      cmd: "",
      code: -127,
    });
    expect(invalidIo.error).toHaveBeenCalledWith("shell.errors.commandInvalid.title");

    const cdIo = createIo();
    await expect(exec.exec(cdIo, ["cd"] as ParseEntry[], "cd /tmp", {})).resolves.toEqual({
      cmd: "cd",
      code: -127,
    });
    expect(cdIo.error).toHaveBeenCalledWith("shell.errors.traversalDetected.title");
  });

  it("treats empty commands as no-ops and reports unknown commands", async () => {
    const exec = new Exec();

    const blankIo = createIo();
    await expect(exec.exec(blankIo, ["   "] as ParseEntry[], "   ", {})).resolves.toEqual({
      cmd: "",
      code: 0,
    });
    expect(blankIo.error).not.toHaveBeenCalled();

    const missingIo = createIo();
    await expect(exec.exec(missingIo, ["missing"] as ParseEntry[], "missing", {})).resolves.toEqual({
      cmd: "missing",
      code: -127,
    });
    expect(missingIo.error).toHaveBeenCalledWith('shell.commandNotFound:{"command":"missing"}');
  });
});
