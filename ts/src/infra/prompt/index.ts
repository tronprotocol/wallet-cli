/**
 * Prompter (L1) — the single owner of interactive TTY I/O. Logic (validation loops,
 * confirm match, select navigation) is backend-agnostic; the real backend talks to
 * /dev/tty. Prompts/echo never touch stdout. (spec §4.1)
 */
import { openSync, closeSync } from "node:fs";
import { ReadStream } from "node:tty";
import * as readline from "node:readline";
import { ExecutionError } from "../../core/errors/index.js";

export type KeyEvent = { name?: string; ctrl?: boolean; sequence?: string };
export interface Choice<T> { value: T; label: string }

export interface PromptBackend {
  isTTY(): boolean;
  /** read one line; when hidden, keystrokes are not echoed. */
  question(prompt: string, hidden: boolean): Promise<string>;
  /** resolve on the next keypress (raw mode must be active). */
  readKey(): Promise<KeyEvent>;
  write(s: string): void;
  beginRaw(): void;
  endRaw(): void;
}

export class Prompter {
  constructor(private readonly be: PromptBackend) {}

  isTTY(): boolean { return this.be.isTTY(); }

  async text(o: { label: string; validate?: (v: string) => string | null }): Promise<string> {
    for (;;) {
      const v = (await this.be.question(`${o.label}: `, false)).trim();
      const err = o.validate?.(v);
      if (err) { this.be.write(`  ✗ ${err}\n`); continue; }
      return v;
    }
  }

  async hidden(o: { label: string; confirm?: boolean; validate?: (v: string) => string | null }): Promise<string> {
    for (;;) {
      const v = await this.be.question(`${o.label}: `, true);
      const err = o.validate?.(v);
      if (err) { this.be.write(`  ✗ ${err}\n`); continue; }
      if (o.confirm) {
        const again = await this.be.question("Confirm: ", true);
        if (v !== again) { this.be.write("  ✗ entries do not match\n"); continue; }
      }
      return v;
    }
  }

  async confirm(o: { label: string; expect?: string }): Promise<boolean> {
    const v = await this.be.question(`${o.label}: `, false);
    if (o.expect !== undefined) return v.trim() === o.expect;
    return /^y(es)?$/i.test(v.trim());
  }

  async select<T>(o: { label: string; choices: Choice<T>[]; loadMore?: () => Promise<Choice<T>[]> }): Promise<T> {
    let items = [...o.choices];
    let idx = 0;
    this.be.beginRaw();
    try {
      this.#render(o.label, items, idx);
      for (;;) {
        const k = await this.be.readKey();
        if (k.ctrl && k.name === "c") throw new ExecutionError("aborted", "cancelled");
        if (k.name === "up") idx = Math.max(0, idx - 1);
        else if (k.name === "down") {
          if (idx === items.length - 1 && o.loadMore) {
            const more = await o.loadMore();
            if (more.length > items.length) { items = more; idx++; }
          } else {
            idx = Math.min(items.length - 1, idx + 1);
          }
        } else if (k.name === "return") return items[idx]!.value;
        this.#render(o.label, items, idx);
      }
    } finally {
      this.be.endRaw();
    }
  }

  #render(label: string, items: Choice<unknown>[], idx: number): void {
    const lines = items.map((c, i) => `${i === idx ? "›" : " "} ${c.label}`);
    this.be.write(`${label} (↑/↓, Enter):\n${lines.join("\n")}\n`);
  }
}

/** Real backend: reads /dev/tty, writes prompts to /dev/tty (never stdout). */
export class TtyBackend implements PromptBackend {
  #tty: boolean;
  #raw?: ReadStream; // live only during a select() session (raw mode)
  constructor() {
    // Probe for a controlling terminal without holding the fd; per-prompt fds are opened on demand.
    try {
      closeSync(openSync("/dev/tty", "r"));
      this.#tty = true;
    } catch {
      this.#tty = false;
    }
  }
  isTTY(): boolean { return this.#tty; }
  write(s: string): void { process.stderr.write(s); }

  /**
   * A fresh tty.ReadStream per prompt: a real TTY stream (unlike fs.createReadStream) so readline's
   * raw mode engages — keystrokes are NOT echoed by the OS when hidden. Destroying it after each
   * prompt closes the fd and releases the libuv handle, so the process can exit (no hang).
   */
  question(prompt: string, hidden: boolean): Promise<string> {
    const fd = openSync("/dev/tty", "r");
    const input = new ReadStream(fd);
    const rl = readline.createInterface({ input, output: process.stderr, terminal: true });
    return new Promise((resolve) => {
      if (hidden) (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
      process.stderr.write(prompt);
      rl.question("", (ans) => {
        rl.close();
        input.destroy(); // closes fd + releases the handle (else the event loop never drains → hang)
        process.stderr.write("\n");
        resolve(ans);
      });
    });
  }

  beginRaw(): void {
    const fd = openSync("/dev/tty", "r");
    this.#raw = new ReadStream(fd);
    readline.emitKeypressEvents(this.#raw);
    this.#raw.setRawMode(true);
  }
  endRaw(): void {
    if (!this.#raw) return;
    this.#raw.setRawMode(false);
    this.#raw.destroy(); // closes fd + releases the handle
    this.#raw = undefined;
  }
  readKey(): Promise<KeyEvent> {
    const input = this.#raw!;
    return new Promise((resolve) => {
      const onKey = (_s: string, key: KeyEvent) => { input.off("keypress", onKey); resolve(key ?? {}); };
      input.on("keypress", onKey);
    });
  }
  close(): void { /* per-prompt fds are closed on destroy; nothing persistent to release. */ }
}

export function createPrompter(): Prompter {
  return new Prompter(new TtyBackend());
}
