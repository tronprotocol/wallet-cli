import { describe, it, expect, vi } from "vitest";
import { utils as tronUtils } from "tronweb";
import { Ledger } from "./index.js";

// The @ledgerhq transport/app modules are imported lazily inside the adapter, so hoisted vi.mock
// applies. closeSpy stands in for the native HID handle: the real bug is that a timed-out device
// call leaks this handle (it is never closed), pinning libuv so the process can't exit.
const { closeSpy, tip712Calls, failures } = vi.hoisted(() => ({
  closeSpy: vi.fn(async () => {}),
  tip712Calls: [] as Array<{ path: string; domainHash: string; messageHash: string }>,
  failures: { tip712: undefined as Error | undefined, tip712Hang: false },
}));
vi.mock("@ledgerhq/hw-transport-node-hid", () => ({
  default: { open: async () => ({ close: closeSpy }) },
}));
// Every device APDU never resolves — models an on-device prompt that is never tapped.
vi.mock("@ledgerhq/hw-app-trx", () => ({
  default: class {
    async signPersonalMessage(): Promise<string> {
      return new Promise(() => {});
    }
    async signTransaction(): Promise<string> {
      return new Promise(() => {});
    }
    async getAddress(): Promise<{ publicKey: string; address: string }> {
      return new Promise(() => {});
    }
    async getAppConfiguration(): Promise<{ version: string }> {
      return new Promise(() => {});
    }
    // Unlike the others this one resolves: the TIP-712 tests assert what reaches the device,
    // which a never-settling promise cannot show.
    async signTIP712HashedMessage(path: string, domainHash: string, messageHash: string): Promise<string> {
      if (failures.tip712) throw failures.tip712;
      if (failures.tip712Hang) return new Promise(() => {});
      tip712Calls.push({ path, domainHash, messageHash });
      return "aa".repeat(65);
    }
  },
}));

const PATH = "m/44'/195'/0'/0/0";
// Must be a self-consistent transaction: signTransaction now enforces payload integrity before
// reaching the device, so a bare {raw_data_hex} stub would fail there instead of timing out.
const RAW_TX = (() => {
  const raw = {
    contract: [{
      parameter: {
        value: {
          amount: 1000000,
          owner_address: "4119e7e376e7c213b7e7e7e46cc70a5dd086daff2a",
          to_address: "41e552f6487585c2b58bc2c9bb4492bc1f17132cd0",
        },
        type_url: "type.googleapis.com/protocol.TransferContract",
      },
      type: "TransferContract",
    }],
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
    await expect(new Ledger(20).signMessage("tron", PATH, "hi")).rejects.toMatchObject({ code: "timeout" });
  });

  // Regression: on timeout the adapter must close the transport, otherwise the pending APDU keeps
  // the native HID handle open and the process hangs (violates the deterministic-exit CLI contract).
  it("closes the transport when a hung signMessage times out", async () => {
    closeSpy.mockClear();
    await expect(new Ledger(20).signMessage("tron", PATH, "hi")).rejects.toMatchObject({ code: "timeout" });
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 500 });
  });

  it("closes the transport when a hung signTransaction times out", async () => {
    closeSpy.mockClear();
    await expect(new Ledger(20).signTransaction("tron", PATH, RAW_TX)).rejects.toMatchObject({ code: "timeout" });
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 500 });
  });

  it("closes the transport when a hung getAddress times out", async () => {
    closeSpy.mockClear();
    await expect(new Ledger(20).getAddress("tron", PATH)).rejects.toMatchObject({ code: "timeout" });
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 500 });
  });

  it("closes the transport when a hung appConfig times out", async () => {
    closeSpy.mockClear();
    await expect(new Ledger(20).appConfig("tron")).rejects.toMatchObject({ code: "timeout" });
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 500 });
  });
});

describe("Ledger transaction signing", () => {
  // A Ledger account must not be the weaker signer: the device signs raw_data_hex, so the same
  // integrity rules apply. Before this, `tx sign --account <ledger>` skipped the check entirely.
  it("refuses a transaction whose txID does not hash its raw_data_hex, before reaching the device", async () => {
    const tampered = { ...(RAW_TX as object), txID: "00".repeat(32) };
    await expect(new Ledger(2000).signTransaction("tron", PATH, tampered as never)).rejects.toMatchObject({
      code: "tx_integrity",
    });
  });
});

