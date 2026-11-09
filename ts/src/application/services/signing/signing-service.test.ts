import { describe, it, expect, vi } from "vitest";
import { SigningService, type SignRequest } from "./signing-service.js";
import { CommandDeadline } from "../command-deadline.js";
import { DeadlineExpiredError } from "../../contracts/deadline.js";
import { ExecutionError } from "../../../domain/errors/index.js";
import type { Signer, TypedDataPayload, UnsignedTx } from "../../../domain/types/index.js";
import { createHash } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Transaction, TypedDataEncoder } from "ethers";
import { utils as tronUtils } from "tronweb";
import { addressCodec } from "../../../domain/family/index.js";
import { tronSignStrategy } from "../../../adapters/outbound/chain/tron/signing-strategy.js";
import { evmSignStrategy } from "../../../adapters/outbound/chain/evm/signing-strategy.js";

const NILE = { id: "tron:3448148188", family: "tron", chainId: "3448148188" } as never;
const SEPOLIA = { id: "eip155:11155111", family: "evm", chainId: "11155111" } as never;
const TX = { txID: "ab", raw_data: {}, raw_data_hex: "0a" } as unknown as UnsignedTx;

const RAW_DATA_HEX = "0a02abcd2208aabbccddeeff0011";
const TRON_TX = {
  txID: createHash("sha256").update(Buffer.from(RAW_DATA_HEX, "hex")).digest("hex"),
  raw_data: { contract: [] },
  raw_data_hex: RAW_DATA_HEX,
} as unknown as UnsignedTx & { txID: string; raw_data_hex: string; signature?: string[] };
const tronPayload = (tx: UnsignedTx = TRON_TX) => ({
  kind: "transaction" as const,
  transaction: tx,
});

function newKey() {
  const secret = secp256k1.utils.randomSecretKey();
  const pub = secp256k1.getPublicKey(secret, false);
  return {
    pkHex: `0x${bytesToHex(secret)}`,
    tron: addressCodec("tron").fromPublicKey(pub),
    evm: addressCodec("evm").fromPublicKey(pub),
  };
}

function tronSignature(key: ReturnType<typeof newKey>, tx: { txID: string }): string {
  const sig = secp256k1.sign(Buffer.from(tx.txID, "hex"), Buffer.from(key.pkHex.slice(2), "hex"), {
    prehash: false,
    format: "recovered",
  });
  return `${bytesToHex(sig.slice(1))}${(27 + sig[0]!).toString(16)}`;
}

