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

  // Creating process.stdin switches fd 0 to non-blocking, so a later --password-stdin
  // readFileSync(0) on a pipe whose writer has not written yet fails with EAGAIN.
  it.each(["linux", "win32"] as const)(
    "does not create process.stdin when the backend starts (%s)",
    (platform) => {
      const getter = vi.spyOn(process, "stdin", "get");
      try {
        new TtyBackend(defaultTtySource(platform)).isTTY();
        expect(getter).not.toHaveBeenCalled();
      } finally {
        getter.mockRestore();
      }
    },
  );
});

describe("consoleStdin", () => {
  it("is available only when stdin is the console, and opens stdin itself", () => {
    const stdin = fakeStream(true);
    expect(
      consoleStdin(
        () => true,
        () => asStream(stdin),
      ).available(),
    ).toBe(true);
    expect(
      consoleStdin(
        () => false,
        () => asStream(stdin),
      ).available(),
    ).toBe(false);
    expect(
      consoleStdin(
        () => true,
        () => asStream(stdin),
      ).open(),
    ).toBe(stdin);
  });

  it("releases by pausing, never destroying the process's own stdin", () => {
    const stdin = fakeStream(true);
    const src = consoleStdin(
      () => true,
      () => asStream(stdin),
    );
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
