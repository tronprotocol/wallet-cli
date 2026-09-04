import { describe, it, expect } from "vitest";
import { Transaction, TypedDataEncoder, keccak256, verifyMessage, verifyTypedData } from "ethers";
import { localTxId } from "../../../../application/services/broadcast-identity.js";
import { evmSignStrategy } from "./signing-strategy.js";

// Anvil / Hardhat account #0 — a published key/address pair.
const PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("evmSignStrategy.signMessage (EIP-191)", () => {
  // Verified by RECOVERING the signer with an independent implementation, rather than against a
  // signature string copied from somewhere — that catches a wrong digest, a wrong v, and a
  // malleable s all at once.
  it.each([
    ["ascii", "hello world"],
    ["empty", ""],
    ["unicode", "日本語 🎉"],
    ["multiline", "line one\nline two"],
  ])("produces a signature recoverable to the signer (%s)", async (_label, message) => {
    const signature = await evmSignStrategy.signMessage(PK, message);

    expect(verifyMessage(message, signature)).toBe(ADDRESS);
  });

  it("returns a 65-byte 0x signature", async () => {
    const signature = await evmSignStrategy.signMessage(PK, "hello world");
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/);
  });
});

// The canonical EIP-712 example from the specification itself.
const DOMAIN = {
  name: "Ether Mail",
  version: "1",
  chainId: 1,
  verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
};
const MAIL_TYPES = {
  Person: [
    { name: "name", type: "string" },
    { name: "wallet", type: "address" },
  ],
  Mail: [
    { name: "from", type: "Person" },
    { name: "to", type: "Person" },
    { name: "contents", type: "string" },
  ],
};
const MAIL = {
  from: { name: "Cow", wallet: "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826" },
  to: { name: "Bob", wallet: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" },
  contents: "Hello, Bob!",
};

describe("evmSignStrategy.signTypedData (EIP-712)", () => {
  it("produces a signature recoverable to the signer", async () => {
    const { signature } = await evmSignStrategy.signTypedData(PK, {
      domain: DOMAIN,
      types: MAIL_TYPES,
      message: MAIL,
    });

    expect(verifyTypedData(DOMAIN, MAIL_TYPES, MAIL, signature)).toBe(ADDRESS);
  });

  it("reports the digest that was actually signed", async () => {
    const { digest } = await evmSignStrategy.signTypedData(PK, {
      domain: DOMAIN,
      types: MAIL_TYPES,
      message: MAIL,
    });

    expect(digest).toBe(TypedDataEncoder.hash(DOMAIN, MAIL_TYPES, MAIL));
  });

  it("infers the primary type when the caller omits it", async () => {
    const result = await evmSignStrategy.signTypedData(PK, {
      domain: DOMAIN,
      types: MAIL_TYPES,
      message: MAIL,
    });

    expect(result.primaryType).toBe("Mail");
  });

  // Wallets are routinely handed the full JSON-RPC payload, which DOES carry EIP712Domain in
  // `types`. ethers computes the domain separator itself and rejects the redundant entry, so a
  // strategy that forwards types verbatim would fail on the most common real-world input.
  it("accepts a payload that includes EIP712Domain in its types", async () => {
    const types = {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ...MAIL_TYPES,
    };

    const { signature, primaryType } = await evmSignStrategy.signTypedData(PK, {
      domain: DOMAIN,
      types,
      message: MAIL,
      primaryType: "Mail",
    });

    expect(primaryType).toBe("Mail");
    expect(verifyTypedData(DOMAIN, MAIL_TYPES, MAIL, signature)).toBe(ADDRESS);
  });
});

describe("evmSignStrategy.sign (transactions)", () => {
  const eip1559 = {
    type: 2,
    chainId: 11155111,
    nonce: 7,
    to: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
    value: 1_000_000_000_000_000_000n,
    gasLimit: 21_000n,
    maxFeePerGas: 30_000_000_000n,
    maxPriorityFeePerGas: 1_500_000_000n,
    data: "0x",
  };

  it("signs an EIP-1559 transaction recoverable to the signer", async () => {
    const { raw } = (await evmSignStrategy.sign(PK, eip1559)) as { raw: string };

    expect(Transaction.from(raw).from).toBe(ADDRESS);
  });

  it("preserves every field it was given", async () => {
    const { raw } = (await evmSignStrategy.sign(PK, eip1559)) as { raw: string };
    const parsed = Transaction.from(raw);

    expect(parsed.type).toBe(2);
    expect(parsed.chainId).toBe(11155111n);
    expect(parsed.nonce).toBe(7);
    expect(parsed.to).toBe("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB");
    expect(parsed.value).toBe(1_000_000_000_000_000_000n);
    expect(parsed.maxFeePerGas).toBe(30_000_000_000n);
  });

  // EIP-155 replay protection: a legacy transaction must carry the chain id in v, so a signature
  // for Sepolia cannot be replayed on mainnet.
  it("signs a legacy transaction with EIP-155 replay protection", async () => {
    const { raw } = (await evmSignStrategy.sign(PK, {
      type: 0,
      chainId: 11155111,
      nonce: 0,
      to: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
      value: 0n,
      gasLimit: 21_000n,
      gasPrice: 20_000_000_000n,
    })) as { raw: string };

    const parsed = Transaction.from(raw);
    expect(parsed.from).toBe(ADDRESS);
    expect(parsed.chainId).toBe(11155111n);
  });

  it("rejects a transaction it cannot encode instead of returning something unsigned", async () => {
    await expect(evmSignStrategy.sign(PK, { to: "not-an-address" })).rejects.toThrow();
  });
});

/**
 * A signed EVM transaction is carried as `{ raw, hash }`, not as a bare serialised string.
 *
 * The hash is keccak256 of the signed bytes, so it is derivable from what we signed rather than
 * assigned by a node — exactly the property `authoritativeTxId` relies on to refuse a node's
 * word about which transaction it just accepted. Naming the field `hash` is what lets the
 * existing `localTxId` find it, with no family branch: TRON supplies `txID`, EVM supplies `hash`.
 */
describe("evmSignStrategy signed-transaction identity", () => {
  const tx = {
    type: 2,
    chainId: 11155111,
    nonce: 7,
    to: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
    value: 1_000_000_000_000_000_000n,
    gasLimit: 21_000n,
    maxFeePerGas: 30_000_000_000n,
    maxPriorityFeePerGas: 1_500_000_000n,
    data: "0x",
  };

  it("returns the raw serialisation alongside its hash", async () => {
    const signed = (await evmSignStrategy.sign(PK, tx)) as { raw: string; hash: string };

    expect(signed.raw.startsWith("0x02")).toBe(true);
    expect(signed.hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("derives the hash from the signed bytes, not from anywhere else", async () => {
    const signed = (await evmSignStrategy.sign(PK, tx)) as { raw: string; hash: string };

    expect(signed.hash).toBe(keccak256(signed.raw));
    expect(Transaction.from(signed.raw).hash).toBe(signed.hash);
  });

  it("exposes the hash under a key localTxId already understands", async () => {
    const signed = await evmSignStrategy.sign(PK, tx);
    const found = localTxId(signed);

    // Asserting equality alone would pass on undefined === undefined, which is precisely the
    // broken state this exists to catch: a bare string carries no id for localTxId to find.
    expect(found).toMatch(/^0x[0-9a-f]{64}$/);
    expect(found).toBe((signed as { hash: string }).hash);
  });
});
