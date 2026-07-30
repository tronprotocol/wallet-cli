import { describe, expect, it, vi } from "vitest";
import { AddressService } from "./address-service.js";

const SECRET = "0".repeat(63) + "1";

describe("AddressService", () => {
  it("uses a valid scalar, zeroizes its buffer, and omits it from the default result", () => {
    const writer = { write: vi.fn(() => "/safe/key.json") };
    const scalar = Uint8Array.from([...new Uint8Array(31), 1]);
    const result = new AddressService(
      "/safe",
      writer,
      () => scalar,
    ).generate({ printSecret: false });

    expect(result).toEqual({
      tron: "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC",
      evm: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
      secretFile: "/safe/key.json",
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(writer.write).toHaveBeenCalledWith(
      "/safe/generated/keypair-TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC",
      expect.objectContaining({ privateKey: SECRET }),
    );
    expect(scalar.every((byte) => byte === 0)).toBe(true);
  });

  it("returns the private key only when printSecret is explicit", () => {
    const writer = { write: vi.fn() };
    const result = new AddressService(
      "/safe",
      writer,
      () => Uint8Array.from([...new Uint8Array(31), 1]),
    ).generate({ printSecret: true });

    expect(result.privateKey).toBe(SECRET);
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("bounds rejection sampling when an entropy source is broken", () => {
    const random = vi.fn(() => new Uint8Array(32));
    expect(() =>
      new AddressService("/safe", { write: vi.fn() }, random)
        .generate({ printSecret: false })
    ).toThrow(/valid secp256k1/);
    expect(random).toHaveBeenCalledTimes(128);
  });
});
