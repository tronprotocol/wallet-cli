import { describe, expect, it } from "vitest";
import { networkBlock, type NetworkDescriptor } from "../../../plugin-api/domain.js";
import { GASFREE_NETWORK_DEFAULTS, gasfreeNetworkConfig } from "./network.js";

const NILE = {
  id: "tron:3448148188",
  family: "tron",
  chainId: "3448148188",
  nativeSymbol: "TRX",
  testnet: true,
  feeModel: "tron-resource",
  capabilities: [],
  httpEndpoint: "https://nile.trongrid.io",
} as unknown as NetworkDescriptor;

function resolve(network: NetworkDescriptor) {
  return gasfreeNetworkConfig(network, networkBlock(network, "gasfree"));
}

describe("gasfreeNetworkConfig", () => {
  it("uses the builtin block when the user wrote none", () => {
    expect(resolve(NILE)).toEqual(GASFREE_NETWORK_DEFAULTS["tron:3448148188"]);
    expect(resolve({ ...NILE, id: "tron:2494104990" } as NetworkDescriptor)).toBeUndefined();
  });

  it("replaces the builtin block whole with the block the user wrote", () => {
    const written = { baseUrl: "https://custom.example" };
    expect(resolve({ ...NILE, extensions: { gasfree: written } })).toEqual(written);
    expect(resolve({ ...NILE, extensions: { gasfree: null } })).toBeNull();
  });

  it("gives an EVM network no GasFree service even with a block", () => {
    const evm = { ...NILE, id: "eip155:1", family: "evm", extensions: { gasfree: {} } };
    expect(resolve(evm as unknown as NetworkDescriptor)).toBeUndefined();
  });
});
