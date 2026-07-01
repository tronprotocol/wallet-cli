import { describe, it, expect } from "vitest"
import { z } from "zod"
import { HelpService } from "./index.js"
import { CommandRegistry } from "../registry/index.js"
import type { CommandDefinition, StreamManager } from "../contracts/index.js"

// ── minimal fakes ─────────────────────────────────────────────────────────────

function makeStream(): StreamManager & { last: string | undefined } {
  const s: any = {
    last: undefined,
    result(text: string) { s.last = text },
    diagnostic() {}, errorLine() {}, event() {}, readStdinOnce: () => "", warnings: () => [],
  }
  return s
}

function chainCmd(path: string[], shape: z.ZodRawShape): CommandDefinition {
  const fields = z.object(shape)
  return {
    path, family: "tron", network: "optional", wallet: "none", auth: "none",
    fields, input: fields, examples: [], run: async () => ({}),
  } as unknown as CommandDefinition
}

function build(): { help: HelpService; stream: ReturnType<typeof makeStream> } {
  const reg = new CommandRegistry()
  reg.add(chainCmd(["block"], { number: z.string().optional() })) // single-segment leaf
  reg.add(chainCmd(["tx", "info"], { txid: z.string().min(1) })) // multi-segment leaf
  reg.add(chainCmd(["tx", "send"], { to: z.string() })) // sibling under the tx group
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
