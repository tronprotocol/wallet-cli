import type {
  GasFreeAddressInfo,
  GasFreeProviderConfig,
  GasFreeTokenConfig,
  GasFreeTransferRecord,
  NetworkDescriptor,
  SignedGasFreeAuthorization,
} from "../../domain/types/index.js";

export interface GasFreeProvider {
  listTokens(network: NetworkDescriptor): Promise<GasFreeTokenConfig[]>;
  listProviders(network: NetworkDescriptor): Promise<GasFreeProviderConfig[]>;
  getAddress(network: NetworkDescriptor, ownerAddress: string): Promise<GasFreeAddressInfo>;
  submitTransfer(
    network: NetworkDescriptor,
    authorization: SignedGasFreeAuthorization,
  ): Promise<GasFreeTransferRecord>;
  trace(network: NetworkDescriptor, traceId: string): Promise<GasFreeTransferRecord>;
}
