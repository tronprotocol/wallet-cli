import { describe, it, expect, vi } from "vitest";
import { SigningService, type SignRequest } from "./signing-service.js";
import type { Signer, TypedDataPayload } from "../../../domain/types/index.js";

const NILE = { id: "tron:3448148188", family: "tron", chainId: "3448148188" } as never;
const SEPOLIA = { id: "eip155:11155111", family: "evm", chainId: "11155111" } as never;
const TX = { txID: "ab", raw_data: {}, raw_data_hex: "0a" };

const scope = () => ({
  timeoutMs: 50,
  emitted: [] as unknown[],
  emit(e: unknown) {
    this.emitted.push(e);
  },
  warn: vi.fn(),
});

const softwareSigner = (sign = vi.fn(async (tx: unknown) => tx)) =>
  ({ kind: "software", address: "T1", sign }) as unknown as Signer & { sign: typeof sign };

function serviceWith(gateway: Record<string, unknown> = {}) {
  return new SigningService({ get: () => gateway } as never);
}

const transaction = (signer: Signer, network = NILE, origin: SignRequest["origin"] = "built") => ({
  network,
  origin,
  signer,
  payload: { kind: "transaction" as const, transaction: TX },
});

describe("SigningService device handling", () => {
  it("routes device fallback warnings to the command scope", async () => {
    const device = {
      kind: "device",
      address: "T1",
      signMessage: async (_m: string, opts: { onWarning?: (m: string) => void }) => {
        opts.onWarning?.("fallback");
        return "sig";
      },
    } as unknown as Signer;
    const s = scope();
    await serviceWith().sign(s, {
      network: NILE,
      origin: "imported",
      signer: device,
      payload: { kind: "message", message: "hi" },
    });
    expect(s.warn).toHaveBeenCalledWith("fallback");
  });

  it("runs a software signer directly with no device event", async () => {
    const s = scope();
    const signer = softwareSigner();
    await expect(serviceWith().sign(s, transaction(signer))).resolves.toEqual(TX);
    expect(signer.sign).toHaveBeenCalledWith(TX, {});
    expect(s.emitted).toEqual([]);
  });

  it("prechecks and announces the device before a device signature", async () => {
    const precheck = vi.fn(async () => {});
    const device = { kind: "device", address: "T1", precheck, sign: async () => "sig" };
    const s = scope();
    await expect(serviceWith().sign(s, transaction(device as never))).resolves.toBe("sig");
    expect(precheck).toHaveBeenCalledOnce();
    expect(s.emitted).toEqual([{ type: "awaiting_device", reason: "sign" }]);
  });

  it("bounds a hung device signature and aborts it", async () => {
    let aborted = false;
    const device = {
      kind: "device",
      address: "T1",
      precheck: async () => {},
      sign: (_tx: unknown, opts: { signal?: AbortSignal }) =>
        new Promise((_res, rej) => {
          opts.signal?.addEventListener("abort", () => {
            aborted = true;
            rej(new Error("aborted"));
          });
        }),
    };
    await expect(serviceWith().sign(scope(), transaction(device as never))).rejects.toMatchObject({
      code: "timeout",
    });
    expect(aborted).toBe(true);
  });

  it("propagates a precheck failure without signing", async () => {
    const sign = vi.fn();
    const device = {
      kind: "device",
      address: "T1",
      precheck: async () => {
        throw new Error("wrong device");
      },
      sign,
    };
    await expect(serviceWith().sign(scope(), transaction(device as never))).rejects.toThrow(
      /wrong device/,
    );
    expect(sign).not.toHaveBeenCalled();
  });
});

describe("SigningService chain identity", () => {
  it("refuses an EVM transaction for another chain whatever its origin", async () => {
    for (const origin of ["built", "service", "imported", "offline"] as const) {
      const signer = softwareSigner();
      const service = serviceWith({ transactionChainId: () => "1" });
      await expect(
        service.sign(scope(), transaction(signer, SEPOLIA, origin)),
      ).rejects.toMatchObject({ code: "chain_id_mismatch" });
      expect(signer.sign).not.toHaveBeenCalled();
    }
  });

  it("refuses an EVM transaction that names no chain", async () => {
    const signer = softwareSigner();
    const service = serviceWith({ transactionChainId: () => undefined });
    await expect(service.sign(scope(), transaction(signer, SEPOLIA))).rejects.toMatchObject({
      code: "chain_id_mismatch",
    });
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it("signs an EVM transaction for the named chain", async () => {
    const signer = softwareSigner();
    const service = serviceWith({ transactionChainId: () => "11155111" });
    await service.sign(scope(), transaction(signer, SEPOLIA, "imported"));
    expect(signer.sign).toHaveBeenCalledOnce();
  });

  it("checks the reference block of a TRON transaction from a service", async () => {
    const referenceBlockStatus = vi.fn(async () => "different");
    const signer = softwareSigner();
    await expect(
      serviceWith({ referenceBlockStatus }).sign(scope(), transaction(signer, NILE, "service")),
    ).rejects.toMatchObject({ code: "chain_id_mismatch" });
    expect(referenceBlockStatus).toHaveBeenCalledWith(TX);
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it("reads no node for a TRON transaction this app built", async () => {
    const referenceBlockStatus = vi.fn();
    const s = scope();
    await serviceWith({ referenceBlockStatus }).sign(s, transaction(softwareSigner()));
    expect(referenceBlockStatus).not.toHaveBeenCalled();
    expect(s.warn).not.toHaveBeenCalled();
  });

  it("checks typed data against the named network", async () => {
    const typedData: TypedDataPayload = {
      domain: { chainId: "0x1" },
      types: { T: [{ name: "a", type: "uint256" }] },
      message: { a: "1" },
    };
    const signTypedData = vi.fn();
    const signer = { kind: "software", address: "T1", signTypedData } as unknown as Signer;
    await expect(
      serviceWith().sign(scope(), {
        network: NILE,
        origin: "built",
        signer,
        payload: { kind: "typed-data", typedData },
      }),
    ).rejects.toMatchObject({ code: "chain_id_mismatch" });
    expect(signTypedData).not.toHaveBeenCalled();
  });
});
