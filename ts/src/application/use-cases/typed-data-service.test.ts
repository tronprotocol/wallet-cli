import { describe, it, expect } from "vitest";
import { TypedDataService } from "./typed-data-service.js";
import type { SignerResolver } from "../services/signer/index.js";
import type { Signer } from "../../domain/types/index.js";

const PAYLOAD = {
  domain: { name: "SunPerp", version: "1", chainId: 728126428 },
  types: { Order: [{ name: "size", type: "uint256" }] },
  message: { size: "1" },
};

function serviceWith(signer: Partial<Signer>, assertCanSign = () => {}) {
  return new TypedDataService({ resolve: () => signer as Signer, assertCanSign } as unknown as SignerResolver);
}

const scope = () => ({
  timeoutMs: 100,
  warnings: [] as string[],
  events: [] as unknown[],
  emit(e: unknown) {
    this.events.push(e);
  },
  warn(m: string) {
    this.warnings.push(m);
  },
});

const signing = {
  kind: "software" as const,
  address: "TSigner",
  signTypedData: async () => ({ signature: "0xsig", digest: "0xdig", primaryType: "Order" }),
};

describe("TypedDataService", () => {
  it("returns the signature with the signing address and echoed primaryType", async () => {
    const s = scope();
    const out = await serviceWith(signing).sign(s as never, "tron", "main", PAYLOAD);
    expect(out).toEqual({ address: "TSigner", primaryType: "Order", digest: "0xdig", signature: "0xsig" });
    expect(s.warnings).toEqual([]);
  });



  it("prechecks and announces a device signer", async () => {
    const s = scope();
    await serviceWith({
      kind: "device",
      address: "TLedger",
      precheck: async () => {},
      signTypedData: async () => ({ signature: "0xsig", digest: "0xdig", primaryType: "Order" }),
    }).sign(s as never, "tron", "main", PAYLOAD);
    expect(s.events).toEqual([{ type: "awaiting_device", reason: "sign" }]);
  });

  it("refuses an account that cannot sign", async () => {
    const svc = serviceWith(signing, () => {
      throw new Error("watch-only");
    });
    await expect(svc.sign(scope() as never, "tron", "main", PAYLOAD)).rejects.toThrow(/watch-only/);
  });
});
