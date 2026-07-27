import { describe, it, expect, vi } from "vitest";
import { obtainSignature } from "./obtain-signature.js";
import type { Signer } from "../../../domain/types/index.js";

const scope = () => ({
  timeoutMs: 50,
  emitted: [] as unknown[],
  emit(e: unknown) {
    this.emitted.push(e);
  },
});

const softwareSigner = { kind: "software", address: "T1" } as unknown as Signer;

describe("obtainSignature", () => {
  it("runs a software signer directly with no device event", async () => {
    const s = scope();
    const out = await obtainSignature(softwareSigner, s, async () => "sig");
    expect(out).toBe("sig");
    expect(s.emitted).toEqual([]);
  });

  it("prechecks and announces the device before a device signature", async () => {
    const precheck = vi.fn(async () => {});
    const device = { kind: "device", address: "T1", precheck } as unknown as Signer;
    const s = scope();
    const out = await obtainSignature(device, s, async () => "sig");
    expect(precheck).toHaveBeenCalledOnce();
    expect(s.emitted).toEqual([{ type: "awaiting_device", reason: "sign" }]);
    expect(out).toBe("sig");
  });

  // A device prompt that is never tapped must not hang the CLI, and must abort the pending APDU.
  it("bounds a hung device signature and aborts it", async () => {
    const device = { kind: "device", address: "T1", precheck: async () => {} } as unknown as Signer;
    const s = scope();
    let aborted = false;
    await expect(
      obtainSignature(device, s, (opts) =>
        new Promise((_res, rej) => {
          opts.signal?.addEventListener("abort", () => {
            aborted = true;
            rej(new Error("aborted"));
          });
        }),
      ),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(aborted).toBe(true);
  });

  // A failing precheck (wrong seed / locked device) must surface before anything is signed.
  it("propagates a precheck failure without signing", async () => {
    const produce = vi.fn(async () => "sig");
    const device = {
      kind: "device",
      address: "T1",
      precheck: async () => {
        throw new Error("wrong device");
      },
    } as unknown as Signer;
    await expect(obtainSignature(device, scope(), produce)).rejects.toThrow(/wrong device/);
    expect(produce).not.toHaveBeenCalled();
  });
});
