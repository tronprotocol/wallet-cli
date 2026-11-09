import { describe, expect, it } from "vitest";
import {
  assertPermitAuthorizes,
  assertSignedBy,
  PERMIT2_GRANT_TTL_SECONDS,
  type PermitExpectation,
} from "./permit2-guard.js";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const UNIVERSAL_ROUTER = "TQqgNg13s2DjvXhW1ky4v6TsR8wZGvb7Y4";
const PERMIT2 = "TTJxU3P8rHycAyFY4kVtGNfmnMH4ezcuM9";
const OWNER = "TDbWLnRxt8f7e81BBccGEKoSoDGR4pmnuJ";

const LIVE = {
  primaryType: "PermitSingle",
  domain: {
    name: "Permit2",
    chainId: 728126428,
    verifyingContract: "0xbe365314f2e77fd1257d60c346bb32dbda369403",
  },
  types: {
    PermitDetails: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
    PermitSingle: [
      { name: "details", type: "PermitDetails" },
      { name: "spender", type: "address" },
      { name: "sigDeadline", type: "uint256" },
    ],
  },
  message: {
    details: {
      token: "0xa614f803b6fd780986a42c78ec9c7f77e6ded13c",
      amount: "100000000",
      expiration: "1790230354",
      nonce: "0",
    },
    spender: "0xa31d689a84244bc01be56e07aeafb7686f56bb89",
    sigDeadline: "1790230354",
  },
};

const NOW = 1790226754; // sigDeadline minus the 3600s TTL

const EXPECT: PermitExpectation = {
  token: USDT,
  spender: UNIVERSAL_ROUTER,
  permit2: PERMIT2,
  chainId: "728126428",
  amount: "100000000",
  notAfter: NOW + 3600,
  now: NOW,
};

function mutate(path: string, value: unknown): unknown {
  const copy = structuredClone(LIVE) as Record<string, any>;
  const parts = path.split(".");
  let node = copy;
  for (const part of parts.slice(0, -1)) node = node[part];
  if (value === undefined) delete node[parts[parts.length - 1]!];
  else node[parts[parts.length - 1]!] = value;
  return copy;
}

describe("the real plan passes", () => {
  it("accepts the payload a mainnet planner produced", () => {
    expect(assertPermitAuthorizes(LIVE, EXPECT)).toEqual({
      token: USDT,
      spender: UNIVERSAL_ROUTER,
      permit2: PERMIT2,
      amount: "100000000",
      expiration: "1790230354",
      nonce: "0",
      sigDeadline: "1790230354",
    });
  });

  it("matches base58 expectations against EVM-hex fields", () => {
    expect(() => assertPermitAuthorizes(LIVE, EXPECT)).not.toThrow();
  });
});

