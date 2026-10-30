import { describe, it, expect, vi } from "vitest";
import { utils as tronUtils } from "tronweb";
import { Ledger } from "./index.js";
import { assertTronTxIntegrity } from "../chain/tron/tx-integrity.js";
import { ChainError } from "../../../domain/errors/index.js";

const { closeSpy, transactionSignSpy, hashSignSpy, tip712Calls, failures } = vi.hoisted(() => ({
  closeSpy: vi.fn(async () => {}),
  transactionSignSpy: vi.fn(
    async (_path: string, _raw: string, _tokens: string[]): Promise<string> =>
      new Promise(() => {}),
  ),
  hashSignSpy: vi.fn(async (_path: string, _hash: string): Promise<string> => "bb".repeat(65)),
  tip712Calls: [] as Array<{ path: string; domainHash: string; messageHash: string }>,
  failures: {
    tip712: undefined as Error | undefined,
    tip712Hang: false,
    tip712Signature: "aa".repeat(64) + "00",
    open: undefined as Error | undefined,
  },
}));
vi.mock("@ledgerhq/hw-transport-node-hid-noevents", () => ({
  default: {
    open: async () => {
      if (failures.open) throw failures.open;
      return { close: closeSpy };
    },
  },
}));
vi.mock("@ledgerhq/hw-app-trx", () => ({
  default: class {
    async signPersonalMessage(): Promise<string> {
      return new Promise(() => {});
    }
    signTransaction(path: string, raw: string, tokens: string[]): Promise<string> {
      return transactionSignSpy(path, raw, tokens);
    }
    signTransactionHash(path: string, hash: string): Promise<string> {
      return hashSignSpy(path, hash);
    }
    async getAddress(): Promise<{ publicKey: string; address: string }> {
      return new Promise(() => {});
    }
    async getAppConfiguration(): Promise<{ version: string }> {
      return new Promise(() => {});
    }
    async signTIP712HashedMessage(
      path: string,
      domainHash: string,
      messageHash: string,
    ): Promise<string> {
      if (failures.tip712) throw failures.tip712;
      if (failures.tip712Hang) return new Promise(() => {});
      tip712Calls.push({ path, domainHash, messageHash });
      return failures.tip712Signature;
    }
  },
}));

const PATH = "m/44'/195'/0'/0/0";
// Valid bytes and txID let timeout tests reach the device instead of failing integrity checks.
const RAW_TX = (() => {
  const raw = {
    contract: [
      {
        parameter: {
          value: {
            amount: 1000000,
            owner_address: "4119e7e376e7c213b7e7e7e46cc70a5dd086daff2a",
            to_address: "41e552f6487585c2b58bc2c9bb4492bc1f17132cd0",
          },
          type_url: "type.googleapis.com/protocol.TransferContract",
        },
        type: "TransferContract",
      },
    ],
    ref_block_bytes: "0a1b",
    ref_block_hash: "c1e5f0a1d2b3c4d5",
    expiration: 1753180800000,
    timestamp: 1753180740000,
  };
  const shell = { visible: false, raw_data: raw, raw_data_hex: "", txID: "" };
  const pb = tronUtils.transaction.txJsonToPb(shell as never);
  return {
    ...shell,
    raw_data_hex: tronUtils.transaction.txPbToRawDataHex(pb).toLowerCase(),
    txID: tronUtils.transaction.txPbToTxID(pb).replace(/^0x/, ""),
  } as never;
})();

