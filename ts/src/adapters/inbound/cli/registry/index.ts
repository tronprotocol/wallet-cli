/**
 * CommandRegistry — holds all commands; resolves one from a positional path; exposes metadata
 * for CliShell (yargs tree) and HelpService. Thin: tokenizing, flag collection, and help layout
 * are yargs' job.
 *
 * Two command kinds, in two maps:
 *   - neutral (CommandDefinition): full path, no chain target (create, import mnemonic, config get…).
 *   - chain (ChainCommandDefinition): one logical path + a family→binding table, chosen by --network.
 */
import type { ChainFamily } from "../../../../domain/types/index.js";
import type {
  ChainCommandDefinition,
  ChainSpec,
  CommandDefinition,
  FamilyBinding,
  StoredCommand,
} from "../contracts/index.js";

export class CommandRegistry {
  #byPath = new Map<string, CommandDefinition>();
  #chainByPath = new Map<string, ChainCommandDefinition>();

  add(cmd: CommandDefinition): void {
    const key = cmd.path.join(".");
    if (this.#byPath.has(key)) throw new Error(`duplicate command ${key}`);
    this.#byPath.set(key, cmd);
  }

  addChain(spec: ChainSpec, family: ChainFamily, binding: FamilyBinding): void {
    const key = spec.path.join(".");
    const existing = this.#chainByPath.get(key);
    if (!existing) {
      this.#chainByPath.set(key, { spec, families: { [family]: binding } });
      return;
    }
    if (existing.spec !== spec) throw new Error(`chain command ${key} registered with two different specs`);
    if (existing.families[family]) throw new Error(`duplicate command ${family}:${key}`);
    existing.families[family] = binding;
  }

  resolveChain(path: string[]): ChainCommandDefinition | null {
    return this.#chainByPath.get(path.join(".")) ?? null;
  }

  families(): ChainFamily[] {
    const set = new Set<ChainFamily>();
    for (const cmd of this.#chainByPath.values()) {
      for (const family of Object.keys(cmd.families)) set.add(family as ChainFamily);
    }
    return [...set];
  }

  /** command-backed capability keys per family (deduped). Summaries are resolved by the caller
   *  (runner) against CAP_SUMMARIES — the registry stays free of presentation/infra concerns. */
  capabilityKeysByFamily(): Map<ChainFamily, string[]> {
    const out = new Map<ChainFamily, Set<string>>();
    for (const cmd of this.#chainByPath.values()) {
      if (!cmd.spec.capability) continue;
      for (const family of Object.keys(cmd.families) as ChainFamily[]) {
        const set = out.get(family) ?? new Set<string>();
        set.add(cmd.spec.capability);
        out.set(family, set);
      }
    }
    return new Map([...out].map(([f, s]) => [f, [...s]]));
  }

  /** Resolve a neutral command by its full path. */
  resolveNeutral(path: string[]): CommandDefinition | null {
    return this.#byPath.get(path.join(".")) ?? null;
  }

  all(): StoredCommand[] {
    return [...this.#byPath.values(), ...this.#chainByPath.values()];
  }
}
