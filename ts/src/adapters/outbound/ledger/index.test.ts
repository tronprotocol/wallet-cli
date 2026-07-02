import { describe, it, expect, vi } from "vitest";
import { Ledger } from "./index.js";

// The @ledgerhq transport/app modules are imported lazily inside the adapter, so hoisted vi.mock
// applies. The mocked device never resolves signPersonalMessage — models a prompt that is never tapped.
vi.mock("@ledgerhq/hw-transport-node-hid", () => ({
  default: { open: async () => ({ close: async () => {} }) },
}));
vi.mock("@ledgerhq/hw-app-trx", () => ({
  default: class {
    async signPersonalMessage(): Promise<string> {
      return new Promise(() => {}); // never resolves
    }
  },
}));

const PATH = "m/44'/195'/0'/0/0";

describe("Ledger adapter timeout", () => {
  it("bounds a hung device signMessage by timeoutMs", async () => {
    await expect(new Ledger(20).signMessage("tron", PATH, "hi")).rejects.toMatchObject({ code: "timeout" });
  });
});