describe("Ledger adapter timeout", () => {
  it("bounds a hung device signMessage by timeoutMs", async () => {
    await expect(
      new Ledger(assertTronTxIntegrity, 20).signMessage("tron", PATH, "hi"),
    ).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("closes the transport when a hung signMessage times out", async () => {
    closeSpy.mockClear();
    await expect(
      new Ledger(assertTronTxIntegrity, 20).signMessage("tron", PATH, "hi"),
    ).rejects.toMatchObject({
      code: "timeout",
    });
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 500 });
  });

  it("closes the transport when a hung signTransaction times out", async () => {
    closeSpy.mockClear();
    await expect(
      new Ledger(assertTronTxIntegrity, 20).signTransaction("tron", PATH, RAW_TX),
    ).rejects.toMatchObject({
      code: "timeout",
    });
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 500 });
  });

  it("closes the transport when a hung getAddress times out", async () => {
    closeSpy.mockClear();
    await expect(
      new Ledger(assertTronTxIntegrity, 20).getAddress("tron", PATH),
    ).rejects.toMatchObject({
      code: "timeout",
    });
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 500 });
  });

  it("closes the transport when a hung appConfig times out", async () => {
    closeSpy.mockClear();
    await expect(new Ledger(assertTronTxIntegrity, 20).appConfig("tron")).rejects.toMatchObject({
      code: "timeout",
    });
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 500 });
  });
});

describe("Ledger transaction signing", () => {
  it("falls back only on the SDK packing limit, warns, and preserves earlier signatures", async () => {
    transactionSignSpy.mockRejectedValueOnce(new Error("Too many bytes to encode."));
    hashSignSpy.mockClear();
    const warning = vi.fn();
    const tx = { ...(RAW_TX as object), signature: ["earlier-signature"] };
    const signed = await new Ledger(assertTronTxIntegrity, 2000).signTransaction(
      "tron",
      PATH,
      tx as never,
      undefined,
      {
        onWarning: warning,
      },
    );
    expect(transactionSignSpy).toHaveBeenLastCalledWith(
      "44'/195'/0'/0/0",
      (RAW_TX as { raw_data_hex: string }).raw_data_hex,
      [],
    );
    expect(hashSignSpy).toHaveBeenCalledWith("44'/195'/0'/0/0", (RAW_TX as { txID: string }).txID);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("falling back to hash signing"));
    expect(warning.mock.invocationCallOrder[0]).toBeLessThan(
      hashSignSpy.mock.invocationCallOrder[0]!,
    );
    expect(signed).toMatchObject({ ...tx, signature: ["earlier-signature", "bb".repeat(65)] });
  });

  it("keeps full transaction signing for encodable transactions", async () => {
    transactionSignSpy.mockResolvedValueOnce("cc".repeat(65));
    hashSignSpy.mockClear();
    const warning = vi.fn();
    const signed = await new Ledger(assertTronTxIntegrity, 2000).signTransaction(
      "tron",
      PATH,
      RAW_TX,
      undefined,
      {
        onWarning: warning,
      },
    );
    expect(signed).toMatchObject({ signature: ["cc".repeat(65)] });
    expect(hashSignSpy).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it.each([
    Object.assign(new Error("declined"), { statusCode: 0x6985 }),
    Object.assign(new Error("bad payload"), { statusCode: 0x6a80 }),
    Object.assign(new Error("Too many bytes to encode."), { statusCode: 0x6985 }),
    new Error("transport disconnected"),
  ])("does not fall back on other signing errors: %s", async (error) => {
    transactionSignSpy.mockRejectedValueOnce(error);
    hashSignSpy.mockClear();
    await expect(
      new Ledger(assertTronTxIntegrity, 2000).signTransaction("tron", PATH, RAW_TX),
    ).rejects.toBeDefined();
    expect(hashSignSpy).not.toHaveBeenCalled();
  });

  it("checks transaction integrity before either signing path", async () => {
    hashSignSpy.mockClear();
    transactionSignSpy.mockClear();
    await expect(
      new Ledger(assertTronTxIntegrity, 2000).signTransaction("tron", PATH, {
        ...(RAW_TX as object),
        txID: "00".repeat(32),
      } as never),
    ).rejects.toMatchObject({ code: "tx_integrity" });
    expect(transactionSignSpy).not.toHaveBeenCalled();
    expect(hashSignSpy).not.toHaveBeenCalled();
  });

  it("retains the hash-signing app setting error after fallback", async () => {
    transactionSignSpy.mockRejectedValueOnce(new Error("Too many bytes to encode."));
    hashSignSpy.mockRejectedValueOnce(Object.assign(new Error("disabled"), { statusCode: 0x6a8c }));
    await expect(
      new Ledger(assertTronTxIntegrity, 2000).signTransaction("tron", PATH, RAW_TX),
    ).rejects.toMatchObject({
      code: "ledger_setting_required",
    });
  });

  it("bounds a hung hash signature after fallback", async () => {
    transactionSignSpy.mockRejectedValueOnce(new Error("Too many bytes to encode."));
    hashSignSpy.mockImplementationOnce(() => new Promise(() => {}));
    closeSpy.mockClear();
    await expect(
      new Ledger(assertTronTxIntegrity, 20).signTransaction("tron", PATH, RAW_TX),
    ).rejects.toMatchObject({
      code: "timeout",
    });
    expect(closeSpy).toHaveBeenCalled();
  });

  it("refuses a transaction whose txID does not hash its raw_data_hex, before reaching the device", async () => {
    const tampered = { ...(RAW_TX as object), txID: "00".repeat(32) };
    await expect(
      new Ledger(assertTronTxIntegrity, 2000).signTransaction("tron", PATH, tampered as never),
    ).rejects.toMatchObject({
      code: "tx_integrity",
    });
  });
});

describe("Ledger TRON integrity check", () => {
  it("runs the injected check on the transaction before reaching the device", async () => {
    transactionSignSpy.mockClear();
    const check = vi.fn(() => {
      throw new ChainError("tx_integrity", "refused");
    });
    await expect(
      new Ledger(check, 2000).signTransaction("tron", PATH, RAW_TX),
    ).rejects.toMatchObject({ code: "tx_integrity" });
    expect(check).toHaveBeenCalledWith(RAW_TX);
    expect(transactionSignSpy).not.toHaveBeenCalled();
  });
});

describe("Ledger abort signal", () => {
  it("closes the transport when the caller aborts a pending signMessage", async () => {
    closeSpy.mockClear();
    const ac = new AbortController();
    // Attach the rejection handler before aborting to avoid an unhandled rejection.
    const settled = new Ledger(assertTronTxIntegrity, 60_000)
      .signMessage("tron", PATH, "hi", ac.signal)
      .catch((e) => e);
    ac.abort();
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 1000 });
    expect(await settled).toMatchObject({ code: "cancelled" });
  });

  it("closes the transport when the caller aborts a pending typed-data signature", async () => {
    closeSpy.mockClear();
    const ac = new AbortController();
    failures.tip712Hang = true;
    try {
      const settled = new Ledger(assertTronTxIntegrity, 60_000)
        .signTypedData(
          "tron",
          PATH,
          {
            domain: { name: "X", version: "1", chainId: 1 },
            types: { A: [{ name: "x", type: "uint256" }] },
            message: { x: "1" },
          },
          ac.signal,
        )
        .catch((e) => e);
      ac.abort();
      await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 1000 });
      expect(await settled).toMatchObject({ code: "cancelled" });
    } finally {
      failures.tip712Hang = false;
    }
  });
});

