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