const scope = (limitMs = 50) => ({
  deadline: new CommandDeadline(limitMs),
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
    const key = newKey();
    const device = {
      kind: "device",
      address: key.tron,
      signMessage: async (m: string, opts: { onWarning?: (m: string) => void }) => {
        opts.onWarning?.("fallback");
        return tronSignStrategy.signMessage(key.pkHex, m);
      },
    } as unknown as Signer;
    const s = scope(0);
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

  it.each(["transaction", "message"] as const)(
    "does not run a software signer for a %s after the deadline has expired",
    async (kind) => {
      const clock = { now: () => 0 };
      const s = { ...scope(), deadline: new CommandDeadline(10, 0, clock) };
      clock.now = () => 10;
      const signer = { ...softwareSigner(), signMessage: vi.fn() } as unknown as Signer & {
        sign: ReturnType<typeof vi.fn>;
        signMessage: ReturnType<typeof vi.fn>;
      };
      const request =
        kind === "transaction"
          ? transaction(signer)
          : {
              network: NILE,
              origin: "imported" as const,
              signer,
              payload: { kind: "message" as const, message: "hi" },
            };
      await expect(serviceWith().sign(s, request as never)).rejects.toBeInstanceOf(
        DeadlineExpiredError,
      );
      expect(signer.sign).not.toHaveBeenCalled();
      expect(signer.signMessage).not.toHaveBeenCalled();
    },
  );

  it("prechecks and announces the device before a device signature", async () => {
    const precheck = vi.fn(async () => {});
    const key = newKey();
    const signed = { ...TRON_TX, signature: [tronSignature(key, TRON_TX)] };
    const device = { kind: "device", address: key.tron, precheck, sign: async () => signed };
    const s = scope(0);
    await expect(
      serviceWith().sign(s, { ...transaction(device as never), payload: tronPayload() }),
    ).resolves.toBe(signed);
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

  it("reports a device cancelled by the deadline as timeout, a user cancellation as cancelled", async () => {
    const cancelling = (afterAbort: boolean) => ({
      kind: "device",
      address: "T1",
      precheck: async () => {},
      sign: (_tx: unknown, opts: { signal?: AbortSignal }) =>
        new Promise((_res, rej) => {
          const cancel = () => rej(new ExecutionError("cancelled", "rejected on the device"));
          if (afterAbort) opts.signal?.addEventListener("abort", cancel);
          else cancel();
        }),
    });
    await expect(
      serviceWith().sign(scope(), transaction(cancelling(true) as never)),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
    await expect(
      serviceWith().sign(scope(0), transaction(cancelling(false) as never)),
    ).rejects.toMatchObject({ code: "cancelled" });
  });

  it("does not ask the device after the deadline has expired", async () => {
    const sign = vi.fn();
    const clock = { now: () => 0 };
    const s = { ...scope(), deadline: new CommandDeadline(10, 0, clock) };
    clock.now = () => 10;
    const device = { kind: "device", address: "T1", precheck: async () => {}, sign };
    await expect(serviceWith().sign(s, transaction(device as never))).rejects.toBeInstanceOf(
      DeadlineExpiredError,
    );
    expect(sign).not.toHaveBeenCalled();
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

describe("SigningService device signature check", () => {
  const evmGateway = {
    unsignedTransactionHash: (tx: never) => Transaction.from(tx).unsignedHash,
    signedTransactionParts: (raw: string) => {
      try {
        const parsed = Transaction.from(raw);
        return { unsignedHash: parsed.unsignedHash, signature: parsed.signature!.serialized };
      } catch {
        return undefined;
      }
    },
    typedDataDigest: (p: TypedDataPayload) => TypedDataEncoder.hash(p.domain, p.types, p.message),
    transactionChainId: () => "11155111",
  };
  const tronGateway = {
    typedDataDigest: (p: TypedDataPayload) =>
      tronUtils.typedData.TypedDataEncoder.hash(p.domain as never, p.types as never, p.message),
  };
  const service = () =>
    new SigningService({
      get: (_n: unknown, family: string) => (family === "evm" ? evmGateway : tronGateway),
    } as never);
  const device = (address: string, methods: Record<string, unknown>) =>
    ({ kind: "device", address, precheck: async () => {}, ...methods }) as unknown as Signer;
  const request = <P extends SignRequest["payload"]>(
    signer: Signer,
    payload: P,
    network = NILE,
  ) => ({
    network,
    origin: "built" as const,
    signer,
    payload,
  });
  const EVM_TX = {
    type: 2,
    to: "0x000000000000000000000000000000000000dEaD",
    nonce: 0,
    gasLimit: "21000",
    maxFeePerGas: "1000000000",
    maxPriorityFeePerGas: "1",
    value: "1",
    chainId: 11155111,
  } as UnsignedTx;
  const TYPED: TypedDataPayload = {
    domain: { name: "T", version: "1" },
    types: { Mail: [{ name: "contents", type: "string" }] },
    primaryType: "Mail",
    message: { contents: "hi" },
  };

  it("refuses a TRON device reply that is not a signature, before returning it", async () => {
    const key = newKey();
    const sign = vi.fn(async () => ({ ...TRON_TX, signature: ["6985009000aa"] }));
    await expect(
      service().sign(scope(0), request(device(key.tron, { sign }), tronPayload())),
    ).rejects.toMatchObject({ code: "signed_payload_mismatch" });
    expect(sign).toHaveBeenCalledOnce();
  });

  it("refuses a TRON signature by another key or over other bytes", async () => {
    const key = newKey();
    const other = newKey();
    const byOther = { ...TRON_TX, signature: [tronSignature(other, TRON_TX)] };
    await expect(
      service().sign(
        scope(0),
        request(device(key.tron, { sign: async () => byOther }), tronPayload()),
      ),
    ).rejects.toMatchObject({ code: "signed_payload_mismatch" });
    const rewritten = {
      ...TRON_TX,
      raw_data_hex: "0a02abce",
      signature: [tronSignature(key, TRON_TX)],
    };
    await expect(
      service().sign(
        scope(0),
        request(device(key.tron, { sign: async () => rewritten }), tronPayload()),
      ),
    ).rejects.toMatchObject({ code: "signed_payload_mismatch" });
  });

  it("checks only the signature a multisig signer added", async () => {
    const key = newKey();
    const prior = tronSignature(newKey(), TRON_TX);
    const sent = { ...TRON_TX, signature: [prior] };
    const added = { ...sent, signature: [prior, tronSignature(key, TRON_TX)] };
    await expect(
      service().sign(
        scope(0),
        request(device(key.tron, { sign: async () => added }), tronPayload(sent)),
      ),
    ).resolves.toBe(added);
    await expect(
      service().sign(
        scope(0),
        request(device(key.tron, { sign: async () => sent }), tronPayload(sent)),
      ),
    ).rejects.toMatchObject({ code: "signed_payload_mismatch" });
    const dropped = { ...sent, signature: [tronSignature(key, TRON_TX)] };
    await expect(
      service().sign(
        scope(0),
        request(device(key.tron, { sign: async () => dropped }), tronPayload(sent)),
      ),
    ).rejects.toMatchObject({ code: "signed_payload_mismatch" });
  });

  it.each(["tron", "evm"] as const)("checks a %s message signature", async (family) => {
    const key = newKey();
    const network = family === "tron" ? NILE : SEPOLIA;
    const strategy = family === "tron" ? tronSignStrategy : evmSignStrategy;
    const good = device(key[family], {
      signMessage: (m: string) => strategy.signMessage(key.pkHex, m),
    });
    const payload = { kind: "message" as const, message: "hi" };
    await expect(service().sign(scope(0), request(good, payload, network))).resolves.toMatch(/^0x/);
    const wrongMessage = device(key[family], {
      signMessage: () => strategy.signMessage(key.pkHex, "other"),
    });
    await expect(
      service().sign(scope(0), request(wrongMessage, payload, network)),
    ).rejects.toMatchObject({ code: "signed_payload_mismatch" });
  });

  it.each(["tron", "evm"] as const)(
    "checks a %s typed-data signature and digest",
    async (family) => {
      const key = newKey();
      const network = family === "tron" ? NILE : SEPOLIA;
      const strategy = family === "tron" ? tronSignStrategy : evmSignStrategy;
      const payload = { kind: "typed-data" as const, typedData: TYPED };
      const good = device(key[family], {
        signTypedData: (p: TypedDataPayload) => strategy.signTypedData(key.pkHex, p),
      });
      await expect(
        service().sign(scope(0), request(good, payload, network)),
      ).resolves.toMatchObject({
        primaryType: "Mail",
      });
      const otherStruct = device(key[family], {
        signTypedData: () =>
          strategy.signTypedData(key.pkHex, { ...TYPED, message: { contents: "bye" } }),
      });
      await expect(
        service().sign(scope(0), request(otherStruct, payload, network)),
      ).rejects.toMatchObject({ code: "signed_payload_mismatch" });
      const otherKey = newKey();
      const byOther = device(key[family], {
        signTypedData: (p: TypedDataPayload) => strategy.signTypedData(otherKey.pkHex, p),
      });
      await expect(
        service().sign(scope(0), request(byOther, payload, network)),
      ).rejects.toMatchObject({
        code: "signed_payload_mismatch",
      });
    },
  );

  it("checks an EVM transaction signature against the transaction sent", async () => {
    const key = newKey();
    const payload = { kind: "transaction" as const, transaction: EVM_TX };
    const good = device(key.evm, { sign: (tx: UnsignedTx) => evmSignStrategy.sign(key.pkHex, tx) });
    await expect(service().sign(scope(0), request(good, payload, SEPOLIA))).resolves.toHaveProperty(
      "raw",
    );
    const otherTx = device(key.evm, {
      sign: () => evmSignStrategy.sign(key.pkHex, { ...EVM_TX, nonce: 1 } as UnsignedTx),
    });
    await expect(
      service().sign(scope(0), request(otherTx, payload, SEPOLIA)),
    ).rejects.toMatchObject({
      code: "signed_payload_mismatch",
    });
    const byOther = newKey();
    const otherKey = device(key.evm, {
      sign: (tx: UnsignedTx) => evmSignStrategy.sign(byOther.pkHex, tx),
    });
    await expect(
      service().sign(scope(0), request(otherKey, payload, SEPOLIA)),
    ).rejects.toMatchObject({
      code: "signed_payload_mismatch",
    });
    const truncated = device(key.evm, { sign: async () => ({ raw: "0x02", hash: "0x00" }) });
    await expect(
      service().sign(scope(0), request(truncated, payload, SEPOLIA)),
    ).rejects.toMatchObject({
      code: "signed_payload_mismatch",
    });
  });
});
