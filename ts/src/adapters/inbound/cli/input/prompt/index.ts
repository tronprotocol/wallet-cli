// Prompts and input echo must never use stdout.
import { openSync, closeSync } from "node:fs";
import { ReadStream, isatty } from "node:tty";
import * as readline from "node:readline";
import { ExecutionError } from "../../../../../domain/errors/index.js";

export type KeyEvent = { name?: string; ctrl?: boolean; sequence?: string };
export interface Choice<T> {
  value: T;
  label: string;
}

export interface PromptBackend {
  isTTY(): boolean;
  // Hidden input must not echo keystrokes.
  question(prompt: string, hidden: boolean): Promise<string>;
  // Requires raw mode.
  readKey(): Promise<KeyEvent>;
  write(s: string): void;
  beginRaw(): void;
  endRaw(): void;
  // Release held resources so the process can exit.
  close?(): void;
}

export class Prompter {
  #renderedSelectLines = 0;
  #interactive = true;

  constructor(private readonly be: PromptBackend) {}

  // Disable isTTY for commands that must fail instead of prompting.
  setInteractive(allowed: boolean): void {
    this.#interactive = allowed;
  }

  isTTY(): boolean {
    return this.#interactive && this.be.isTTY();
  }

  close(): void {
    this.be.close?.();
  }

  async text(o: { label: string; validate?: (v: string) => string | null }): Promise<string> {
    for (;;) {
      const v = (await this.be.question(`${color("cyan", "?")} ${o.label}: `, false)).trim();
      const err = o.validate?.(v);
      if (err) {
        this.be.write(`${color("red", "  x")} ${err}\n`);
        continue;
      }
      return v;
    }
  }

  async hidden(o: {
    label: string;
    confirm?: boolean;
    confirmLabel?: string;
    validate?: (v: string) => string | null;
  }): Promise<string> {
    for (;;) {
      const v = await this.be.question(`${color("cyan", "?")} ${o.label}: `, true);
      const err = o.validate?.(v);
      if (err) {
        this.be.write(`${color("red", "  x")} ${err}\n`);
        continue;
      }
      if (o.confirm) {
        const again = await this.be.question(
          `${color("cyan", "?")} ${o.confirmLabel ?? "Confirm"}: `,
          true,
        );
        if (v !== again) {
          this.be.write(`${color("red", "  x")} entries do not match\n`);
          continue;
        }
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

  async select<T>(o: {
    label: string;
    choices: Choice<T>[];
    loadMore?: () => Promise<Choice<T>[]>;
  }): Promise<T> {
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
            if (more.length > items.length) {
              items = more;
              idx++;
            }
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
    const frame = [`${color("cyan", "?")} ${label} ${dim("(Up/Down, Enter)")}`, ...lines];
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

export interface TtySource {
  // Probe without holding the terminal open.
  available(): boolean;
  open(): ReadStream;
  // Release the stream so the event loop can drain.
  release(stream: ReadStream): void;
}

// The controlling terminal remains reachable when stdin is a pipe.
export const devTty: TtySource = {
  available() {
    try {
      closeSync(openSync("/dev/tty", "r"));
      return true;
    } catch {
      return false;
    }
  },
  open() {
    return new ReadStream(openSync("/dev/tty", "r"));
  },
  release(stream) {
    stream.destroy();
  },
};

// Pause process stdin on release; destroy would close it.
// Open lazily: creating process.stdin makes fd 0 nonblocking and can break piped reads.
export function consoleStdin(
  isConsole: () => boolean = () => isatty(0),
  stdin: () => ReadStream = () => process.stdin as ReadStream,
): TtySource {
  return {
    available: isConsole,
    open: stdin,
    release: (stream) => {
      stream.pause();
    },
  };
}

export function defaultTtySource(platform: NodeJS.Platform = process.platform): TtySource {
  return platform === "win32" ? consoleStdin() : devTty;
}

export class TtyBackend implements PromptBackend {
  #tty: boolean;
  #input?: ReadStream;
  #keyQueue: KeyEvent[] = [];
  #pendingKey?: (key: KeyEvent) => void;
  #keyListener?: (s: string, key: KeyEvent) => void;
  constructor(private readonly source: TtySource = defaultTtySource()) {
    this.#tty = source.available();
  }
  isTTY(): boolean {
    return this.#tty;
  }
  write(s: string): void {
    process.stderr.write(s);
  }

  // Reuse one stream: teardown of a prior stream can disable raw mode and expose the next secret.
  #stream(): ReadStream {
    if (!this.#input) this.#input = this.source.open();
    return this.#input;
  }

  // Read hidden input in raw mode without readline redraws, which can erase the prompt.
  question(prompt: string, hidden: boolean): Promise<string> {
    const input = this.#stream();
    if (!hidden) {
      const rl = readline.createInterface({ input, output: process.stderr, terminal: true });
      // Handle raw-mode Ctrl-C; otherwise readline closes without resolving the question.
      rl.on("SIGINT", () => {
        rl.close();
        process.stderr.write("\n");
        process.exit(130);
      });
      return new Promise((resolve) => {
        rl.question(prompt, (ans) => {
          rl.close();
          input.pause();
          resolve(ans);
        });
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
          if (ch === "\r" || ch === "\n") return finish(buf);
          if (code === 3) {
            process.stderr.write("\n");
            process.exit(130);
          } // Ctrl-C
          if (code === 4) return finish(buf); // Ctrl-D
          if (code === 127 || code === 8) {
            buf = buf.slice(0, -1);
            continue;
          } // Backspace
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
    if (!this.#keyListener) {
      this.#keyListener = (_s: string, key: KeyEvent) => {
        if (this.#pendingKey) {
          const resolve = this.#pendingKey;
          this.#pendingKey = undefined;
          resolve(key ?? {});
          return;
        }
        this.#keyQueue.push(key ?? {});
      };
      s.on("keypress", this.#keyListener);
    }
    s.setRawMode(true);
    s.resume();
  }
  endRaw(): void {
    if (this.#keyListener) {
      this.#input?.off("keypress", this.#keyListener);
      this.#keyListener = undefined;
    }
    this.#pendingKey = undefined;
    this.#keyQueue = [];
    this.#input?.setRawMode(false);
    this.#input?.pause();
  }
  readKey(): Promise<KeyEvent> {
    const queued = this.#keyQueue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => {
      this.#pendingKey = resolve;
    });
  }
  close(): void {
    if (this.#input) {
      try {
        this.#input.setRawMode(false);
      } catch {
        // The stream may already be closed.
      }
      this.source.release(this.#input);
      this.#input = undefined;
    }
  }
}

export function createPrompter(): Prompter {
  return new Prompter(new TtyBackend());
}
