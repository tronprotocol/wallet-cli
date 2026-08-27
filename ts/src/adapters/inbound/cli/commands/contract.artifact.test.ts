import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  contractDeployEvmBinding,
  contractDeploySpec,
  contractDeployTronBinding,
} from "./contract.js";
import type { EvmContractService } from "../../../../application/use-cases/evm/contract-service.js";
import type { TronContractService } from "../../../../application/use-cases/tron/contract-service.js";

/**
 * `--artifact`, `--constructor-signature` and `--constructor-args`.
 *
 * The defect these replace: `--constructor-params` was the only way to pass constructor arguments
 * on EVM, and it could not work — the encoder was handed an empty ABI, so every argument failed
 * with "expectedCount=0", and `--abi` (which would have supplied one) is a TRON-only flag. There
 * was no input that deployed a contract with constructor arguments on an EVM network.
 *
 * The rule that came out of it: the constructor's TYPES come from the compiler's ABI, or from a
 * signature the caller states — never from the values. A mistyped argument encodes cleanly and
 * deploys a contract built from the wrong arguments, and a deployment cannot be taken back.
 */

const CONSTRUCTOR_ABI = [
  {
    type: "constructor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "value", type: "uint256" },
      { name: "label", type: "string" },
    ],
  },
];

function artifactFile(body: unknown, name = "Counter.json"): string {
  const dir = mkdtempSync(join(tmpdir(), "wallet-cli-artifact-"));
  const path = join(dir, name);
  writeFileSync(path, typeof body === "string" ? body : JSON.stringify(body));
  return path;
}

/** Foundry nests the bytecode under `{object}`; Hardhat, sunhat and TronBox store the string. */
const foundryArtifact = () =>
  artifactFile({ abi: CONSTRUCTOR_ABI, bytecode: { object: "0x6080" } });
const hardhatArtifact = () =>
  artifactFile({ contractName: "Counter", abi: CONSTRUCTOR_ABI, bytecode: "0x6080" });

function evmHarness() {
  const deploy = vi.fn(async (_c: unknown, _n: unknown, _i: any) => ({
    kind: "contract-deploy" as const,
  }));
  const binding = contractDeployEvmBinding({ deploy } as unknown as EvmContractService);
  const run = (input: Record<string, unknown>) =>
    binding.run({} as never, {} as never, input as never);
  return { run, deploy };
}

function tronHarness() {
  const deploy = vi.fn(async (_c: unknown, _n: unknown, _i: Record<string, unknown>) => ({
    kind: "contract-deploy" as const,
  }));
  const binding = contractDeployTronBinding({ deploy } as unknown as TronContractService);
  const run = (input: Record<string, unknown>) =>
    binding.run({} as never, {} as never, { feeLimit: "1000000", ...input } as never);
  return { run, deploy };
}

describe("contract deploy — reading a compiler artifact", () => {
  it("takes the bytecode and the ABI from a Foundry artifact", async () => {
    const { run, deploy } = evmHarness();
    await run({ artifact: foundryArtifact(), constructorArgs: '["42","hello"]' });

    expect(deploy.mock.calls[0]![2]).toMatchObject({
      bytecode: "0x6080",
      constructorArgs: { source: "abi", abi: CONSTRUCTOR_ABI, values: ["42", "hello"] },
    });
  });

  it("takes them from a Hardhat / sunhat / TronBox artifact too", async () => {
    const { run, deploy } = evmHarness();
    await run({ artifact: hardhatArtifact(), constructorArgs: '["42","hello"]' });

    expect(deploy.mock.calls[0]![2]).toMatchObject({ bytecode: "0x6080" });
  });

  it("reports a missing artifact as a missing file, not as bad JSON", async () => {
    const { run } = evmHarness();

    await expect(run({ artifact: "/nope/Counter.json" })).rejects.toMatchObject({
      code: "file_not_found",
    });
  });

  it("reports an artifact that is not JSON", async () => {
    const { run } = evmHarness();

    await expect(run({ artifact: artifactFile("{not json") })).rejects.toMatchObject({
      code: "invalid_value",
      message: /not valid JSON/,
    });
  });

  it("names the fields it looked at when there is no bytecode", async () => {
    const { run } = evmHarness();

    await expect(run({ artifact: artifactFile({ abi: [] }) })).rejects.toMatchObject({
      code: "invalid_value",
      message: /bytecode\.object/,
    });
  });

  // solc emits "0x" for an interface or an abstract contract: a real artifact for something that
  // cannot be deployed. Deploying it would succeed and produce a contract with no code.
  it("refuses an interface or abstract contract instead of deploying nothing", async () => {
    const { run } = evmHarness();

    await expect(
      run({ artifact: artifactFile({ abi: [], bytecode: "0x" }) }),
    ).rejects.toMatchObject({ code: "invalid_value", message: /abstract|interface/ });
  });
});

