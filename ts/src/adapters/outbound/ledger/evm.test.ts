import { describe, it, expect, vi } from "vitest";
import { keccak256 } from "ethers";
import { localTxId } from "../../../application/services/broadcast-identity.js";
import { Ledger } from "./index.js";
import { Transaction, TypedDataEncoder } from "ethers";

// Both app modules are imported lazily inside the adapter, so hoisted vi.mock applies. Mocking
// BOTH is the point: the adapter must reach for the ethereum app, and a regression that keeps
// loading hw-app-trx would otherwise pass silently.
const { calls, highS, legacyV } = vi.hoisted(() => ({
  calls: [] as Array<{ app: string; method: string; args: unknown[] }>,
  highS: { on: false },
  // hw-app-eth returns v ALREADY EIP-155-encoded for a legacy tx: chainId*2 + 35 + parity.
  legacyV: { value: "1c" },
}));

vi.mock("@ledgerhq/hw-transport-node-hid-noevents", () => ({
  default: { open: async () => ({ close: async () => {} }) },
}));

vi.mock("@ledgerhq/hw-app-trx", () => ({
  default: class {
    async getAddress(...args: unknown[]) {
      calls.push({ app: "trx", method: "getAddress", args });
      return { publicKey: "", address: "TWrongApp" };
    }
  },
}));

