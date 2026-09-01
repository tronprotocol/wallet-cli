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
  "tron:728126428": {
    id: "tron:728126428",
    nativeSymbol: "TRX",
    family: "tron",
    chainId: "728126428",
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
  "tron:3448148188": {
    id: "tron:3448148188",
    testnet: true,
    nativeSymbol: "TRX",
    family: "tron",
    chainId: "3448148188",
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
  "tron:2494104990": {
    id: "tron:2494104990",
    testnet: true,
    nativeSymbol: "TRX",
    family: "tron",
    chainId: "2494104990",
    httpEndpoint: "https://api.shasta.trongrid.io",
    tronlinkHttpEndpoint: "https://apishasta.walletadapter.org",
    feeModel: "tron-resource",
    capabilities: [],
  },
  // One L1 pair per chain. Endpoints are third-party public RPC: rate-limited, no SLA,
  // and they see the addresses queried. Production use should point these at a private gateway.
  "eip155:1": {
    id: "eip155:1",
    nativeSymbol: "ETH",
    family: "evm",
    chainId: "1",
    httpEndpoint: "https://ethereum-rpc.publicnode.com",
    feeModel: "evm-gas",
    capabilities: [],
  },
  "eip155:11155111": {
    id: "eip155:11155111",
    testnet: true,
    nativeSymbol: "ETH",
    family: "evm",
    chainId: "11155111",
    httpEndpoint: "https://ethereum-sepolia-rpc.publicnode.com",
    feeModel: "evm-gas",
    capabilities: [],
  },
  "eip155:56": {
    id: "eip155:56",
    nativeSymbol: "BNB",
    family: "evm",
    chainId: "56",
    httpEndpoint: "https://bsc-dataseed.bnbchain.org",
    feeModel: "evm-gas",
    capabilities: [],
  },
  "eip155:97": {
    id: "eip155:97",
    testnet: true,
    nativeSymbol: "BNB",
    family: "evm",
    chainId: "97",
    httpEndpoint: "https://bsc-testnet-dataseed.bnbchain.org",
    feeModel: "evm-gas",
    capabilities: [],
  },
};

/** The short name a person types, plus — for TRON only — the id this CLI carried before its
 *  canonical ids became CAIP-2. A flat map, so global uniqueness is structural: a duplicate key
 *  cannot exist. Each short name precedes its legacy spelling because listings show the FIRST
 *  entry pointing at an id, and the short name is the one worth showing.
 *
 *  The EVM networks get no legacy entry: they were never part of a published release, so no
 *  config.yaml or script can be holding an `evm:56` spelling to keep working. An alias is a
 *  promise to resolve something forever, and one nobody can have written is only clutter in
 *  `config aliases`.
 *
 *  There is deliberately no bare `evm` entry either — EVM is a family, not a chain, so it has no
 *  mainnet to claim the family name. */
export const BUILTIN_ALIASES: Record<string, string> = {
  tron: "tron:728126428",
  "tron:mainnet": "tron:728126428",
  nile: "tron:3448148188",
  "tron:nile": "tron:3448148188",
  shasta: "tron:2494104990",
  "tron:shasta": "tron:2494104990",
  ethereum: "eip155:1",
  sepolia: "eip155:11155111",
  bsc: "eip155:56",
  "bsc-testnet": "eip155:97",
};

export const DEFAULT_CONFIG = {
  defaultNetwork: "tron:728126428",
  defaultOutput: "text" as const,
  timeoutMs: 60000,
  waitTimeoutMs: 60000,
};