describe("contract deploy — where the constructor's types come from", () => {
  it("uses the artifact's ABI when there is one", async () => {
    const { run, deploy } = evmHarness();
    await run({ artifact: foundryArtifact(), constructorArgs: '["42","hello"]' });

    expect(deploy.mock.calls[0]![2].constructorArgs.source).toBe("abi");
  });

  it("uses --constructor-signature when there is no ABI", async () => {
    const { run, deploy } = evmHarness();
    await run({
      code: "6080",
      constructorSignature: "constructor(uint256,string)",
      constructorArgs: '["42","hello"]',
    });

    expect(deploy.mock.calls[0]![2].constructorArgs).toEqual({
      source: "signature",
      signature: "constructor(uint256,string)",
      values: ["42", "hello"],
      flag: "--constructor-signature",
    });
  });

  // The shape this command shipped with. It still works — the types are simply read off the
  // entries and turned into the signature they describe, instead of being discarded.
  it("builds the signature from --constructor-params' inline types", async () => {
    const { run, deploy } = evmHarness();
    await run({
      code: "6080",
      constructorParams: '[{"type":"uint256","value":"42"},{"type":"string","value":"hello"}]',
    });

    expect(deploy.mock.calls[0]![2].constructorArgs).toEqual({
      source: "signature",
      signature: "constructor(uint256,string)",
      values: ["42", "hello"],
      flag: "--constructor-params",
    });
  });

  it("passes no arguments at all when none were given", async () => {
    const { run, deploy } = evmHarness();
    await run({ code: "6080" });

    expect(deploy.mock.calls[0]![2].constructorArgs).toEqual({ source: "none" });
  });
});

/**
 * Schema rules are asserted against the schema: calling a binding directly bypasses zod, so a
 * refine could say anything and the call would still succeed.
 */
describe("contract deploy — input rules", () => {
  const parse = (input: Record<string, unknown>) =>
    contractDeploySpec.baseFields
      .superRefine(contractDeploySpec.baseRefine!)
      .safeParse({ dryRun: false, signOnly: false, buildOnly: false, ...input });

  const message = (input: Record<string, unknown>) =>
    parse(input)
      .error?.issues.map((i) => i.message)
      .join(" | ") ?? "";

  it("accepts --artifact as a bytecode source", () => {
    expect(parse({ artifact: "./out/Counter.sol/Counter.json" }).success).toBe(true);
  });

  it("refuses --artifact together with --code or --code-file", () => {
    expect(parse({ artifact: "./a.json", code: "6080" }).success).toBe(false);
    expect(parse({ artifact: "./a.json", codeFile: "./a.bin" }).success).toBe(false);
  });

  it("refuses two argument lists at once", () => {
    expect(message({ code: "6080", constructorArgs: "[]", constructorParams: "[]" })).toMatch(
      /mutually exclusive/,
    );
  });

  // Both of these would mean encoding against one type source while the caller supplied two.
  it("refuses inline types beside an artifact rather than picking one", () => {
    expect(message({ artifact: "./a.json", constructorParams: "[]" })).toMatch(
      /types come from its ABI/,
    );
  });

  it("refuses a signature beside an artifact", () => {
    expect(message({ artifact: "./a.json", constructorSignature: "constructor()" })).toMatch(
      /not needed with --artifact/,
    );
  });

  it("refuses bare values with no type source, and says which flags supply one", () => {
    expect(message({ code: "6080", constructorArgs: '["42"]' })).toMatch(
      /--artifact.*--constructor-signature/,
    );
  });

  // --abi is TRON-only and IS the type source there. Leaving it out of this rule sent a TRON
  // caller to --constructor-signature, the one flag TRON refuses.
  it("counts --abi as a type source, since TRON encodes bare values against it", () => {
    // The shell parses baseFields EXTENDED with the family's own fields, so the refine sees --abi
    // on TRON. Parsing the base fields alone would strip it and prove nothing.
    const tronParse = contractDeploySpec.baseFields
      .extend(contractDeployTronBinding({} as never).fields!.shape)
      .superRefine(contractDeploySpec.baseRefine!)
      .safeParse({
        dryRun: false,
        signOnly: false,
        buildOnly: false,
        code: "6080",
        abi: "[]",
        constructorArgs: '["42"]',
      });

    expect(tronParse.success).toBe(true);
    expect(message({ code: "6080", constructorArgs: '["42"]' })).toMatch(/--abi also declares/);
  });

  it("accepts bare values once a type source is present", () => {
    expect(
      parse({
        code: "6080",
        constructorSignature: "constructor(uint256)",
        constructorArgs: '["42"]',
      }).success,
    ).toBe(true);
    expect(parse({ artifact: "./a.json", constructorArgs: '["42"]' }).success).toBe(true);
  });
});

