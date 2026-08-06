import { PassThrough } from "node:stream";
import type { ReadStream } from "node:tty";
import { describe, it, expect, vi } from "vitest";
import { Prompter, TtyBackend, type PromptBackend, type KeyEvent } from "./index.js";

class FakeBackend implements PromptBackend {
  out = "";
  #answers: string[];
  #keys: KeyEvent[];
  constructor(answers: string[] = [], keys: KeyEvent[] = []) { this.#answers = answers; this.#keys = keys; }
  isTTY() { return true; }
  async question(prompt: string, _hidden: boolean) { this.out += prompt; return this.#answers.shift() ?? ""; }
  async readKey() { return this.#keys.shift() ?? { name: "return" }; }
  write(s: string) { this.out += s; }
  beginRaw() {}
  endRaw() {}
}

describe("Prompter.setInteractive", () => {
  it("forces isTTY false when interaction is disabled, even on a real TTY", () => {
    const p = new Prompter(new FakeBackend()); // FakeBackend.isTTY() === true
    expect(p.isTTY()).toBe(true);
    p.setInteractive(false);
    expect(p.isTTY()).toBe(false);
    p.setInteractive(true);
    expect(p.isTTY()).toBe(true);
  });
});

describe("Prompter.text", () => {
  it("re-prompts until validate passes", async () => {
    const be = new FakeBackend(["", "  ", "ok"]);
    const p = new Prompter(be);
    const v = await p.text({ label: "name", validate: (s) => (s.trim() ? null : "required") });
    expect(v).toBe("ok");
  });
});

describe("Prompter.hidden", () => {
  it("requires the confirm entry to match", async () => {
    const be = new FakeBackend(["Abcdef1!", "nope", "Abcdef1!", "Abcdef1!"]);
    const p = new Prompter(be);
    const v = await p.hidden({ label: "pw", confirm: true });
    expect(v).toBe("Abcdef1!");
  });
  it("re-prompts on validate failure", async () => {
    const be = new FakeBackend(["weak", "Abcdef1!"]);
    const p = new Prompter(be);
    const v = await p.hidden({ label: "pw", validate: (s) => (s.length >= 8 ? null : "too short") });
    expect(v).toBe("Abcdef1!");
  });
});

describe("Prompter.confirm", () => {
  it("expect-mode returns true only when the exact ref is typed", async () => {
    const ok = new Prompter(new FakeBackend(["wlt_a.0"]));
    expect(await ok.confirm({ label: "type ref", expect: "wlt_a.0" })).toBe(true);
    const no = new Prompter(new FakeBackend(["wrong"]));
    expect(await no.confirm({ label: "type ref", expect: "wlt_a.0" })).toBe(false);
  });
});

describe("Prompter.select", () => {
  it("arrows to an item and returns its value on enter", async () => {
    const be = new FakeBackend([], [{ name: "down" }, { name: "return" }]);
    const p = new Prompter(be);
    const v = await p.select({ label: "pick", choices: [{ value: "a", label: "A" }, { value: "b", label: "B" }] });
    expect(v).toBe("b");
  });
  it("loads more when arrowing past the last item", async () => {
    const be = new FakeBackend([], [{ name: "down" }, { name: "down" }, { name: "return" }]);
    const p = new Prompter(be);
    let loaded = false;
    const v = await p.select({
      label: "pick",
      choices: [{ value: "x0", label: "0" }],
      loadMore: async () => { loaded = true; return [{ value: "x0", label: "0" }, { value: "x1", label: "1" }]; },
    });
    expect(loaded).toBe(true);
    expect(v).toBe("x1");
  });
  it("advances onto the newly loaded item after a single down past the end", async () => {
    const be = new FakeBackend([], [{ name: "down" }, { name: "return" }]);
    const p = new Prompter(be);
    const v = await p.select({
      label: "pick",
      choices: [{ value: "x0", label: "0" }],
      loadMore: async () => [{ value: "x0", label: "0" }, { value: "x1", label: "1" }],
    });
    expect(v).toBe("x1");
  });
});

describe("TtyBackend on Windows", () => {
  it.each([
    "Command Prompt",
    "Windows PowerShell 5.1",
    "PowerShell 7",
    "Windows Terminal with a Console/ConPTY profile",
    "Git Bash or MSYS2 through ConPTY/winpty",
  ])("supports %s when the host exposes raw-capable stdin", () => {
    const input = new PassThrough() as PassThrough & { isTTY: boolean; setRawMode: (mode: boolean) => void };
    input.isTTY = true;
    input.setRawMode = vi.fn();
    const backend = new TtyBackend({ platform: "win32", stdin: input as unknown as ReadStream });

    expect(backend.isTTY()).toBe(true);
    backend.beginRaw();
    backend.close();

    expect(input.setRawMode).toHaveBeenCalledWith(true);
    expect(input.setRawMode).toHaveBeenLastCalledWith(false);
    expect(input.destroyed).toBe(false);
  });

  it("rejects redirected stdin instead of treating a script pipe as an interactive shell", () => {
    const input = new PassThrough() as PassThrough & { isTTY: boolean };
    input.isTTY = false;
    const backend = new TtyBackend({ platform: "win32", stdin: input as unknown as ReadStream });

    expect(backend.isTTY()).toBe(false);
  });
});