describe("what it refuses to sign", () => {
  it("refuses a primary type that is not PermitSingle", () => {
    expect(() => assertPermitAuthorizes(mutate("primaryType", "PermitBatch"), EXPECT)).toThrow(
      /primary type is "PermitBatch", not PermitSingle/,
    );
  });

  it("refuses a spender that is not the Universal Router", () => {
    expect(() =>
      assertPermitAuthorizes(
        mutate("message.spender", "0xbe365314f2e77fd1257d60c346bb32dbda369403"),
        EXPECT,
      ),
    ).toThrow(/spender is 0xbe3653/);
  });

  it("refuses a token that is not the one being spent", () => {
    expect(() =>
      assertPermitAuthorizes(
        mutate("message.details.token", "0x891cdb91d149f23b1a45d9c5ca78a88d0cb44c18"),
        EXPECT,
      ),
    ).toThrow(/token is 0x891cdb/);
  });

  it("refuses an amount larger than the swap, including an unlimited one", () => {
    const max = (2n ** 160n - 1n).toString();
    expect(() => assertPermitAuthorizes(mutate("message.details.amount", max), EXPECT)).toThrow(
      /would authorize 1461501637330902918203684832716283019655932542975 of the token and this swap spends 100000000/,
    );
  });

  it("refuses an amount smaller than the swap too", () => {
    expect(() => assertPermitAuthorizes(mutate("message.details.amount", "1"), EXPECT)).toThrow(
      /authorize 1 of the token/,
    );
  });

  it("refuses another chain's verifying contract", () => {
    expect(() =>
      assertPermitAuthorizes(
        mutate("domain.verifyingContract", "0xa31d689a84244bc01be56e07aeafb7686f56bb89"),
        EXPECT,
      ),
    ).toThrow(/verifying contract is 0xa31d68/);
  });

  it("refuses another chain id", () => {
    expect(() => assertPermitAuthorizes(mutate("domain.chainId", 3448148188), EXPECT)).toThrow(
      /bound to chain 3448148188 and this network is 728126428/,
    );
  });

  it("refuses a domain that is not Permit2's", () => {
    expect(() => assertPermitAuthorizes(mutate("domain.name", "Permit"), EXPECT)).toThrow(
      /domain names "Permit" rather than Permit2/,
    );
  });

  it("refuses a deadline that has already passed", () => {
    expect(() =>
      assertPermitAuthorizes(mutate("message.sigDeadline", String(NOW - 1)), EXPECT),
    ).toThrow(/sigDeadline of 1790226753 has already passed/);
  });

  it("refuses a deadline further out than requested", () => {
    expect(() =>
      assertPermitAuthorizes(mutate("message.sigDeadline", String(NOW + 3601)), EXPECT),
    ).toThrow(/further out than the 3600 seconds requested/);
  });

  it("checks the permit's own expiration, not only the signature deadline", () => {
    expect(() =>
      assertPermitAuthorizes(mutate("message.details.expiration", String(NOW + 86400)), EXPECT),
    ).toThrow(/details\.expiration of \d+ is further out/);
  });

  it("refuses a renamed field in PermitDetails", () => {
    const renamed = [
      { name: "token", type: "address" },
      { name: "value", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ];
    expect(() => assertPermitAuthorizes(mutate("types.PermitDetails", renamed), EXPECT)).toThrow(
      /PermitDetails is \(token:address, value:uint160/,
    );
  });

  it("refuses an extra field appended to PermitSingle", () => {
    const extra = [...LIVE.types.PermitSingle, { name: "recipient", type: "address" }];
    expect(() => assertPermitAuthorizes(mutate("types.PermitSingle", extra), EXPECT)).toThrow(
      /PermitSingle is \(.*recipient:address\)/,
    );
  });

  it.each([
    ["types.PermitDetails", "declares no PermitDetails type"],
    ["types.PermitSingle", "declares no PermitSingle type"],
  ])("refuses a missing %s", (path, message) => {
    expect(() => assertPermitAuthorizes(mutate(path, undefined), EXPECT)).toThrow(message);
  });

  it.each([
    ["message.details.amount", "not a whole number"],
    ["message.details.nonce", "not a whole number"],
  ])("refuses a non-numeric %s", (path, message) => {
    expect(() => assertPermitAuthorizes(mutate(path, "0x10"), EXPECT)).toThrow(message);
  });

  it("refuses a payload that is not an object at all", () => {
    expect(() => assertPermitAuthorizes(null, EXPECT)).toThrow(/typed data is null/);
    expect(() => assertPermitAuthorizes("PermitSingle", EXPECT)).toThrow(/rather than an object/);
  });

  it("fails with permit_mismatch", () => {
    expect(() => assertPermitAuthorizes(mutate("primaryType", "PermitBatch"), EXPECT)).toThrow(
      expect.objectContaining({ code: "permit_mismatch" }),
    );
  });
});

describe("the signer", () => {
  it("accepts a signature that recovers to the account", () => {
    expect(() => assertSignedBy(OWNER, OWNER, "PermitSingle")).not.toThrow();
  });

  it("accepts the recovered address in EVM-hex form", () => {
    expect(() =>
      assertSignedBy("0x27c5d3a60860342244436a07f15b3b3186225aec", OWNER, "PermitSingle"),
    ).not.toThrow();
  });

  it("refuses a signature that recovers to another account", () => {
    expect(() => assertSignedBy(USDT, OWNER, "PermitSingle")).toThrow(
      expect.objectContaining({ code: "signing_rejected" }),
    );
  });

  it("refuses a signature over a different struct than the one checked", () => {
    expect(() => assertSignedBy(OWNER, OWNER, "PermitBatch")).toThrow(
      /hashed a PermitBatch rather than a PermitSingle/,
    );
  });
});

describe("grant lifetime", () => {
  it("lasts one hour", () => {
    expect(PERMIT2_GRANT_TTL_SECONDS).toBe(3600);
  });
});
