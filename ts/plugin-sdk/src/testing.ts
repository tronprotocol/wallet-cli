// Publishes the real plugin API in a test process, and the core pieces that plugin tests construct.
// Import it first, from a test setup file, before any module that imports a plugin-sdk entry.
// It inlines its own copy of the core, including its own dry-run guard state, so it must never run
// inside wallet-cli: there the host has published its API object, and this module refuses to load.
import { PLUGIN_API_GLOBAL, publishPluginApi } from "../../src/bootstrap/plugins/api-object.js";

// Set by this module; a test process may evaluate it more than once.
const TESTING_PROCESS = Symbol.for("wallet-cli.plugin-sdk.testing");
const scope = globalThis as Record<symbol, unknown>;
if (Object.hasOwn(scope, PLUGIN_API_GLOBAL) && scope[TESTING_PROCESS] !== true) {
  throw new Error(
    "@tron-walletcli/plugin-sdk/testing is for plugin tests only and cannot run inside wallet-cli; remove it from the plugin bundle",
  );
}
scope[TESTING_PROCESS] = true;
publishPluginApi();

export { CommandDeadline } from "../../src/application/services/command-deadline.js";
export {
  TxPipeline,
  type TronTxPipelineParams,
} from "../../src/application/services/pipeline/index.js";
export { SigningService } from "../../src/application/services/signing/signing-service.js";
export { PluginSigning } from "../../src/application/services/plugins/plugin-signing.js";
export { TronContractCalls } from "../../src/application/services/plugins/tron-contract-calls.js";
export {
  barBroadcasts,
  processBroadcastGuard,
} from "../../src/application/services/broadcast-guard.js";
export type { ChainGatewayProvider } from "../../src/application/ports/chain/gateway-provider.js";
export type { TronGateway } from "../../src/application/ports/chain/tron/tron-gateway.js";
export type { SignerResolver } from "../../src/application/services/signer/index.js";
export type { ExecutionContext } from "../../src/adapters/inbound/cli/contracts/execution-context.js";
export {
  chainInputSchema,
  composeRefines,
  parseInputSchema,
} from "../../src/adapters/inbound/cli/shell/index.js";
export { errorEnvelope, normalizeCliError } from "../../src/adapters/inbound/cli/output/errors.js";
export { parseTronTxInfo } from "../../src/adapters/outbound/chain/tron/tron-responses.js";
export {
  expiredCheck,
  expiringCheck,
} from "../../src/adapters/outbound/http/__test-support__/dispatch.js";