describe("Ledger abort signal", () => {
  // The signal must do real work, not sit in the parameter list: an in-flight HID APDU is not
  // self-cancelling, so the only way to release the device is to close the transport. Without
  // this the handle stays open until the adapter's own (much longer) timeout expires.
  it("closes the transport when the caller aborts a pending signMessage", async () => {
    closeSpy.mockClear();
    const ac = new AbortController();
    // long adapter timeout: if the abort did nothing, this test would hang rather than pass early.
    // capture the rejection before aborting: an unhandled window here is reported as a stray
    // unhandled rejection even though the test later asserts on it.
    const settled = new Ledger(60_000).signMessage("tron", PATH, "hi", ac.signal).catch((e) => e);
    ac.abort();
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 1000 });
    expect(await settled).toMatchObject({ code: "cancelled" });
  });

  it("closes the transport when the caller aborts a pending typed-data signature", async () => {
    closeSpy.mockClear();
    const ac = new AbortController();
    failures.tip712Hang = true;
    try {
      const settled = new Ledger(60_000)
        .signTypedData(
          "tron",
          PATH,
          { domain: { name: "X", version: "1", chainId: 1 }, types: { A: [{ name: "x", type: "uint256" }] }, message: { x: "1" } },
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
  // Verified against Speculos running the real TRON app 0.7.6: with "Sign by Hash" disabled (its
  // default) the device answers 0x6a8c, which otherwise surfaces as "UNKNOWN_ERROR (0x6a8c)" and
  // leaves the user with no idea the fix is a toggle in the app's own settings menu.
  it("maps a missing app setting to an actionable error", async () => {
    const apdu = Object.assign(new Error("Ledger device: UNKNOWN_ERROR (0x6a8c)"), { statusCode: 0x6a8c });
    failures.tip712 = apdu;
    try {
      await expect(
        new Ledger(2000).signTypedData("tron", PATH, {
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
  // 0x6d00 (INS_NOT_SUPPORTED) is a standard Ledger/ISO status word shared by every app, not
  // TRON-specific: the installed app version does not implement the instruction, or the wrong app is
  // open. It must map to a generic hint, not the opaque "auth_required / …(0x6d00)".
  it("maps INS_NOT_SUPPORTED to a generic, chain-agnostic ledger_unsupported error", async () => {
    const apdu = Object.assign(new Error("Ledger device: INS_NOT_SUPPORTED (0x6d00)"), { statusCode: 0x6d00 });
    failures.tip712 = apdu;
    let err: unknown;
    try {
      await new Ledger(2000).signTypedData("tron", PATH, {
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
    // The message must not leak a chain or operation name — it fires for any app and any call.
    expect(m.message).not.toMatch(/tip-?712|tron|typed[- ]?data|eip-?712/i);
  });
});

describe("Ledger incorrect data (0x6a80)", () => {
  // The TRON app parses a fixed set of contract types (app-tron src/parse.c); anything else — e.g.
  // AccountCreateContract, SetAccountIdContract — hits the parser's `default: return USTREAM_FAULT`,
  // which the sign handler answers with E_INCORRECT_DATA (0x6a80). The "Sign by Hash" fallback lives
  // in the *display* switch and is only reached after a successful parse, so no setting rescues it.
  // Unmapped, this surfaced as auth_required + a raw "UNKNOWN_ERROR (0x6a80)" — the wrong category
  // and an unreadable message.
  it("maps E_INCORRECT_DATA to ledger_unsupported instead of auth_required", async () => {
    const apdu = Object.assign(new Error("Ledger device: UNKNOWN_ERROR (0x6a80)"), { statusCode: 0x6a80 });
    failures.tip712 = apdu;
    let err: unknown;
    try {
      await new Ledger(2000).signTypedData("tron", PATH, {
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
    // 0x6a80 also covers a malformed payload (bad protobuf, out-of-range permission id), so the
    // message must not claim the contract type is the only cause.
    expect(m.message).toMatch(/could not decode/i);
    expect(m.message).toMatch(/unsupported|malformed/i);
  });
});

describe("Ledger TIP-712", () => {
  const domain = { name: "SunPerp", version: "1", chainId: 728126428 };
  const types = { Order: [{ name: "trader", type: "address" }, { name: "size", type: "uint256" }] };
  const message = { trader: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ", size: "1000000" };
  const encoder = tronUtils.typedData.TypedDataEncoder;

  it("sends the locally computed domain and struct hashes to the device", async () => {
    tip712Calls.length = 0;
    const out = await new Ledger(2000).signTypedData("tron", PATH, { domain, types, message });

    expect(tip712Calls).toHaveLength(1);
    // hw-app-trx wants the path without the leading "m/"; its hexBuffer accepts bare hex.
    expect(tip712Calls[0]!.path).toBe("44'/195'/0'/0/0");
    expect(tip712Calls[0]!.domainHash).toBe(encoder.hashDomain(domain).replace(/^0x/, ""));
    expect(tip712Calls[0]!.messageHash).toBe(encoder.hashStruct("Order", types, message).replace(/^0x/, ""));
    // the app returns bare 65-byte hex; the adapter 0x-prefixes it like signPersonalMessage does.
    expect(out.signature).toBe(`0x${"aa".repeat(65)}`);
    expect(out.primaryType).toBe("Order");
    expect(out.digest).toBe(encoder.hash(domain, types, message));
  });

  it("rejects a payload that cannot be hashed before touching the device", async () => {
    tip712Calls.length = 0;
    await expect(
      new Ledger(2000).signTypedData("tron", PATH, { domain, types, message: { trader: "nope", size: "1" } }),
    ).rejects.toMatchObject({ code: "invalid_transaction" });
    expect(tip712Calls).toHaveLength(0);
  });
});
