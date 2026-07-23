import { describe, expect, it } from "vitest";
import {
  canonicalTronLinkQuery,
  encodeTronLinkQuery,
  signTronLinkRequest,
  tronLinkAuthParameters,
} from "./auth.js";

describe("official TronLink multi-sign HMAC protocol", () => {
  it("matches the Java sorted-parameter signing fixture", () => {
    const auth = tronLinkAuthParameters(
      { secretId: "sid-fixture", secretKey: "key-fixture", channel: "wallet-cli" },
      () => 1_900_000_000_000,
      () => "00000000-0000-4000-8000-000000000001",
    );
    const parameters = { ...auth, address: "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7" };
    expect(canonicalTronLinkQuery(parameters)).toBe(
      "address=TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7&channel=wallet-cli&secret_id=sid-fixture&sign_version=v1&ts=1900000000000&uuid=00000000-0000-4000-8000-000000000001",
    );
    expect(signTronLinkRequest("get", "/multi/list", parameters, "key-fixture")).toEqual({
      canonical: "GET/multi/list?address=TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7&channel=wallet-cli&secret_id=sid-fixture&sign_version=v1&ts=1900000000000&uuid=00000000-0000-4000-8000-000000000001",
      signature: "+Gs+Mg1+QpaPCd6/LjVDdvfcyCC7MOYpb+G1Z2QFqwU=",
    });
  });

  it("URL-encodes only after signing using java.net.URLEncoder rules", () => {
    expect(encodeTronLinkQuery({ sign: "+/=" })).toBe("sign=%2B%2F%3D");
    expect(encodeTronLinkQuery({ value: "a b~c" })).toBe("value=a+b%7Ec");
  });
});
