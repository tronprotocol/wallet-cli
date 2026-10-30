import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chainInputSchema } from "../shell/index.js";
import type { FamilyBinding } from "../contracts/index.js";
import {
  contractDeployEvmBinding,
  contractDeploySpec,
  contractDeployTronBinding,
} from "./contract.js";
import type { EvmContractService } from "../../../../application/use-cases/evm/contract-service.js";
import type { TronContractService } from "../../../../application/use-cases/tron/contract-service.js";

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
    });
  });

  it("builds the signature from --constructor-params' inline types", async () => {
    const { run, deploy } = evmHarness();
    await run({
      code: "6080",
      constructorParams: '[{"type":"uint256","value":"42"},{"type":"string","value":"hello"}]',
    });

    expect(deploy.mock.calls[0]![2].constructorArgs).toEqual({
      source: "typed-params",
      types: ["uint256", "string"],
      values: ["42", "hello"],
    });
  });

  it("passes no arguments at all when none were given", async () => {
    const { run, deploy } = evmHarness();
    await run({ code: "6080" });

    expect(deploy.mock.calls[0]![2].constructorArgs).toEqual({ source: "none" });
  });
});

describe("contract deploy — input rules", () => {
  const parse = (input: Record<string, unknown>) =>
    chainInputSchema(contractDeploySpec, {} as FamilyBinding).input.safeParse({
      dryRun: false,
      signOnly: false,
      buildOnly: false,
      ...input,
    });

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
      /cannot be combined with --constructor-params/,
    );
  });

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

  it("counts --abi as a type source, since TRON encodes bare values against it", () => {
    // Include family fields so parsing retains --abi for the shared refine.
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

describe("contract deploy — TRON's ABI requirement", () => {
  const tronRefine = contractDeployTronBinding({} as never).refine!;
  const check = (input: Record<string, unknown>) => {
    const issues: { message: string }[] = [];
    tronRefine(input, { addIssue: (i: { message: string }) => issues.push(i) } as never);
    return issues.map((i) => i.message).join(" | ");
  };

  const tronIssues = (input: Record<string, unknown>) =>
    (
      chainInputSchema(contractDeploySpec, contractDeployTronBinding({} as never)).input.safeParse({
        dryRun: false,
        signOnly: false,
        buildOnly: false,
        feeLimit: "1",
        permissionId: 0,
        ...input,
      }).error?.issues ?? []
    ).map((i) => ({
      path: i.path.join("."),
      message: i.message,
      code: (i as { params?: { errorCode?: string } }).params?.errorCode,
    }));

  it("still demands an ABI when neither flag supplies one", () => {
    expect(tronIssues({ code: "6080" })).toEqual([
      {
        path: "abi",
        message: "provide exactly one of --abi or --artifact",
        code: "invalid_option",
      },
    ]);
  });

  it("is satisfied by --artifact", () => {
    expect(check({ artifact: "./build/contracts/Counter.json" })).toBe("");
  });

  it("is satisfied by --abi", () => {
    expect(check({ abi: "[]" })).toBe("");
  });

  it("refuses both at once rather than choosing", () => {
    expect(tronIssues({ abi: "[]", artifact: "./a.json" })).toEqual([
      {
        path: "abi",
        message: "provide exactly one of --abi or --artifact",
        code: "invalid_option",
      },
    ]);
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