/**
 * TRON is the one place the families genuinely differ: TronWeb's createSmartContract needs the
 * whole ABI, not just the constructor's types, so a signature cannot stand in for it. `--abi`
 * therefore stays required — but an artifact now satisfies it, which is the point: a TRON
 * developer using TronBox or sunhat already has that ABI in a file.
 */
describe("contract deploy — TRON's ABI requirement", () => {
  const tronRefine = contractDeployTronBinding({} as never).refine!;
  const check = (input: Record<string, unknown>) => {
    const issues: { message: string }[] = [];
    tronRefine(input, { addIssue: (i: { message: string }) => issues.push(i) } as never);
    return issues.map((i) => i.message).join(" | ");
  };

  it("still demands an ABI when neither flag supplies one", () => {
    expect(check({ code: "6080" })).toMatch(/TRON needs the contract's ABI/);
  });

  it("is satisfied by --artifact", () => {
    expect(check({ artifact: "./build/contracts/Counter.json" })).toBe("");
  });

  it("is satisfied by --abi", () => {
    expect(check({ abi: "[]" })).toBe("");
  });

  it("refuses both at once rather than choosing", () => {
    expect(check({ abi: "[]", artifact: "./a.json" })).toMatch(/pass one/);
  });

  it("says plainly that a signature cannot replace the ABI here", () => {
    expect(check({ abi: "[]", constructorSignature: "constructor(uint256)" })).toMatch(/full ABI/);
  });

  it("takes the ABI out of the artifact and passes bare values to TronWeb", async () => {
    const { run, deploy } = tronHarness();
    await run({ artifact: hardhatArtifact(), constructorArgs: '["42","hello"]' });

    expect(deploy.mock.calls[0]![2]).toMatchObject({
      abi: CONSTRUCTOR_ABI,
      bytecode: "0x6080",
      parameters: ["42", "hello"],
    });
  });

  it("keeps working with --abi and --constructor-params, the shape it shipped with", async () => {
    const { run, deploy } = tronHarness();
    await run({
      code: "6080",
      abi: JSON.stringify(CONSTRUCTOR_ABI),
      constructorParams: '[{"type":"uint256","value":"42"},{"type":"string","value":"hello"}]',
    });

    expect(deploy.mock.calls[0]![2]).toMatchObject({ parameters: ["42", "hello"] });
  });
});

/**
 * `--permission-id` and `--expiration` are TRON's multi-signature concepts. They sat in the
 * shared base fields, so an EVM `--help` listed them untagged beside the flags that are tagged
 * `(tron only)` — a reader had no way to tell they do nothing here.
 */
describe("contract deploy — TRON-only transaction flags are tagged", () => {
  it("keeps them off the EVM binding", () => {
    const keys = Object.keys(contractDeployEvmBinding({} as never).fields?.shape ?? {});
    expect(keys).not.toContain("permissionId");
    expect(keys).not.toContain("expiration");
  });

  it("keeps them out of the family-neutral base fields", () => {
    const keys = Object.keys(contractDeploySpec.baseFields.shape);
    expect(keys).not.toContain("permissionId");
    expect(keys).not.toContain("expiration");
  });

  it("offers them on the TRON binding", () => {
    const keys = Object.keys(contractDeployTronBinding({} as never).fields?.shape ?? {});
    expect(keys).toEqual(expect.arrayContaining(["permissionId", "expiration"]));
  });
});
