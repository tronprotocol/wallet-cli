import type { DispatchCheck } from "../contracts/deadline.js";
import type {
  GasFreeAddressInfo,
  GasFreeProviderConfig,
  GasFreeTokenConfig,
  GasFreeTransferRecord,
  NetworkDescriptor,
  SignedGasFreeAuthorization,
} from "../../domain/types/index.js";

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
