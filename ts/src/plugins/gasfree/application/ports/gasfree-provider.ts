import type { DispatchCheck } from "../../../../plugin-api/application.js";
import type { NetworkDescriptor } from "../../../../plugin-api/domain.js";
import type {
  GasFreeAddressInfo,
  GasFreeProviderConfig,
  GasFreeTokenConfig,
  GasFreeTransferRecord,
  SignedGasFreeAuthorization,
} from "../../domain/types.js";

export interface GasFreeProvider {
  listTokens(network: NetworkDescriptor, check: DispatchCheck): Promise<GasFreeTokenConfig[]>;
  listProviders(network: NetworkDescriptor, check: DispatchCheck): Promise<GasFreeProviderConfig[]>;
  getAddress(
    network: NetworkDescriptor,
    ownerAddress: string,
    check: DispatchCheck,
  ): Promise<GasFreeAddressInfo>;
  // `check` is the submit check; it runs again right before the request is sent.
  submitTransfer(
    network: NetworkDescriptor,
    authorization: SignedGasFreeAuthorization,
    check: DispatchCheck,
  ): Promise<GasFreeTransferRecord>;
  trace(
    network: NetworkDescriptor,
    traceId: string,
    check: DispatchCheck,
  ): Promise<GasFreeTransferRecord>;
}
