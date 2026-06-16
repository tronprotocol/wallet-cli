/**
 * CommandRegistry (L3) — holds all CommandDefinitions; resolves a concrete command from a
 * namespace + positional path; exposes metadata for CliShell (yargs tree) and HelpService.
 * Thin: tokenizing/flag-collection/help layout are yargs' job (修正②/變薄). (plan §3 L3)
 */
import type {
  ChainFamily,
  CommandDefinition,
  CommandRegistryLike,
  CommandTreeMeta,
} from "../types/index.js";

const NEUTRAL_NAMESPACES = ["wallet", "config", "chains", "capabilities"] as const;

function nsOf(cmd: CommandDefinition): string {
  return cmd.family ?? cmd.id.split(".")[0]!;
}

export class CommandRegistry implements CommandRegistryLike {
  #byKey = new Map<string, CommandDefinition>();

  add(cmd: CommandDefinition): void {
    const key = `${nsOf(cmd)}:${cmd.path.join(".")}`;
    if (this.#byKey.has(key)) throw new Error(`duplicate command ${key}`);
    this.#byKey.set(key, cmd);
  }

  families(): ChainFamily[] {
    const set = new Set<ChainFamily>();
    for (const cmd of this.#byKey.values()) if (cmd.family) set.add(cmd.family);
    return [...set];
  }

  neutralNamespaces(): string[] {
    return [...NEUTRAL_NAMESPACES];
  }

  resolveConcrete(ns: string, path: string[]): CommandDefinition | null {
    return this.#byKey.get(`${ns}:${path.join(".")}`) ?? null;
  }

  /** all commands under a namespace — used by CliShell to feed yargs arity from zod. */
  commandsOf(ns: string): CommandDefinition[] {
    return this.all().filter((c) => nsOf(c) === ns);
  }

  all(): CommandDefinition[] {
    return [...this.#byKey.values()];
  }

  tree(): CommandTreeMeta {
    const commands = this.all().map((c) => ({ ns: nsOf(c), path: c.path, id: c.id, summary: c.summary }));
    const namespaces = [...new Set(commands.map((c) => c.ns))];
    return { namespaces, commands };
  }
}
