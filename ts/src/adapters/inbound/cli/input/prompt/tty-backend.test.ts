import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ReadStream } from "node:tty";
import { TtyBackend, consoleStdin, defaultTtySource, devTty, type TtySource } from "./index.js";

function fakeStream(isTTY: boolean) {
  return Object.assign(new EventEmitter(), {
    isTTY,
    setRawMode: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
    destroy: vi.fn(),
  });
}
const asStream = (s: ReturnType<typeof fakeStream>) => s as unknown as ReadStream;

describe("defaultTtySource", () => {
  it("uses /dev/tty on POSIX", () => {
    expect(defaultTtySource("linux")).toBe(devTty);
    expect(defaultTtySource("darwin")).toBe(devTty);
  });

  it("uses the console stdin on Windows, which has no /dev/tty", () => {
    const stdin = fakeStream(true);
    const src = defaultTtySource("win32", asStream(stdin));
    expect(src.available()).toBe(true);
    expect(src.open()).toBe(stdin);
  });

  it("reports no terminal on Windows when stdin is a pipe", () => {
    expect(defaultTtySource("win32", asStream(fakeStream(false))).available()).toBe(false);
  });
});

describe("consoleStdin", () => {
  it("releases by pausing, never destroying the process's own stdin", () => {
    const stdin = fakeStream(true);
    const src = consoleStdin(asStream(stdin));
    src.release(src.open());
    expect(stdin.pause).toHaveBeenCalled();
    expect(stdin.destroy).not.toHaveBeenCalled();
  });
});

describe("TtyBackend", () => {
  function source(available: boolean, stream = fakeStream(true)) {
    const src: TtySource = {
      available: vi.fn(() => available),
      open: vi.fn(() => asStream(stream)),
      release: vi.fn(),
    };
    return { src, stream };
  }

  it("reflects the source's availability", () => {
    expect(new TtyBackend(source(true).src).isTTY()).toBe(true);
    expect(new TtyBackend(source(false).src).isTTY()).toBe(false);
  });

  it("opens the stream once, lazily, and releases it through the source on close", () => {
    const { src, stream } = source(true);
    const be = new TtyBackend(src);
    expect(src.open).not.toHaveBeenCalled();
    be.beginRaw();
    be.endRaw();
    be.beginRaw();
    expect(src.open).toHaveBeenCalledTimes(1);
    be.close();
    expect(stream.setRawMode).toHaveBeenLastCalledWith(false);
    expect(src.release).toHaveBeenCalledWith(stream);
  });

  it("does not release anything when no prompt ran", () => {
    const { src } = source(true);
    new TtyBackend(src).close();
    expect(src.release).not.toHaveBeenCalled();
  });
});
