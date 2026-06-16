/**
 * HelpService (L4) — --help / --version / --json-schema. zod-driven: every flag's help,
 * required/optional/default, examples, and the agent JSON-schema come from the command's
 * zod fields/input; one zod = validation + types + help + agent schema (修正②). (plan §3 L4)
 */
import { z } from "zod";
import type { CommandDefinition, ExitCode, StreamManager } from "../types/index.js";
import { CommandRegistry } from "../registry/index.js";
import { introspectFields } from "../adapter/index.js";

const META = new Set(["--help", "-h", "--version", "--json-schema"]);

export function hasMeta(tokens: string[]): boolean {
  return tokens.some((t) => META.has(t));
}

const CHAIN_NS = new Set(["tron", "evm"]);

export class HelpService {
  constructor(
    private readonly registry: CommandRegistry,
    private readonly streams: StreamManager,
    private readonly version: string,
  ) {}

  handleMeta(tokens: string[]): ExitCode {
    if (tokens.includes("--version")) {
      this.streams.result(this.version);
      return 0;
    }
    const positionals = tokens.filter((t) => !t.startsWith("-"));
    const cmd = this.#resolve(positionals);

    if (tokens.includes("--json-schema")) {
      if (!cmd) {
        this.streams.errorLine("--json-schema requires a command, e.g. `tron tx send-native --json-schema`");
        return 2;
      }
      this.streams.result(JSON.stringify(z.toJSONSchema(cmd.input), null, 2));
      return 0;
    }

    this.streams.result(cmd ? this.#renderCommand(cmd) : this.#renderTree());
    return 0;
  }

  #resolve(positionals: string[]): CommandDefinition | null {
    if (positionals.length === 0) return null;
    const ns = positionals[0]!;
    const path = positionals.slice(1);
    if (CHAIN_NS.has(ns)) return this.registry.resolveConcrete(ns, path);
    // neutral: capabilities has empty path; others take one action
    return this.registry.resolveConcrete(ns, path) ?? (ns === "capabilities" ? this.registry.resolveConcrete(ns, []) : null);
  }

  #renderTree(): string {
    const tree = this.registry.tree();
    const lines = ["wallet-cli — TRON + EVM standard CLI wallet", "", "Usage:", "  wallet-cli <namespace> [command] [flags]", "", "Commands:"];
    const byNs = new Map<string, string[]>();
    for (const c of tree.commands) {
      const arr = byNs.get(c.ns) ?? [];
      arr.push(`  ${[c.ns, ...c.path].join(" ").padEnd(28)} ${c.summary ?? ""}`);
      byNs.set(c.ns, arr);
    }
    for (const ns of [...byNs.keys()].sort()) lines.push(...byNs.get(ns)!);
    lines.push("", "Run `wallet-cli <command> --help` for command details, or `--json-schema` for the agent schema.");
    return lines.join("\n");
  }

  #renderCommand(cmd: CommandDefinition): string {
    const usageNs = cmd.family ?? cmd.id.split(".")[0]!;
    const lines = [
      `${cmd.id}${cmd.summary ? ` — ${cmd.summary}` : ""}`,
      "",
      "Usage:",
      `  wallet-cli ${[usageNs, ...cmd.path].join(" ")} [flags]`,
    ];
    if (cmd.network === "required") lines.push("", "Requires: --network <id|alias>");
    const fields = introspectFields(cmd.fields);
    if (fields.length) {
      lines.push("", "Flags:");
      for (const f of fields) {
        const req = f.optional || f.hasDefault ? "" : " (required)";
        const typ = f.baseType === "boolean" ? "" : ` <${f.baseType}>`;
        lines.push(`  --${f.kebab}${typ}${req}  ${f.description ?? ""}`);
      }
    }
    if (cmd.examples.length) {
      lines.push("", "Examples:");
      for (const e of cmd.examples) lines.push(`  ${e.cmd}${e.note ? `   # ${e.note}` : ""}`);
    }
    return lines.join("\n");
  }
}
