/**
 * Builtin network defaults (plan §7.5 / §7.6). config.yaml overrides these per id.
 * TRON endpoints are HTTP fullHosts (tronweb); EVM are JSON-RPC URLs (viem).
 */
import type { NetworkDescriptor } from "../types/index.js";

const TRON_TX = ["account.balance.native", "tx.native.transfer", "tx.broadcast", "message.sign"];
const TRON_EXTRA = [
  "resources.energy",
  "resources.bandwidth",
  "staking.freeze",
  "staking.delegate",
  "governance.vote",
  "governance.proposal",
];
const EVM_TX = ["account.balance.native", "tx.native.transfer", "tx.broadcast", "message.sign"];

export const BUILTIN_NETWORKS: Record<string, NetworkDescriptor> = {
  "tron:mainnet": {
    id: "tron:mainnet", family: "tron", chainId: "mainnet", aliases: ["tron"],
    grpcEndpoint: "grpc.trongrid.io:50051", rpcUrl: "https://api.trongrid.io",
    feeModel: "tron-resource", capabilities: [...TRON_TX, ...TRON_EXTRA],
  },
  "tron:nile": {
    id: "tron:nile", family: "tron", chainId: "nile", aliases: ["nile"],
    grpcEndpoint: "grpc.nile.trongrid.io:50051", rpcUrl: "https://nile.trongrid.io",
    feeModel: "tron-resource", capabilities: [...TRON_TX, ...TRON_EXTRA],
  },
  "tron:shasta": {
    id: "tron:shasta", family: "tron", chainId: "shasta", aliases: ["shasta"],
    grpcEndpoint: "grpc.shasta.trongrid.io:50051", rpcUrl: "https://api.shasta.trongrid.io",
    feeModel: "tron-resource", capabilities: [...TRON_TX, ...TRON_EXTRA],
  },
  "evm:1": {
    id: "evm:1", family: "evm", chainId: "1", aliases: ["eth", "ethereum"],
    rpcUrl: "https://ethereum-rpc.publicnode.com", feeModel: "eip1559",
    capabilities: [...EVM_TX, "fee.eip1559"],
  },
  "evm:56": {
    id: "evm:56", family: "evm", chainId: "56", aliases: ["bsc", "bnb"],
    rpcUrl: "https://bsc-dataseed.binance.org", feeModel: "legacy",
    capabilities: [...EVM_TX],
  },
  "evm:11155111": {
    id: "evm:11155111", family: "evm", chainId: "11155111", aliases: ["sepolia"],
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com", feeModel: "eip1559",
    capabilities: [...EVM_TX, "fee.eip1559"],
  },
  "evm:8453": {
    id: "evm:8453", family: "evm", chainId: "8453", aliases: ["base"],
    rpcUrl: "https://mainnet.base.org", feeModel: "eip1559",
    capabilities: [...EVM_TX, "fee.eip1559"],
  },
  "evm:10": {
    id: "evm:10", family: "evm", chainId: "10", aliases: ["optimism", "op"],
    rpcUrl: "https://mainnet.optimism.io", feeModel: "eip1559",
    capabilities: [...EVM_TX, "fee.eip1559"],
  },
};

export const DEFAULT_CONFIG = { defaultOutput: "text" as const, timeoutMs: 30000 };
