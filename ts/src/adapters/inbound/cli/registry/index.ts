import type { ChainFamily } from "../../../../domain/types/index.js";
import { UsageError } from "../../../../domain/errors/index.js";
import type {
  ChainCommandDefinition,
  ChainSpec,
  CommandDefinition,
  FamilyBinding,
  StoredCommand,
} from "../contracts/index.js";

// A top-level command word declared by a plugin, for the root and group help.
export interface HelpGroup {
  readonly name: string;
  readonly summary: string;
  readonly description?: string;
  readonly families: readonly ChainFamily[];
}

export class CommandRegistry {
  #byPath = new Map<string, CommandDefinition>();
  #chainByPath = new Map<string, ChainCommandDefinition>();
  #groups = new Map<string, HelpGroup>();

  addGroup(group: HelpGroup): void {
    if (this.#groups.has(group.name)) throw new Error(`duplicate group ${group.name}`);
    this.#groups.set(group.name, group);
  }

  groups(): HelpGroup[] {
    return [...this.#groups.values()];
  }

  group(name: string): HelpGroup | undefined {
    return this.#groups.get(name);
  }

  // The first words of every registered command and group.
  topLevelWords(): Set<string> {
    return new Set([
      ...[...this.#byPath.values()].map((cmd) => cmd.path[0]!),
      ...[...this.#chainByPath.values()].map((cmd) => cmd.spec.path[0]!),
      ...this.#groups.keys(),
    ]);
  }

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
    if (existing.spec !== spec)
      throw new Error(`chain command ${key} registered with two different specs`);
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

  // Family-neutral commands run on any network family.
  neutralCapabilityKeys(): string[] {
    return [
      ...new Set(
        [...this.#byPath.values()].flatMap((cmd) => (cmd.capability ? [cmd.capability] : [])),
      ),
    ];
  }

  resolveNeutral(path: string[]): CommandDefinition | null {
    return this.#byPath.get(path.join(".")) ?? null;
  }

  all(): StoredCommand[] {
    return [...this.#byPath.values(), ...this.#chainByPath.values()];
  }
}

// An unknown first word may name a plugin that is not installed.
export function unknownCommand(registry: CommandRegistry, path: readonly string[]): UsageError {
  const known =
    registry.topLevelWords().has(path[0]!) || (registry.families() as string[]).includes(path[0]!);
  return new UsageError(
    "unknown_command",
    known
      ? `unknown command: ${path.join(" ")}`
      : `unknown command: ${path.join(" ")}; run 'wallet-cli plugin list' to see the installed plugins, or 'wallet-cli plugin install <name>' to add one`,
  );
}
