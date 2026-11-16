import { CommandRegistry } from "../../../adapters/inbound/cli/registry/index.js";
import { FollowUpTable } from "../../../adapters/inbound/cli/output/errors.js";
import { CapabilityRegistry } from "../../../application/services/capability/index.js";
import { ErrorCodeTable, type ErrorCodeEntry } from "../../../domain/errors/codes.js";
import type { HostServices } from "../../../plugin-api/host-services.js";
import { BUILTIN_PLUGINS } from "../builtin.js";
import { registerPlugin } from "../host.js";

type Codes = Readonly<Record<string, ErrorCodeEntry>>;

class RecordingTable extends ErrorCodeTable {
  readonly declared: Record<string, ErrorCodeEntry>[] = [];
  override declare(codes: Codes): void {
    this.declared.push({ ...codes });
    super.declare(codes);
  }
}

// The codes each built-in plugin declares, as passed to the host, by plugin name.
export function builtinPluginErrorCodes(): Record<string, Codes> {
  const services = { config: { credential: () => undefined } } as unknown as HostServices;
  const result: Record<string, Codes> = {};
  for (const plugin of BUILTIN_PLUGINS) {
    const errorCodes = new RecordingTable();
    const registered = registerPlugin(plugin, {
      commands: new CommandRegistry(),
      capabilities: new CapabilityRegistry(),
      errorCodes,
      followUps: new FollowUpTable(),
      networks: [],
      services,
      timeoutMs: 0,
    });
    if (!registered.ok) throw new Error(`${plugin.name}: ${registered.reason}`);
    result[plugin.name] = Object.assign({}, ...errorCodes.declared);
  }
  return result;
}
