import { describe, it, expect } from "vitest"
import { z } from "zod"
import { HelpService } from "./index.js"
import { CommandRegistry } from "../registry/index.js"
import type { ChainSpec, StreamManager } from "../contracts/index.js"

// ── minimal fakes ─────────────────────────────────────────────────────────────

function makeStream(): StreamManager & { last: string | undefined } {
  const s: any = {
    last: undefined,
    result(text: string) { s.last = text },
    diagnostic() {}, errorLine() {}, event() {}, readStdinOnce: () => "", warnings: () => [],
  }
  return s
}

function chainSpec(path: string[], shape: z.ZodRawShape): ChainSpec {
  return {
    path, network: "optional", wallet: "none", auth: "none",
    baseFields: z.object(shape), examples: [],
  }
}

function build(): { help: HelpService; stream: ReturnType<typeof makeStream> } {
  const reg = new CommandRegistry()
  reg.addChain(chainSpec(["block"], { number: z.string().optional() }), "tron", { run: async () => ({}) }) // single-segment leaf
  reg.addChain(chainSpec(["tx", "info"], { txid: z.string().min(1) }), "tron", { run: async () => ({}) }) // multi-segment leaf
  reg.addChain(chainSpec(["tx", "send"], { to: z.string() }), "tron", { run: async () => ({}) }) // sibling under the tx group
  const stream = makeStream()
  const help = new HelpService(reg, stream, "9.9.9")
  return { help, stream }
}

// ── --json-schema resolution ──────────────────────────────────────────────────

describe("HelpService --json-schema", () => {
  it("emits a multi-segment chain leaf's own input schema (not the catalog)", () => {
    const { help, stream } = build()
    help.handleMeta(["tx", "info", "--json-schema"])
    const out = JSON.parse(stream.last!)
    expect(out.properties).toHaveProperty("txid")
    expect(out).not.toHaveProperty("commands") // catalog shape has `commands`
  })

  it("still emits a single-segment chain leaf's input schema", () => {
    const { help, stream } = build()
    help.handleMeta(["block", "--json-schema"])
    const out = JSON.parse(stream.last!)
    expect(out.properties).toHaveProperty("number")
    expect(out).not.toHaveProperty("commands")
  })

  it("emits the machine catalog for a group head with no bare command", () => {
    const { help, stream } = build()
    help.handleMeta(["tx", "--json-schema"])
    const out = JSON.parse(stream.last!)
    expect(out).toHaveProperty("commands") // group head → catalog, not a phantom command schema
  })
})

describe("HelpService ChainCommandDefinition", () => {
  it("renders one chain leaf and one family-keyed catalog entry", () => {
    const reg = new CommandRegistry()
    reg.addChain({
      path: ["block"],
      network: "optional",
      wallet: "none",
      auth: "none",
      positionals: [{ field: "number" }],
      summary: "Get a block by number",
      examples: [],
      baseFields: z.object({ number: z.string().optional().describe("block number") }),
    }, "tron", { run: async () => ({}) })
    const stream = makeStream()
    const help = new HelpService(reg, stream, "9.9.9")

    help.handleMeta(["block", "--help"])
    expect(stream.last).toContain("Get a block by number")
    expect(stream.last!.match(/^  number\s/mg)).toHaveLength(1)

    help.handleMeta(["--json-schema"])
    const catalog = JSON.parse(stream.last!)
    expect(catalog.commands).toContainEqual(expect.objectContaining({ id: "block", families: ["tron"] }))
  })
})