vi.mock("@ledgerhq/hw-app-eth", () => ({
  default: class {
    async getAddress(...args: unknown[]) {
      calls.push({ app: "eth", method: "getAddress", args });
      return { publicKey: "04ab", address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" };
    }
    async signPersonalMessage(...args: unknown[]) {
      calls.push({ app: "eth", method: "signPersonalMessage", args });
      return { v: 28, r: "aa".repeat(32), s: "bb".repeat(32) };
    }
    async signTransaction(...args: unknown[]) {
      calls.push({ app: "eth", method: "signTransaction", args });
      return { v: legacyV.value, r: "cc".repeat(32), s: (highS.on ? "dd" : "22").repeat(32) };
    }
    async signEIP712HashedMessage(...args: unknown[]) {
      calls.push({ app: "eth", method: "signEIP712HashedMessage", args });
      return { v: 28, r: "ee".repeat(32), s: "ff".repeat(32) };
    }
  },
}));

const PATH = "m/44'/60'/0'/0/0";
const ledger = () => new Ledger(5_000);

describe("Ledger reaches the ethereum app for the evm family", () => {
  it("derives an address through hw-app-eth, not hw-app-trx", async () => {
    calls.length = 0;

    const address = await ledger().getAddress("evm", PATH);

    expect(address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(calls.map((c) => c.app)).toEqual(["eth"]);
  });

  it("strips the leading m/ before handing the path to the device", async () => {
    calls.length = 0;
    await ledger().getAddress("evm", PATH);

    expect(calls[0]!.args[0]).toBe("44'/60'/0'/0/0");
  });

  // hw-app-eth returns {v, r, s} where hw-app-trx returns a hex string, so the adapter has to
  // assemble Ethereum's r||s||v itself rather than forwarding whatever came back.
  it("assembles a 65-byte r||s||v signature from the app's {v,r,s}", async () => {
    calls.length = 0;

    const signature = await ledger().signMessage("evm", PATH, "hello world");

    expect(signature).toBe(`0x${"aa".repeat(32)}${"bb".repeat(32)}1c`);
  });

  it("hands the message to the device as hex", async () => {
    calls.length = 0;
    await ledger().signMessage("evm", PATH, "hi");

    expect(calls[0]!.args[1]).toBe(Buffer.from("hi", "utf8").toString("hex"));
  });
});

const TX = {
  type: 2,
  chainId: 11155111,
  nonce: 3,
  to: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
  value: 1_000_000_000_000_000_000n,
  gasLimit: 21_000n,
  maxFeePerGas: 30_000_000_000n,
  maxPriorityFeePerGas: 1_500_000_000n,
};

describe("Ledger signs EVM transactions", () => {
  it("returns a serialised raw transaction carrying the device's signature", async () => {
    calls.length = 0;

    const { raw } = (await ledger().signTransaction("evm", PATH, TX)) as { raw: string };

    expect(raw).toMatch(/^0x02/); // typed envelope, EIP-1559
    expect(raw.toLowerCase()).toContain("cc".repeat(32));
  });

  it("hands the device the UNSIGNED serialisation, without its 0x prefix", async () => {
    calls.length = 0;
    await ledger().signTransaction("evm", PATH, TX);

    const [path, rawTxHex] = calls[0]!.args as [string, string];
    expect(path).toBe("44'/60'/0'/0/0");
    expect(rawTxHex.startsWith("0x")).toBe(false);
    expect(rawTxHex.startsWith("02")).toBe(true);
  });

  // Passing a resolution would make hw-app-eth fetch clear-signing descriptors from Ledger's CDN
  // mid-signature. We deliberately pass null: the CLI must not phone out while signing.
  // ethers enforces EIP-2 when the signature is attached, so a device returning a high-s value
  // is rejected here rather than producing a transaction the network would refuse.
  it("refuses a non-canonical high-s signature from the device", async () => {
    calls.length = 0;
    highS.on = true;
    try {
      await expect(ledger().signTransaction("evm", PATH, TX)).rejects.toThrow();
    } finally {
      highS.on = false;
    }
  });

  it("passes a null resolution so signing performs no network lookup", async () => {
    calls.length = 0;
    await ledger().signTransaction("evm", PATH, TX);

    expect((calls[0]!.args as unknown[])[2]).toBeNull();
  });
});

describe("Ledger signs EVM typed data", () => {
  const DOMAIN = {
    name: "Ether Mail",
    version: "1",
    chainId: 1,
    verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
  };
  const TYPES = { Mail: [{ name: "contents", type: "string" }] };
  const MESSAGE = { contents: "Hello, Bob!" };

  it("signs via the EIP-712 APDU and returns r||s||v", async () => {
    calls.length = 0;

    const result = await ledger().signTypedData("evm", PATH, {
      domain: DOMAIN,
      types: TYPES,
      message: MESSAGE,
    });

    expect(calls[0]!.method).toBe("signEIP712HashedMessage");
    expect(result.signature).toBe(`0x${"ee".repeat(32)}${"ff".repeat(32)}1c`);
    expect(result.primaryType).toBe("Mail");
  });

  // Asserts the digests the device is shown match ethers' EIP-712 encoder exactly. Note this
  // does NOT discriminate against tronweb's TIP-712 encoder: that is a fork of the same ethers
  // code which merely ALSO accepts TRON base58 addresses, so for EVM input the two agree today.
  // The reason to use ethers here is coupling, not output — tronweb's fork is free to diverge,
  // and EVM signing should not depend on a TRON SDK's typed-data implementation.
  it("hashes exactly as the EIP-712 encoder does", async () => {
    calls.length = 0;
    await ledger().signTypedData("evm", PATH, {
      domain: DOMAIN,
      types: TYPES,
      message: MESSAGE,
    });

    const [, domainHash, structHash] = calls[0]!.args as [string, string, string];
    expect(domainHash).toBe(TypedDataEncoder.hashDomain(DOMAIN).replace(/^0x/, ""));
    expect(structHash).toBe(TypedDataEncoder.hashStruct("Mail", TYPES, MESSAGE).replace(/^0x/, ""));
  });
});

// For a legacy (type-0) transaction the ethereum app returns v already EIP-155-encoded
// (chainId*2 + 35 + parity), which needs three bytes on Sepolia — 11155111*2+35 = 0x1546b71.
// padStart(2,"0") cannot truncate, so the assembled signature is longer than 65 bytes and
// ethers rejects it. Typed transactions hide this: their v is a bare parity bit.
describe("Ledger signs a legacy EVM transaction", () => {
  const legacy = {
    type: 0,
    chainId: 11155111,
    nonce: 1,
    to: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
    value: 0n,
    gasLimit: 21_000n,
    gasPrice: 20_000_000_000n,
  };

  it("accepts an EIP-155-encoded v from the device", async () => {
    calls.length = 0;
    legacyV.value = (11155111 * 2 + 35).toString(16); // 0x1546b71 — three bytes
    try {
      const { raw } = (await ledger().signTransaction("evm", PATH, legacy)) as { raw: string };
      expect(Transaction.from(raw).chainId).toBe(11155111n);
    } finally {
      legacyV.value = "1c";
    }
  });
});

/**
 * A device-signed transaction carries the same `{ raw, hash }` shape a software-signed one does.
 *
 * The pipeline does not know which signer produced a transaction, so a Ledger-signed one that
 * returned a bare string would silently lose its locally derived id — and with it the protection
 * `authoritativeTxId` gives against a node naming the wrong transaction.
 */
describe("Ledger EVM signed-transaction identity", () => {
  it("returns raw and hash, like the software strategy", async () => {
    calls.length = 0;
    const signed = (await ledger().signTransaction("evm", PATH, TX)) as {
      raw: string;
      hash: string;
    };

    expect(signed.raw).toMatch(/^0x02/);
    expect(signed.hash).toBe(keccak256(signed.raw));
  });

  it("exposes the hash where localTxId finds it", async () => {
    calls.length = 0;
    const found = localTxId(await ledger().signTransaction("evm", PATH, TX));

    expect(found).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
