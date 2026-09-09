import type { NetworkDescriptor } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { ProviderCatalogPort, ProviderListInput } from "../ports/provider-catalog.js";
import type { X402PayInput, X402PaymentPort } from "../ports/x402-payment.js";
import type { X402ServeInput, X402ServerPort } from "../ports/x402-server.js";

export class X402Service {
  constructor(
    private readonly payments: X402PaymentPort,
    private readonly catalog: ProviderCatalogPort,
    private readonly server?: X402ServerPort,
  ) {}

  pay(scope: TransactionScope, network: NetworkDescriptor, input: X402PayInput) {
    return this.payments.pay(scope, network, input);
  }

  providerList(input: ProviderListInput) {
    return this.catalog.list(input);
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
  }

  async serve(network: NetworkDescriptor, input: X402ServeInput) {
    if (!this.server) throw new Error("x402 server is not available in this runtime");
    const handle = await this.server.start(network, input);
    return handle.details;
  }

  async roundtrip(scope: TransactionScope, network: NetworkDescriptor, input: X402ServeInput) {
    if (!this.server) throw new Error("x402 server is not available in this runtime");
    const handle = await this.server.start(network, input);
    try {
      const pay = await this.payments.pay(scope, network, {
        url: String(handle.details.payUrl),
        method: "GET",
        headers: [],
        token: input.token,
        scheme: input.scheme,
        expectedPayTo: input.payTo,
        exactAmount: input.amount,
        maxAmount: input.amount,
      });
      return { serve: handle.details, pay };
    } finally {
      await handle.close();
    }
  }
}
