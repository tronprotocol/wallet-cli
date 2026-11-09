import { describe, it, expect } from "vitest";
import { TronWeb, utils as tronUtils } from "tronweb";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { tronSignStrategy } from "./signing-strategy.js";

const PK = "0x0000000000000000000000000000000000000000000000000000000000000001";
const oldTw = new TronWeb({ fullHost: "http://localhost" });

const OWNER = "4119e7e376e7c213b7e7e7e46cc70a5dd086daff2a";
const TO = "41e552f6487585c2b58bc2c9bb4492bc1f17132cd0";

const RAW_DATA = {
  contract: [
    {
      parameter: {
        value: { amount: 1000000, owner_address: OWNER, to_address: TO },
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

function buildTx(rawData: object) {
  const shell = { visible: false, raw_data: rawData, raw_data_hex: "", txID: "" };
  const pb = tronUtils.transaction.txJsonToPb(shell as never);
  return {
    ...shell,
    raw_data_hex: tronUtils.transaction.txPbToRawDataHex(pb).toLowerCase(),
    txID: tronUtils.transaction.txPbToTxID(pb).replace(/^0x/, ""),
  };
}

describe("tronSignStrategy — static utils signing parity", () => {
  it("signMessage matches the old instance trx.signMessageV2 byte-for-byte", async () => {
    const got = await tronSignStrategy.signMessage(PK, "hello world");
    const ref = oldTw.trx.signMessageV2("hello world", PK.slice(2));
    expect(got).toBe(ref);
  });

  it("sign attaches a valid secp256k1 signature to a transaction", async () => {
    const got = await tronSignStrategy.sign(PK, buildTx(RAW_DATA) as never);
    expect(Array.isArray((got as any).signature)).toBe(true);
    expect((got as any).signature[0]).toMatch(/^[0-9a-fA-F]{130}$/); // 65-byte r||s||v
  });

  it("wraps signing failures in a ChainError(signing_rejected)", async () => {
    await expect(tronSignStrategy.signMessage(PK, undefined as any)).rejects.toMatchObject({
      code: "signing_rejected",
    });
  });
});

describe("tronSignStrategy.sign — payload integrity", () => {
  it("refuses a transaction whose txID/raw_data_hex disagree with raw_data", async () => {
    const honest = buildTx(RAW_DATA);
    const evilRaw = JSON.parse(JSON.stringify(RAW_DATA));
    evilRaw.contract[0].parameter.value.amount = 1000000000;
    const evil = buildTx(evilRaw);
    const tampered = { ...honest, raw_data_hex: evil.raw_data_hex, txID: evil.txID };
    await expect(tronSignStrategy.sign(PK, tampered as never)).rejects.toMatchObject({
      code: "tx_integrity",
    });
  });

  it("refuses a transaction whose txID is not the hash of its raw_data_hex", async () => {
    const tx = { ...buildTx(RAW_DATA), txID: "00".repeat(32) };
    await expect(tronSignStrategy.sign(PK, tx as never)).rejects.toMatchObject({
      code: "tx_integrity",
    });
  });

  it("refuses a transaction missing raw_data_hex or txID", async () => {
    await expect(tronSignStrategy.sign(PK, { raw_data: RAW_DATA } as never)).rejects.toMatchObject({
      code: "tx_integrity",
    });
  });

  it("refuses raw_data that cannot be re-encoded for a decodable contract type", async () => {
    const honest = buildTx(RAW_DATA);
    const crafted = JSON.parse(JSON.stringify(RAW_DATA));
    crafted.contract[0].parameter.value.amount = 0.5;
    const tx = { ...honest, raw_data: crafted };
    await expect(tronSignStrategy.sign(PK, tx as never)).rejects.toMatchObject({
      code: "tx_integrity",
    });
  });

  it("refuses raw_data whose address is malformed", async () => {
    const honest = buildTx(RAW_DATA);
    const crafted = JSON.parse(JSON.stringify(RAW_DATA));
    crafted.contract[0].parameter.value.to_address = "not-an-address";
    await expect(
      tronSignStrategy.sign(PK, { ...honest, raw_data: crafted } as never),
    ).rejects.toMatchObject({ code: "tx_integrity" });
  });

  function envelopeHex(typeNum: number): string {
    const P = (globalThis as any).TronWebProto;
    const contract = new P.Transaction.Contract();
    contract.setType(typeNum);
    const raw = new P.Transaction.raw();
    raw.addContract(contract);
    return bytesToHex(raw.serializeBinary());
  }
  // Keep txID valid so only the declared-versus-encoded contract type differs.
  function exoticTx(claimedType: string, encodedTypeNum: number) {
    const hex = envelopeHex(encodedTypeNum);
    return {
      visible: false,
      raw_data: { contract: [{ type: claimedType, parameter: { value: {} } }] },
      raw_data_hex: hex,
      txID: bytesToHex(sha256(hexToBytes(hex))),
    };
  }

  it("signs a Market contract tronweb cannot re-encode when raw_data's type matches the envelope", async () => {
    const signed = await tronSignStrategy.sign(
      PK,
      exoticTx("MarketSellAssetContract", 52) as never,
    );
    expect((signed as any).signature).toHaveLength(1);
  });

  it("refuses a transaction whose raw_data type disagrees with the encoded envelope type", async () => {
    await expect(
      tronSignStrategy.sign(PK, exoticTx("MarketSellAssetContract", 1) as never),
    ).rejects.toMatchObject({ code: "tx_integrity" });
  });

  it("refuses a transaction whose raw_data_hex envelope carries no matching contract", async () => {
    const hex = "0a020a1b"; // Transaction.raw with only ref_block_bytes, no contracts
    const tx = {
      visible: false,
      raw_data: { contract: [{ type: "MarketSellAssetContract", parameter: { value: {} } }] },
      raw_data_hex: hex,
      txID: bytesToHex(sha256(hexToBytes(hex))),
    };
    await expect(tronSignStrategy.sign(PK, tx as never)).rejects.toMatchObject({
      code: "tx_integrity",
    });
  });

  it("refuses a transaction whose raw_data declares an unknown contract type", async () => {
    await expect(
      tronSignStrategy.sign(PK, exoticTx("TotallyFakeContract", 52) as never),
    ).rejects.toMatchObject({ code: "tx_integrity" });
  });

  it("refuses a transaction whose raw_data_hex is not decodable protobuf", async () => {
    const hex = "ff";
    const tx = {
      visible: false,
      raw_data: { contract: [{ type: "MarketSellAssetContract", parameter: { value: {} } }] },
      raw_data_hex: hex,
      txID: bytesToHex(sha256(hexToBytes(hex))),
    };
    await expect(tronSignStrategy.sign(PK, tx as never)).rejects.toMatchObject({
      code: "tx_integrity",
    });
  });

  it("appends to an existing signature array instead of replacing it", async () => {
    const tx = { ...buildTx(RAW_DATA), signature: ["ff".repeat(65)] };
    const signed = await tronSignStrategy.sign(PK, tx as never);
    expect((signed as any).signature).toHaveLength(2);
    expect((signed as any).signature[0]).toBe("ff".repeat(65));
  });

  it("accepts a visible (base58) transaction", async () => {
    const raw = JSON.parse(JSON.stringify(RAW_DATA));
    raw.contract[0].parameter.value.owner_address = TronWeb.address.fromHex(OWNER);
    raw.contract[0].parameter.value.to_address = TronWeb.address.fromHex(TO);
    const shell = { visible: true, raw_data: raw, raw_data_hex: "", txID: "" };
    const pb = tronUtils.transaction.txJsonToPb(shell as never);
    const tx = {
      ...shell,
      raw_data_hex: tronUtils.transaction.txPbToRawDataHex(pb).toLowerCase(),
      txID: tronUtils.transaction.txPbToTxID(pb).replace(/^0x/, ""),
    };
    const signed = await tronSignStrategy.sign(PK, tx as never);
    expect((signed as any).signature).toHaveLength(1);
  });
});

describe("tx-integrity — pinned tronweb assumptions", () => {
  const UNENCODABLE = [
    "VoteAssetContract",
    "UnfreezeAssetContract",
    "CustomContract",
    "ShieldedTransferContract",
    "MarketSellAssetContract",
    "MarketCancelOrderContract",
  ];

  it.each(UNENCODABLE)(
    "tronweb still cannot re-encode %s (layer 2 legitimately skips it)",
    (name) => {
      const CT = (globalThis as any).TronWebProto.Transaction.Contract.ContractType;
      const c = new (globalThis as any).TronWebProto.Transaction.Contract();
      c.setType(CT[name.toUpperCase()]);
      const raw = new (globalThis as any).TronWebProto.Transaction.raw();
      raw.addContract(c);
      const hex = bytesToHex(raw.serializeBinary());
      expect(() =>
        tronUtils.transaction.txCheck({
          visible: false,
          raw_data: { contract: [{ type: name, parameter: { value: {} } }] },
          raw_data_hex: hex,
          txID: bytesToHex(sha256(hexToBytes(hex))),
        } as never),
      ).toThrow(/Unsupported transaction type/i);
    },
  );

  it("resolves contract type names against the protobuf enum by upper-casing", () => {
    const CT = (globalThis as any).TronWebProto.Transaction.Contract.ContractType;
    for (const name of [
      "TransferContract",
      "TriggerSmartContract",
      "AccountPermissionUpdateContract",
      "MarketSellAssetContract",
    ]) {
      expect(CT[name.toUpperCase()]).toBeTypeOf("number");
    }
  });
});

describe("tronSignStrategy.signTypedData", () => {
  const ADDRESS = TronWeb.address.fromPrivateKey(PK.slice(2)) as string;
  const domain = { name: "SunPerp", version: "1", chainId: 728126428 };
  const types = {
    Order: [
      { name: "trader", type: "address" },
      { name: "size", type: "uint256" },
    ],
  };
  const message = { trader: ADDRESS, size: "1000000" };

  it("produces a signature that recovers to the signing address", async () => {
    const out = await tronSignStrategy.signTypedData(PK, { domain, types, message });
    expect(out.primaryType).toBe("Order");
    expect(out.digest).toBe(tronUtils.typedData.TypedDataEncoder.hash(domain, types, message));
    const recovered = tronUtils.typedData.verifyTypedData(domain, types, message, out.signature);
    expect(TronWeb.address.fromHex(`41${recovered.replace(/^0x/, "")}`)).toBe(ADDRESS);
  });

  it("honours an explicitly supplied primaryType", async () => {
    const out = await tronSignStrategy.signTypedData(PK, {
      domain,
      types,
      primaryType: "Order",
      message,
    });
    expect(out.primaryType).toBe("Order");
  });

  it("wraps hashing failures in a ChainError(signing_rejected)", async () => {
    await expect(
      tronSignStrategy.signTypedData(PK, {
        domain,
        types,
        message: { trader: "not-an-address", size: "1" },
      }),
    ).rejects.toMatchObject({ code: "signing_rejected" });
  });
});
