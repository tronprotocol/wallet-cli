/**
 * Builtin network defaults. config.yaml overrides these per id.
 * TRON endpoints are HTTP fullHosts (tronweb).
 */
import type { NetworkDescriptor } from "../../../domain/types/index.js";

// A network's `capabilities` lists only network-specific TRAITS — things not derivable from the
// command surface. Command-backed capabilities are derived from the registered commands'
// `capability` field and unioned in at composition time (runner). Single source.

/** human-readable labels for network-specific trait keys (the non command-backed capabilities above).
 *  Empty today — TRON carries no extra traits; the lookup path stays for future families. */
export const TRAIT_SUMMARIES: Record<string, string> = {};

/** human-readable labels for command-backed capability keys (the keys commands declare via
 *  `capability`). Sibling of TRAIT_SUMMARIES; the runner resolves both the same way. */
export const CAP_SUMMARIES: Record<string, string> = {
  "account.balance.native": "native balance",
  "account.balance.token": "token balance",
  "account.portfolio": "holdings with USD valuation",
  "account.activate": "activate a new TRON account",
  "account.set": "set one-time on-chain account name or ID",
  "token.tokenbook": "token address-book (add/list/remove)",
  "tx.send": "transfer native / token",
  "tx.sign": "sign transaction artifacts without broadcasting",
  "tx.broadcast": "broadcast a presigned transaction",
  "tx.multisig.local": "inspect and append local multi-sign approvals",
  "tx.multisig.tronlink": "coordinate multi-sign approvals through TronLink",
  "message.sign": "sign a message",
  "contract.call": "constant + state-changing contract calls",
  "contract.deploy": "deploy a smart contract",
  "contract.governance": "govern a deployed smart contract",
  "contract.create2": "compute TVM CREATE2 addresses",
  "proposal.read": "query governance proposals",
  "proposal.write": "create, approve, and delete governance proposals",
  "witness.manage": "register and operate an SR candidacy",
  "staking.freeze": "freeze/unfreeze (Stake 2.0)",
  "staking.delegate": "delegate/undelegate resource (Stake 2.0)",
  "vote.cast": "cast/replace SR votes",
  "vote.list": "list super representatives",
  "vote.status": "current SR votes and voting power",
  "reward.balance": "claimable voting/block reward",
  "reward.withdraw": "withdraw voting/block rewards",
  "permission.read": "read account multi-sign permissions",
  "permission.update": "replace account multi-sign permissions",
  "gasfree.info": "GasFree account, fee and nonce information",
  "gasfree.transfer": "TIP-712 gas-free token transfer",
  "gasfree.trace": "track a GasFree transfer",
};

export const BUILTIN_NETWORKS: Record<string, NetworkDescriptor> = {
  "tron:mainnet": {
    id: "tron:mainnet",
    nativeSymbol: "TRX",
    family: "tron",
    chainId: "mainnet",
    httpEndpoint: "https://api.trongrid.io",
    tronlinkHttpEndpoint: "https://api.walletadapter.org",
    gasfree: {
      baseUrl: "https://open.gasfree.io",
      apiPrefix: "/tron",
      controllerChainId: "728126428",
      verifyingContract: "TFFAMQLZybALaLb4uxHA9RBE7pxhUAjF3U",
    },
    feeModel: "tron-resource",
    capabilities: [],
  },
  "tron:nile": {
    id: "tron:nile",
    testnet: true,
    nativeSymbol: "TRX",
    family: "tron",
    chainId: "nile",
    httpEndpoint: "https://nile.trongrid.io",
    tronlinkHttpEndpoint: "https://apinile.walletadapter.org",
    gasfree: {
      baseUrl: "https://open-test.gasfree.io",
      apiPrefix: "/nile",
      controllerChainId: "3448148188",
      verifyingContract: "THQGuFzL87ZqhxkgqYEryRAd7gqFqL5rdc",
    },
    feeModel: "tron-resource",
    capabilities: [],
  },
  "tron:shasta": {
    id: "tron:shasta",
    testnet: true,
    nativeSymbol: "TRX",
    family: "tron",
    chainId: "shasta",
    httpEndpoint: "https://api.shasta.trongrid.io",
    tronlinkHttpEndpoint: "https://apishasta.walletadapter.org",
    feeModel: "tron-resource",
    capabilities: [],
  },
  // §2.2 — one L1 pair per chain. Endpoints are third-party public RPC: rate-limited, no SLA,
  // and they see the addresses queried. Production use should point these at a private gateway.
  "evm:1": {
    id: "evm:1",
    nativeSymbol: "ETH",
    family: "evm",
    chainId: "1",
    httpEndpoint: "https://ethereum-rpc.publicnode.com",
    feeModel: "evm-gas",
    capabilities: [],
  },
  "evm:11155111": {
    id: "evm:11155111",
    testnet: true,
    nativeSymbol: "ETH",
    family: "evm",
    chainId: "11155111",
    httpEndpoint: "https://ethereum-sepolia-rpc.publicnode.com",
    feeModel: "evm-gas",
    capabilities: [],
  },
  "evm:56": {
    id: "evm:56",
    nativeSymbol: "BNB",
    family: "evm",
    chainId: "56",
    httpEndpoint: "https://bsc-dataseed.bnbchain.org",
    feeModel: "evm-gas",
    capabilities: [],
  },
  "evm:97": {
    id: "evm:97",
    testnet: true,
    nativeSymbol: "BNB",
    family: "evm",
    chainId: "97",
    httpEndpoint: "https://bsc-testnet-dataseed.bnbchain.org",
    feeModel: "evm-gas",
    capabilities: [],
  },
};

/** §2.1 — one short name per builtin network. A flat map, so global uniqueness is structural:
 *  a duplicate key cannot exist. There is deliberately no `evm` entry — EVM is a family, not a
 *  chain, so it has no mainnet to claim the bare family name. */
export const BUILTIN_ALIASES: Record<string, string> = {
  tron: "tron:mainnet",
  nile: "tron:nile",
  shasta: "tron:shasta",
  ethereum: "evm:1",
  sepolia: "evm:11155111",
  bsc: "evm:56",
  "bsc-testnet": "evm:97",
};

export const DEFAULT_CONFIG = {
  defaultNetwork: "tron:mainnet",
  defaultOutput: "text" as const,
  timeoutMs: 60000,
  waitTimeoutMs: 60000,
};