describe("Ledger app-setting errors", () => {
  it("maps a missing app setting to an actionable error", async () => {
    const apdu = Object.assign(new Error("Ledger device: UNKNOWN_ERROR (0x6a8c)"), {
      statusCode: 0x6a8c,
    });
    failures.tip712 = apdu;
    try {
      await expect(
        new Ledger(assertTronTxIntegrity, 2000).signTypedData("tron", PATH, {
          domain: { name: "X", version: "1", chainId: 1 },
          types: { A: [{ name: "x", type: "uint256" }] },
          message: { x: "1" },
        }),
      ).rejects.toMatchObject({ code: "ledger_setting_required", message: /Sign by Hash/ });
    } finally {
      failures.tip712 = undefined;
    }
  });
});

describe("Ledger unsupported instruction (0x6d00)", () => {
  it("maps INS_NOT_SUPPORTED to a generic, chain-agnostic ledger_unsupported error", async () => {
    const apdu = Object.assign(new Error("Ledger device: INS_NOT_SUPPORTED (0x6d00)"), {
      statusCode: 0x6d00,
    });
    failures.tip712 = apdu;
    let err: unknown;
    try {
      await new Ledger(assertTronTxIntegrity, 2000).signTypedData("tron", PATH, {
        domain: { name: "X", version: "1", chainId: 1 },
        types: { A: [{ name: "x", type: "uint256" }] },
        message: { x: "1" },
      });
    } catch (e) {
      err = e;
    } finally {
      failures.tip712 = undefined;
    }
    const m = err as { code?: string; message: string };
    expect(m.code).toBe("ledger_unsupported");
    expect(m.message).toMatch(/does not support this operation/i);
    expect(m.message).not.toMatch(/tip-?712|tron|typed[- ]?data|eip-?712/i);
  });
});

