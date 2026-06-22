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
  /** release any held resources (e.g. the /dev/tty stream) so the process can exit. */
  close?(): void;
}

export class Prompter {
  #renderedSelectLines = 0;

  constructor(private readonly be: PromptBackend) {}

  isTTY(): boolean { return this.be.isTTY(); }

  /** release backend resources at end of run (no-op for in-memory backends). */
  close(): void { this.be.close?.(); }

  async text(o: { label: string; validate?: (v: string) => string | null }): Promise<string> {
    for (;;) {
      const v = (await this.be.question(`${color("cyan", "?")} ${o.label}: `, false)).trim();
      const err = o.validate?.(v);
      if (err) { this.be.write(`${color("red", "  x")} ${err}\n`); continue; }
      return v;
    }
  }

  async hidden(o: { label: string; confirm?: boolean; confirmLabel?: string; validate?: (v: string) => string | null }): Promise<string> {
    for (;;) {
      const v = await this.be.question(`${color("cyan", "?")} ${o.label}: `, true);
      const err = o.validate?.(v);
      if (err) { this.be.write(`${color("red", "  x")} ${err}\n`); continue; }
      if (o.confirm) {
        const again = await this.be.question(`${color("cyan", "?")} ${o.confirmLabel ?? "Confirm"}: `, true);
        if (v !== again) { this.be.write(`${color("red", "  x")} entries do not match\n`); continue; }
      }
      return v;
    }
  }

  async confirm(o: { label: string; expect?: string }): Promise<boolean> {
    const suffix = o.expect === undefined ? " [y/N]" : "";
    const v = await this.be.question(`${color("yellow", "?")} ${o.label}${suffix}: `, false);
    if (o.expect !== undefined) return v.trim() === o.expect;
    return /^y(es)?$/i.test(v.trim());
  }

  async select<T>(o: { label: string; choices: Choice<T>[]; loadMore?: () => Promise<Choice<T>[]> }): Promise<T> {
    let items = [...o.choices];
    let idx = 0;
    this.be.beginRaw();
    try {
      this.#renderedSelectLines = 0;
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
      this.#renderedSelectLines = 0;
    }
  }

  #render(label: string, items: Choice<unknown>[], idx: number): void {
    if (this.#renderedSelectLines > 0) {
      this.be.write(`\x1b[${this.#renderedSelectLines}F\x1b[J`);
    }
    const lines = items.map((c, i) => `${i === idx ? color("cyan", ">") : " "} ${c.label}`);
    const frame = [
      `${color("cyan", "?")} ${label} ${dim("(Up/Down, Enter)")}`,
      ...lines,
    ];
    this.#renderedSelectLines = frame.length;
    this.be.write(`${frame.join("\n")}\n`);
  }
}

function color(kind: "cyan" | "red" | "yellow" | "green", s: string): string {
  if (process.env.NO_COLOR) return s;
  const code = { cyan: 36, red: 31, yellow: 33, green: 32 }[kind];
  return `\x1b[${code}m${s}\x1b[0m`;
}

function dim(s: string): string {
  return process.env.NO_COLOR ? s : `\x1b[2m${s}\x1b[0m`;
}

/** Real backend: reads /dev/tty, writes prompts to /dev/tty (never stdout). */
export class TtyBackend implements PromptBackend {
  #tty: boolean;
  #fd?: number;
  #input?: ReadStream;
  constructor() {
    // Probe for a controlling terminal without holding the fd; the real stream opens on first prompt.
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
   * ONE persistent tty.ReadStream for the whole run (a real TTY stream, unlike fs.createReadStream).
   * Per-prompt fds caused two failures: an undestroyed fs stream hung the event loop, and opening a
   * fresh fd per prompt let the previous prompt's async teardown reset the terminal AFTER the next
   * prompt set raw mode → the confirm prompt echoed the secret. A single reused stream avoids both;
   * the runner calls close() once at the end to release it so the process exits.
   */
  #stream(): ReadStream {
    if (!this.#input) {
      this.#fd = openSync("/dev/tty", "r");
      this.#input = new ReadStream(this.#fd);
    }
    return this.#input;
  }

  /**
   * Visible input goes through readline (echoes typed text, manages the prompt). Hidden input is read
   * MANUALLY in raw mode: readline's terminal-mode redraw emits `ESC[1G ESC[0J` which erases the
   * just-written prompt on a real terminal (prompt vanished → looked hung). A raw manual read writes
   * the prompt once and never redraws; raw mode means the OS never echoes the secret.
   */
  question(prompt: string, hidden: boolean): Promise<string> {
    const input = this.#stream();
    if (!hidden) {
      const rl = readline.createInterface({ input, output: process.stderr, terminal: true });
      return new Promise((resolve) => {
        rl.question(prompt, (ans) => { rl.close(); input.pause(); resolve(ans); });
      });
    }
    return new Promise((resolve) => {
      process.stderr.write(prompt);
      input.setRawMode(true);
      input.resume();
      let buf = "";
      const finish = (val: string): void => {
        input.setRawMode(false);
        input.off("data", onData);
        input.pause();
        process.stderr.write("\n");
        resolve(val);
      };
      const onData = (d: Buffer): void => {
        for (const ch of d.toString("utf8")) {
          const code = ch.charCodeAt(0);
          if (ch === "\r" || ch === "\n") return finish(buf); // Enter
          if (code === 3) { process.stderr.write("\n"); process.exit(130); } // Ctrl-C
          if (code === 4) return finish(buf); // Ctrl-D
          if (code === 127 || code === 8) { buf = buf.slice(0, -1); continue; } // Backspace
          if (code < 32) continue; // ignore other control chars
          buf += ch;
        }
      };
      input.on("data", onData);
    });
  }

  beginRaw(): void {
    const s = this.#stream();
    readline.emitKeypressEvents(s);
    s.setRawMode(true);
    s.resume();
  }
  endRaw(): void {
    this.#input?.setRawMode(false);
    this.#input?.pause();
  }
  readKey(): Promise<KeyEvent> {
    const input = this.#stream();
    return new Promise((resolve) => {
      const onKey = (_s: string, key: KeyEvent) => { input.off("keypress", onKey); resolve(key ?? {}); };
      input.on("keypress", onKey);
    });
  }
  /** Release the persistent /dev/tty stream so the event loop drains and the process exits. */
  close(): void {
    if (this.#input) {
      try { this.#input.setRawMode(false); } catch { /* may already be closed */ }
      this.#input.destroy();
      this.#input = undefined;
    }
    this.#fd = undefined;
  }
}

export function createPrompter(): Prompter {
  return new Prompter(new TtyBackend());
}
