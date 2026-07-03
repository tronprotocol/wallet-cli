/**
 * CommandRegistry — holds all CommandDefinitions; resolves a command from a positional path
 * (+ family for chain commands); exposes metadata for CliShell (yargs tree) and HelpService.
 * Thin: tokenizing, flag collection, and help layout are yargs' job.
 *
 * Two command kinds, discriminated solely by `family`:
 *   - neutral (no family): addressed by its full path (create, import mnemonic, config get…).
 *   - chain  (family set): same logical path may have per-family impls, chosen by --network.
 */
import type { ChainFamily } from "../../../../domain/types/index.js";
import type { CommandDefinition, CommandRegistryLike } from "../contracts/index.js";
import { commandId } from "../command-id.js";

/** flat command-tree metadata for CliShell (yargs tree) + HelpService. */
export interface CommandTreeMeta {
  commands: Array<{ path: string[]; id: string; family?: ChainFamily; summary?: string }>;
}

/** storage/lookup key: family scopes chain commands; neutral commands share the empty scope. */
function keyOf(cmd: CommandDefinition): string {
  return `${cmd.family ?? ""}:${cmd.path.join(".")}`;
}

export class CommandRegistry implements CommandRegistryLike {
  #byKey = new Map<string, CommandDefinition>();

  add(cmd: CommandDefinition): void {
    // Family commands are selected through a resolved network, so this combination cannot be
    // dispatched. Keep this routing invariant here instead of coupling it to the run signature.
    if (cmd.family && cmd.network === "none") {
      throw new Error(`family command must resolve a network: ${commandId(cmd)}`);
    }
    const key = keyOf(cmd);
    if (this.#byKey.has(key)) throw new Error(`duplicate command ${key}`);
    this.#byKey.set(key, cmd);
  }

  families(): ChainFamily[] {
    const set = new Set<ChainFamily>();
    for (const cmd of this.#byKey.values()) if (cmd.family) set.add(cmd.family);
    return [...set];
  }

  /** command-backed capability keys per family (deduped). Summaries are resolved by the caller
   *  (runner) against CAP_SUMMARIES — the registry stays free of presentation/infra concerns. */
  capabilityKeysByFamily(): Map<ChainFamily, string[]> {
    const out = new Map<ChainFamily, Set<string>>();
    for (const cmd of this.#byKey.values()) {
      if (!cmd.family || !cmd.capability) continue;
      const set = out.get(cmd.family) ?? new Set<string>();
      set.add(cmd.capability);
      out.set(cmd.family, set);
    }
    return new Map([...out].map(([f, s]) => [f, [...s]]));
  }

  /** Resolve a neutral command (no family) by its full path. */
  resolveNeutral(path: string[]): CommandDefinition | null {
    return this.#byKey.get(`:${path.join(".")}`) ?? null;
  }

  /** All commands matching a logical path, regardless of family (used to pick by --network). */
  resolveCandidates(path: string[]): CommandDefinition[] {
    const key = path.join(".");
    return this.all().filter((c) => c.path.join(".") === key);
  }

  /** Family-specific implementation of a logical path. */
  resolveForFamily(path: string[], family: ChainFamily): CommandDefinition | null {
    return this.resolveCandidates(path).find((c) => c.family === family) ?? null;
  }

  all(): CommandDefinition[] {
    return [...this.#byKey.values()];
  }

  tree(): CommandTreeMeta {
    const commands = this.all().map((c) => ({ path: c.path, id: commandId(c), family: c.family, summary: c.summary }));
    return { commands };
  }
}