describe("Ledger incorrect data (0x6a80)", () => {
  it("maps E_INCORRECT_DATA to ledger_unsupported instead of auth_required", async () => {
    const apdu = Object.assign(new Error("Ledger device: UNKNOWN_ERROR (0x6a80)"), {
      statusCode: 0x6a80,
    });
    failures.tip712 = apdu;
    let err: unknown;
    try {
      await new Ledger(assertTronTxIntegrity, 2000).signTypedData("tron", PATH, {
        domain: { name: "X", version: "1", chainId: 1 },
        types: { A: [{ name: "x", type: "uint256" }] },
        message: { x: "1" },
      });
    } catch (e) {
      err = e;
    } finally {
      failures.tip712 = undefined;
    }
    const m = err as { code?: string; message: string };
    expect(m.code).toBe("ledger_unsupported");
    expect(m.message).toMatch(/could not decode/i);
    expect(m.message).toMatch(/unsupported|malformed/i);
  });
});

describe("Ledger TIP-712", () => {
  const domain = { name: "SunPerp", version: "1", chainId: 728126428 };
  const types = {
    Order: [
      { name: "trader", type: "address" },
      { name: "size", type: "uint256" },
    ],
  };
  const message = { trader: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ", size: "1000000" };
  const encoder = tronUtils.typedData.TypedDataEncoder;

  it("sends the locally computed domain and struct hashes to the device", async () => {
    tip712Calls.length = 0;
    const out = await new Ledger(assertTronTxIntegrity, 2000).signTypedData("tron", PATH, {
      domain,
      types,
      message,
    });

    expect(tip712Calls).toHaveLength(1);
    expect(tip712Calls[0]!.path).toBe("44'/195'/0'/0/0");
    expect(tip712Calls[0]!.domainHash).toBe(encoder.hashDomain(domain).replace(/^0x/, ""));
    expect(tip712Calls[0]!.messageHash).toBe(
      encoder.hashStruct("Order", types, message).replace(/^0x/, ""),
    );
    expect(out.signature).toBe(`0x${"aa".repeat(64)}1b`);
    expect(out.primaryType).toBe("Order");
    expect(out.digest).toBe(encoder.hash(domain, types, message));
  });

  it.each([
    [0, 27],
    [1, 28],
    [27, 27],
    [28, 28],
  ])("normalizes recovery byte %i to %i without changing r/s", async (input, expected) => {
    const rs = "12".repeat(32) + "34".repeat(32);
    failures.tip712Signature = rs + input.toString(16).padStart(2, "0");
    try {
      const out = await new Ledger(assertTronTxIntegrity, 2000).signTypedData("tron", PATH, {
        domain,
        types,
        message,
      });
      expect(out.signature).toBe(`0x${rs}${expected.toString(16)}`);
    } finally {
      failures.tip712Signature = "aa".repeat(64) + "00";
    }
  });

  it.each([
    "",
    "aa".repeat(64),
    "aa".repeat(66),
    "gg".repeat(64) + "00",
    "aa".repeat(64) + "02",
    "aa".repeat(64) + "ff",
  ])("rejects malformed TIP-712 signature %s", async (signature) => {
    failures.tip712Signature = signature;
    try {
      await expect(
        new Ledger(assertTronTxIntegrity, 2000).signTypedData("tron", PATH, {
          domain,
          types,
          message,
        }),
      ).rejects.toMatchObject({ code: "encoding_error" });
    } finally {
      failures.tip712Signature = "aa".repeat(64) + "00";
    }
  });

  it("rejects a payload that cannot be hashed before touching the device", async () => {
    tip712Calls.length = 0;
    await expect(
      new Ledger(assertTronTxIntegrity, 2000).signTypedData("tron", PATH, {
        domain,
        types,
        message: { trader: "nope", size: "1" },
      }),
    ).rejects.toMatchObject({ code: "invalid_transaction" });
    expect(tip712Calls).toHaveLength(0);
  });
});

describe("Ledger device states", () => {
  it("reports an unreachable device as device_not_found, not auth_required", async () => {
    failures.open = Object.assign(new Error("NoDevice"), { id: "NoDevice" });
    try {
      await expect(
        new Ledger(assertTronTxIntegrity, 2000).getAddress("tron", PATH),
      ).rejects.toMatchObject({
        code: "device_not_found",
      });
    } finally {
      failures.open = undefined;
    }
  });

  it("reports a locked device as device_locked, whichever way the transport says so", async () => {
    for (const e of [
      Object.assign(new Error("Ledger device: Locked device (0x5515)"), { statusCode: 0x5515 }),
      Object.assign(new Error("Locked device"), { name: "LockedDeviceError" }),
    ]) {
      failures.open = e;
      try {
        await expect(
          new Ledger(assertTronTxIntegrity, 2000).getAddress("tron", PATH),
        ).rejects.toMatchObject({
          code: "device_locked",
        });
      } finally {
        failures.open = undefined;
      }
    }
  });

  it("maps a locked device reported as an APDU status word to device_locked", async () => {
    failures.tip712 = Object.assign(new Error("Locked device (0x5515)"), { statusCode: 0x5515 });
    try {
      await expect(
        new Ledger(assertTronTxIntegrity, 2000).signTypedData("tron", PATH, {
          domain: { name: "X", version: "1", chainId: 1 },
          types: { A: [{ name: "x", type: "uint256" }] },
          message: { x: "1" },
        }),
      ).rejects.toMatchObject({ code: "device_locked" });
    } finally {
      failures.tip712 = undefined;
    }
  });
});

describe("recoverable Ledger failures", () => {
  it.each(["DisconnectedDevice", "DisconnectedDeviceDuringOperation"])(
    "explains %s without leaking native paths",
    async (name) => {
      failures.tip712 = Object.assign(new Error("IOService:/sensitive/native/path"), { name });
      try {
        await expect(
          new Ledger(assertTronTxIntegrity, 1000).signTypedData("tron", PATH, {
            domain: { name: "test", version: "1", chainId: 1 },
            types: { Test: [{ name: "value", type: "uint256" }] },
            message: { value: "1" },
          }),
        ).rejects.toMatchObject({
          code: "device_disconnected",
          message: expect.stringContaining("reconnect"),
        });
      } finally {
        failures.tip712 = undefined;
      }
    },
  );
});

it("keeps unknown open failures distinct and does not expose OS paths", async () => {
  failures.open = new Error("cannot open IOService:/sensitive/native/path");
  try {
    const error = await new Ledger(assertTronTxIntegrity, 1000)
      .getAddress("tron", PATH)
      .catch((e) => e);
    expect(error.code).toBe("device_unavailable");
    expect(error.message).toContain("Ledger Live");
    expect(error.message).not.toContain("IOService");
  } finally {
    failures.open = undefined;
  }
});
it("gives an app hint for 0x6d02 without treating it as a user rejection", async () => {
  transactionSignSpy.mockRejectedValueOnce(
    Object.assign(new Error("UNKNOWN_APDU"), { statusCode: 0x6d02 }),
  );
  await expect(
    new Ledger(assertTronTxIntegrity, 1000).signTransaction("tron", PATH, RAW_TX),
  ).rejects.toMatchObject({
    code: "ledger_unsupported",
    message: expect.stringContaining("correct app"),
  });
});
