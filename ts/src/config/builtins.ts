/**
 * Builtin network defaults (plan §7.5 / §7.6). config.yaml overrides these per id.
 * TRON endpoints are HTTP fullHosts (tronweb); EVM are JSON-RPC URLs (viem).
 */
import type { NetworkDescriptor } from "../types/index.js";

// A network's `capabilities` lists only network-specific TRAITS — things not derivable from the
// command surface (e.g. EIP-1559 vs legacy fees). Command-backed capabilities come from each
// ChainModule.capabilities() and are unioned in at composition time (runner). Single source of truth.
const EIP1559 = ["fee.eip1559"];

export const BUILTIN_NETWORKS: Record<string, NetworkDescriptor> = {
  "tron:mainnet": {
    id: "tron:mainnet", family: "tron", chainId: "mainnet", aliases: ["tron"],
    grpcEndpoint: "grpc.trongrid.io:50051", rpcUrl: "https://api.trongrid.io",
    tronGridUrl: "https://api.trongrid.io",
    feeModel: "tron-resource", capabilities: [],
  },
  "tron:nile": {
    id: "tron:nile", family: "tron", chainId: "nile", aliases: ["nile"],
    grpcEndpoint: "grpc.nile.trongrid.io:50051", rpcUrl: "https://nile.trongrid.io",
    tronGridUrl: "https://nile.trongrid.io",
    feeModel: "tron-resource", capabilities: [],
  },
  "tron:shasta": {
    id: "tron:shasta", family: "tron", chainId: "shasta", aliases: ["shasta"],
    grpcEndpoint: "grpc.shasta.trongrid.io:50051", rpcUrl: "https://api.shasta.trongrid.io",
    tronGridUrl: "https://api.shasta.trongrid.io",
    feeModel: "tron-resource", capabilities: [],
  },
  "evm:1": {
    id: "evm:1", family: "evm", chainId: "1", aliases: ["eth", "ethereum"],
    rpcUrl: "https://ethereum-rpc.publicnode.com", feeModel: "eip1559",
    capabilities: [...EIP1559],
  },
  "evm:56": {
    id: "evm:56", family: "evm", chainId: "56", aliases: ["bsc", "bnb"],
    rpcUrl: "https://bsc-dataseed.binance.org", feeModel: "legacy",
    capabilities: [],
  },
  "evm:11155111": {
    id: "evm:11155111", family: "evm", chainId: "11155111", aliases: ["sepolia"],
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com", feeModel: "eip1559",
    capabilities: [...EIP1559],
  },
  "evm:8453": {
    id: "evm:8453", family: "evm", chainId: "8453", aliases: ["base"],
    rpcUrl: "https://mainnet.base.org", feeModel: "eip1559",
    capabilities: [...EIP1559],
  },
  "evm:10": {
    id: "evm:10", family: "evm", chainId: "10", aliases: ["optimism", "op"],
    rpcUrl: "https://mainnet.optimism.io", feeModel: "eip1559",
    capabilities: [...EIP1559],
  },
  "evm:42161": {
    id: "evm:42161", family: "evm", chainId: "42161", aliases: ["arbitrum", "arb"],
    rpcUrl: "https://arb1.arbitrum.io/rpc", feeModel: "eip1559",
    capabilities: [...EIP1559],
  },
};

export const DEFAULT_CONFIG = {
  defaultOutput: "text" as const,
  timeoutMs: 30000,
  // net=optional fallback (§7.5); config.yaml `defaults.network` overrides per family.
  defaults: { network: { tron: "tron:mainnet", evm: "evm:1" } },
};
