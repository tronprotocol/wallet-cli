import { describe, expect, it } from "vitest";
import { TronRpcClient } from "./tron.js";

const OWNER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const TARGET = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function client(): TronRpcClient {
  const client = new TronRpcClient("https://node.invalid", 100);
  client.tronweb.trx.getCurrentRefBlockParams = (async () => ({
    ref_block_bytes: "1234",
    ref_block_hash: "0011223344556677",
    expiration: 1_900_000_060_000,
    timestamp: 1_900_000_000_000,
  })) as never;
  return client;
}

function valueOf(transaction: unknown): Record<string, unknown> {
  return (
    transaction as {
      raw_data: {
        contract: Array<{ parameter: { value: Record<string, unknown> } }>;
      };
    }
  ).raw_data.contract[0]!.parameter.value;
}

describe("TRON local account transaction builders", () => {
  it("builds AccountCreateContract with the exact owner and target", async () => {
    const gateway = client();
    const transaction = await gateway.buildAccountCreate(OWNER, TARGET);
    const decoded = gateway.decodeTransactionHex(
      gateway.encodeTransactionHex(transaction),
    );

    expect(decoded.raw_data.contract[0]?.type).toBe("AccountCreateContract");
    expect(valueOf(decoded)).toMatchObject({
      owner_address: gateway.tronweb.address.toHex(OWNER).toUpperCase(),
      account_address: gateway.tronweb.address.toHex(TARGET).toUpperCase(),
    });
  });

  it("preserves a UTF-8 account name through complete protobuf encoding", async () => {
    const gateway = client();
    const name = "金库-A";
    const transaction = await gateway.buildAccountUpdate(OWNER, name);
    const decoded = gateway.decodeTransactionHex(
      gateway.encodeTransactionHex(transaction),
    );

    expect(decoded.raw_data.contract[0]?.type).toBe("AccountUpdateContract");
    expect(String(valueOf(decoded).account_name).toLowerCase()).toBe(
      Buffer.from(name, "utf8").toString("hex"),
    );
  });

  it("accepts and losslessly encodes a 30-byte ID despite TronWeb 6.4's hex-length bug", async () => {
    const gateway = client();
    const accountId = "账".repeat(10);
    expect(Buffer.byteLength(accountId, "utf8")).toBe(30);

    const transaction = await gateway.buildSetAccountId(OWNER, accountId);
    const decoded = gateway.decodeTransactionHex(
      gateway.encodeTransactionHex(transaction),
    );

    expect(decoded.raw_data.contract[0]?.type).toBe("SetAccountIdContract");
    expect(String(valueOf(decoded).account_id).toLowerCase()).toBe(
      Buffer.from(accountId, "utf8").toString("hex"),
    );
  });
});
