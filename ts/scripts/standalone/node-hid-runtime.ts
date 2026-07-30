import { EventEmitter } from "node:events";

interface NativeHid {
  close(): void;
  read(callback: (error: Error | null, data?: number[]) => void): void;
}

interface NativeBinding {
  HID: new (...args: unknown[]) => NativeHid;
  devices(...args: unknown[]): unknown[];
}

/**
 * Build the small JavaScript facade exposed by `node-hid`.
 *
 * `node-hid` normally locates its N-API addon through the dynamic `bindings()` helper. A Bun
 * executable has no package directory at runtime, so that lookup cannot work. The two platform
 * entry modules import the addon statically and pass it here; Bun can then embed and extract the
 * native file as part of the executable.
 */
export function createNodeHid(binding: NativeBinding) {
  class HID extends EventEmitter {
    private readonly raw: NativeHid;
    private paused = true;
    private closing = false;
    private closed = false;

    constructor(...args: unknown[]) {
      super();
      this.raw = new binding.HID(...args);

      // Preserve node-hid's public surface without maintaining a second list of native methods.
      for (const method in binding.HID.prototype) {
        if (method in this) continue;
        (this as Record<string, unknown>)[method] = (
          binding.HID.prototype as unknown as Record<string, (...values: unknown[]) => unknown>
        )[method]!.bind(this.raw);
      }

      this.on("newListener", (eventName) => {
        if (eventName === "data") process.nextTick(() => this.resume());
      });
    }

    close(): void {
      this.closing = true;
      this.removeAllListeners();
      this.raw.close();
      this.closed = true;
    }

    pause(): void {
      this.paused = true;
    }

    read(callback: (error: Error | null, data?: number[]) => void): void {
      if (this.closed) throw new Error("Unable to read from a closed HID device");
      this.raw.read(callback);
    }

    resume(): void {
      if (!this.paused || this.listenerCount("data") === 0) return;
      this.paused = false;
      const readNext = (error: Error | null, data?: number[]): void => {
        if (error) {
          this.paused = true;
          if (!this.closing) this.emit("error", error);
          return;
        }
        if (this.listenerCount("data") === 0) this.paused = true;
        if (!this.paused) this.read(readNext);
        this.emit("data", data);
      };
      this.read(readNext);
    }
  }

  return {
    HID,
    devices: (...args: unknown[]) => binding.devices(...args),
    // The standalone Linux build statically selects hidraw; keep this method for API compatibility.
    setDriverType: (_type: string) => {},
  };
}
