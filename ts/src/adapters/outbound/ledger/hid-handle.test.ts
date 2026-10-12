import { expect, it, vi } from "vitest";
import Hid from "@ledgerhq/hw-transport-node-hid-noevents";
import { hidHandle } from "./hid-handle.js";
it("closes the native device without awaiting the Ledger transport's pending APDU", async () => {
  const transport = Object.create(Hid.prototype);
  let release!: () => void;
  transport.exchangeBusyPromise = new Promise<void>((r) => {
    release = r;
  });
  transport.device = { close: vi.fn() };
  const handle = hidHandle(transport);
  handle.abort();
  await handle.close();
  expect(transport.device.close).toHaveBeenCalledTimes(1);
  release();
});
it("uses the ordinary close path once after a completed operation", async () => {
  const close = vi.fn(async () => {});
  const handle = hidHandle({ close });
  await handle.close();
  await handle.close();
  expect(close).toHaveBeenCalledTimes(1);
});
