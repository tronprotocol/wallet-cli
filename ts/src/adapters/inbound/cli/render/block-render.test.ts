/**
 * `block` renders each family's RAW node object.
 *
 * The JSON contract for this command is deliberately "what the node said", so the two families
 * arrive in different shapes: TRON nests the header under `block_header.raw_data` and reports
 * milliseconds, while an EVM node returns a flat object of hex QUANTITY values and seconds.
 * Normalizing for humans is therefore this renderer's job, and only this renderer's.
 */
import { describe, it, expect } from "vitest";
import { TextFormatters } from "./index.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";

const ctxFor = (family: "tron" | "evm") => ({
  command: "block",
  net: { family } as NetworkDescriptor,
});

const TRON_BLOCK = {
  blockID: "0000000000abcdef",
  block_header: { raw_data: { number: 1234567, timestamp: 1722925264000 } },
  transactions: [{}, {}],
};

const EVM_BLOCK = {
  number: "0x12d687",
  timestamp: "0x66b1c0d0",
  hash: "0xabc",
  transactions: ["0xdead", "0xbeef"],
};

describe("block renderer", () => {
  it("reads TRON's nested header and millisecond timestamp", () => {
    const out = TextFormatters.block!({ block: TRON_BLOCK }, ctxFor("tron"))!;

    expect(out).toContain("1,234,567");
    expect(out).toContain("2024-08-06 06:21:04 UTC");
    expect(out).toContain("2");
  });

  it("decodes EVM hex quantities instead of printing them raw", () => {
    const out = TextFormatters.block!({ block: EVM_BLOCK }, ctxFor("evm"))!;

    expect(out).toContain("1,234,567");
    expect(out).not.toContain("0x12d687");
  });

  // Seconds read as milliseconds would date every EVM block to 1970.
  it("treats the EVM timestamp as seconds", () => {
    const out = TextFormatters.block!({ block: EVM_BLOCK }, ctxFor("evm"))!;

    expect(out).toContain("2024-08-06 06:21:04 UTC");
    expect(out).not.toContain("1970");
  });

  it("counts EVM transactions", () => {
    expect(TextFormatters.block!({ block: EVM_BLOCK }, ctxFor("evm"))!).toContain("2");
  });

  it("says unknown rather than crashing when the chain has no such block", () => {
    const out = TextFormatters.block!({ block: null }, ctxFor("evm"))!;

    expect(out).toContain("unknown");
  });
});
