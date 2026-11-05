import { describe, it, expect, vi } from "vitest";
// Fake device signers return placeholder signatures; signing-service.test.ts covers the check.
vi.mock("../services/signing/signature-check.js", () => ({ assertSignedBy: () => {} }));

import { TypedDataService } from "./typed-data-service.js";
import type { SignerResolver } from "../services/signer/index.js";
import { SigningService } from "../services/signing/signing-service.js";
import type { Signer, TypedDataPayload } from "../../domain/types/index.js";
import { CommandDeadline } from "../services/command-deadline.js";

const MAINNET = { id: "tron:728126428", family: "tron", chainId: "728126428" } as never;
const NILE = { id: "tron:3448148188", family: "tron", chainId: "3448148188" } as never;
const SEPOLIA = { id: "eip155:11155111", family: "evm", chainId: "11155111" } as never;

const payload = (domain: Record<string, unknown>): TypedDataPayload => ({
  domain: { name: "SunPerp", version: "1", ...domain },
  types: { Order: [{ name: "size", type: "uint256" }] },
  message: { size: "1" },
});
const PAYLOAD = payload({ chainId: 728126428 });

function serviceWith(signer: Partial<Signer>, assertCanSign = () => {}) {
  return new TypedDataService(
    { resolve: () => signer as Signer, assertCanSign } as unknown as SignerResolver,
    new SigningService({} as never),
  );
}

const scope = () => ({
  deadline: new CommandDeadline(0),
  warnings: [] as string[],
  events: [] as unknown[],
  emit(e: unknown) {
    this.events.push(e);
  },
  warn(m: string) {
    this.warnings.push(m);
  },
});

const signTypedData = () =>
  vi.fn(async () => ({ signature: "0xsig", digest: "0xdig", primaryType: "Order" }));
const software = (sign = signTypedData()) => ({
  kind: "software" as const,
  address: "TSigner",
  signTypedData: sign,
});
const ledger = (sign = signTypedData(), precheck = vi.fn(async () => {})) => ({
  kind: "device" as const,
  address: "TLedger",
  precheck,
  signTypedData: sign,
});

describe("TypedDataService", () => {
  it("returns the signature with the signing address and echoed primaryType", async () => {
    const s = scope();
    const out = await serviceWith(software()).sign(s as never, MAINNET, "main", PAYLOAD);
    expect(out).toEqual({
      address: "TSigner",
      primaryType: "Order",
      digest: "0xdig",
      signature: "0xsig",
    });
    expect(s.warnings).toEqual([]);
  });

  it("prechecks and announces a device signer", async () => {
    const s = scope();
    await serviceWith(ledger()).sign(s as never, MAINNET, "main", PAYLOAD);
    expect(s.events).toEqual([{ type: "awaiting_device", reason: "sign" }]);
  });

  it("refuses an account that cannot sign", async () => {
    const svc = serviceWith(software(), () => {
      throw new Error("watch-only");
    });
    await expect(svc.sign(scope() as never, MAINNET, "main", PAYLOAD)).rejects.toThrow(
      /watch-only/,
    );
  });

  it.each([728126428, "728126428", "0x2b6653dc"])(
    "signs a TRON mainnet domain whose chainId is %j",
    async (chainId) => {
      const sign = signTypedData();
      await serviceWith(software(sign)).sign(
        scope() as never,
        MAINNET,
        "main",
        payload({ chainId }),
      );
      expect(sign).toHaveBeenCalledOnce();
    },
  );

  it("signs a domain without chainId as is", async () => {
    const sign = signTypedData();
    await serviceWith(software(sign)).sign(scope() as never, NILE, "main", payload({}));
    expect(sign).toHaveBeenCalledOnce();
  });

  describe.each([
    ["TRON", NILE, 728126428],
    ["EVM", SEPOLIA, 56],
  ])("on %s", (_family, network, foreignChainId) => {
    it.each([
      ["software", software],
      ["Ledger", ledger],
    ])(
      "refuses a %s signature for another chain before any signer interaction",
      async (_kind, make) => {
        const sign = signTypedData();
        const precheck = vi.fn(async () => {});
        const signer = make === ledger ? ledger(sign, precheck) : software(sign);
        const s = scope();
        await expect(
          serviceWith(signer).sign(
            s as never,
            network,
            "main",
            payload({ chainId: foreignChainId }),
          ),
        ).rejects.toMatchObject({ code: "chain_id_mismatch" });
        expect(sign).not.toHaveBeenCalled();
        expect(precheck).not.toHaveBeenCalled();
        expect(s.events).toEqual([]);
      },
    );
  });

  it.each([["nile"], [""], [1.5], [null], [{}]])(
    "refuses a domain chainId %j that is not an integer",
    async (chainId) => {
      const sign = signTypedData();
      await expect(
        serviceWith(software(sign)).sign(scope() as never, NILE, "main", payload({ chainId })),
      ).rejects.toMatchObject({ code: "chain_id_mismatch" });
      expect(sign).not.toHaveBeenCalled();
    },
  );
});
