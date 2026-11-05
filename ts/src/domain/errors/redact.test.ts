import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { redactErrorMessage, setRedactedHomeDirectory } from "./redact.js";

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
    setRedactedHomeDirectory(homedir());
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

  it.each([
    ["bare", "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"],
    ["0x", "0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"],
    ["0X", "0XA1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4E5F60718293A4B5C6D7E8F90"],
  ])("redacts a %s 64-hex key", (_name, key) => {
    expect(redactErrorMessage(`key ${key} end`)).toBe("key [redacted] end");
  });

  it("keeps a bare TRON hex address", () => {
    const address = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";
    expect(redactErrorMessage(`to ${address}`)).toBe(`to ${address}`);
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
