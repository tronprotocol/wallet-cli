import type { NetworkDescriptor } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { ProviderCatalogPort, ProviderListInput } from "../ports/provider-catalog.js";
import type { X402PayInput, X402PaymentPort } from "../ports/x402-payment.js";
import type { X402ServeInput, X402ServerPort } from "../ports/x402-server.js";

import type { NetworkRegistry } from "../ports/network-registry.js";

export class X402Service {
  constructor(
    private readonly payments: X402PaymentPort,
    private readonly catalog: ProviderCatalogPort,
    private readonly networks: Pick<NetworkRegistry, "resolve">,
    private readonly server?: X402ServerPort,
  ) {}

  prepare(scope: TransactionScope, network: NetworkDescriptor): void {
    this.payments.prepare(scope, network);
  }

  pay(scope: TransactionScope, network: NetworkDescriptor, input: X402PayInput) {
    return this.payments.pay(scope, network, input);
  }

  providerList(input: ProviderListInput) {
    const network = input.network;
    // Catalog filters need no RPC configuration for an explicit chain ID.
    // Resolve names through the same registry used by global --network.
    const canonical =
      network && !/^(?:tron|eip155):(?:[0-9]+|0x[0-9a-f]+)$/i.test(network)
        ? this.networks.resolve(network).id
        : network;
    return this.catalog.list({
      ...input,
      ...(canonical === undefined ? {} : { network: canonical }),
    });
  }

  providerShow(fqn: string) {
    return this.catalog.show(fqn);
  }

  providerEndpoints(fqn: string) {
    return this.catalog.endpoints(fqn);
  }

  providerUpdate() {
    return this.catalog.update();
  }

  validate(network: NetworkDescriptor, input: X402ServeInput): void {
    if (!this.server) throw new Error("x402 server is not available in this runtime");
    this.server.validate(network, input);
    this.payments.validateConfiguration?.(network, input);
  }

  async serve(network: NetworkDescriptor, input: X402ServeInput) {
    if (!this.server) throw new Error("x402 server is not available in this runtime");
    const handle = await this.server.start(network, input);
    return handle.details;
  }

  async roundtrip(scope: TransactionScope, network: NetworkDescriptor, input: X402ServeInput) {
    if (!this.server) throw new Error("x402 server is not available in this runtime");
    const handle = await this.server.start(network, { ...input, accessLog: "debug" });
    try {
      const pay = await this.payments.pay(scope, network, {
        url: String(handle.details.payUrl),
        method: "GET",
        headers: [],
        token: input.token,
        scheme: input.scheme,
        expectedPayTo: input.payTo,
        asset: input.asset,
        decimals: input.decimals,
        exactAmount: input.rawAmount === undefined ? (input.amount ?? "0.0001") : undefined,
        maxAmount: input.rawAmount === undefined ? (input.amount ?? "0.0001") : undefined,
        maxRawAmount: input.rawAmount,
        dryRun: input.dryRun,
        gasfreeRelay: input.gasfreeRelay,
        maxGasfreeFee: input.maxGasfreeFee,
        maxGasfreeFeeRaw: input.maxGasfreeFeeRaw,
      });
      return { serve: handle.details, pay };
    } finally {
      await handle.close();
    }
  }
}
