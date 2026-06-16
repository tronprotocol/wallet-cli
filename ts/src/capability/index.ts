/**
 * CapabilityGate (L3) — only checks same-family, cross-network capability differences
 * (e.g. Base has fee.eip1559, BSC is legacy-only). Existence is CommandRegistry's job;
 * family↔network mismatch is CliShell's. (修正④ / plan §3 L3)
 */
import type { CommandDefinition, NetworkDescriptor } from "../types/index.js";
import { CapabilityRegistry } from "../chain/index.js";
import { UsageError } from "../errors/index.js";

export class CapabilityGate {
  constructor(private readonly caps: CapabilityRegistry) {}

  check(cmd: CommandDefinition, net?: NetworkDescriptor): void {
    if (!cmd.capability || !net) return;
    if (!this.caps.supports(net.id, cmd.capability)) {
      throw new UsageError(
        "unsupported_network_capability",
        `${net.id} does not support ${cmd.capability}`,
      );
    }
  }
}
