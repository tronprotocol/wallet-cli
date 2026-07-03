import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { redactErrorMessage } from "./redact.js";

describe("redactErrorMessage", () => {
  it("collapses a URL with query/key to scheme://host", () => {
    const out = redactErrorMessage(
      "request to https://api.coingecko.com/api/v3/simple/price?x_cg_key=abc123 failed",
    );
    expect(out).toContain("https://api.coingecko.com");
    expect(out).not.toContain("x_cg_key");
    expect(out).not.toContain("abc123");
    expect(out).not.toContain("/api/v3");
  });

  it("strips userinfo and path segments (api key in path)", () => {
    const out = redactErrorMessage("https://user:pass@rpc.provider.com/v1/KEY123/jsonrpc bad");
    expect(out).toContain("https://rpc.provider.com");
    expect(out).not.toContain("KEY123");
    expect(out).not.toContain("user:pass");
  });

  it("replaces the home directory prefix with ~", () => {
    const path = `${homedir()}/.wallet-cli/config.yaml`;
    const out = redactErrorMessage(`corrupt JSON at ${path}`);
    expect(out).toContain("~/.wallet-cli/config.yaml");
    expect(out).not.toContain(homedir());
  });

  it("redacts long hex runs (potential private key / hash)", () => {
    const out = redactErrorMessage("boom: 0xdeadbeefcafedeadbeefcafedeadbeefcafedeadbeefcafe1234");
    expect(out).toContain("[redacted]");
    expect(out).not.toContain("deadbeefcafe");
  });

  it("passes an empty string through unchanged", () => {
    expect(redactErrorMessage("")).toBe("");
  });

  it("keeps ordinary semantic text (revert reason) readable", () => {
    expect(redactErrorMessage("REVERT opcode executed: insufficient balance")).toBe(
      "REVERT opcode executed: insufficient balance",
    );
  });
});
