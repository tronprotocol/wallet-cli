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
export const TRAIT_SUMMARIES: Record<string, string> = {}

/** human-readable labels for command-backed capability keys (the keys commands declare via
 *  `capability`). Sibling of TRAIT_SUMMARIES; the runner resolves both the same way. */
export const CAP_SUMMARIES: Record<string, string> = {
  "account.balance.native": "native balance",
  "account.balance.token": "token balance",
  "account.portfolio": "holdings with USD valuation",
  "token.tokenbook": "token address-book (add/list/remove)",
  "tx.send": "transfer native / token",
  "tx.broadcast": "broadcast a presigned transaction",
  "tx.multisig.local": "inspect and append local multi-sign approvals",
  "message.sign": "sign a message",
  "contract.call": "constant + state-changing contract calls",
  "contract.deploy": "deploy a smart contract",
  "staking.freeze": "freeze/unfreeze (Stake 2.0)",
  "staking.delegate": "delegate/undelegate resource (Stake 2.0)",
  "vote.cast": "cast/replace SR votes",
  "vote.list": "list super representatives",
  "vote.status": "current SR votes and voting power",
  "reward.balance": "claimable voting/block reward",
  "reward.withdraw": "withdraw voting/block rewards",
  "permission.read": "read account multi-sign permissions",
  "permission.update": "replace account multi-sign permissions",
}

export const BUILTIN_NETWORKS: Record<string, NetworkDescriptor> = {
  "tron:mainnet": {
    id: "tron:mainnet",
    family: "tron",
    chainId: "mainnet",
    aliases: ["tron"],
    httpEndpoint: "https://api.trongrid.io",
    feeModel: "tron-resource",
    capabilities: [],
  },
  "tron:nile": {
    id: "tron:nile",
    family: "tron",
    chainId: "nile",
    aliases: ["nile"],
    httpEndpoint: "https://nile.trongrid.io",
    feeModel: "tron-resource",
    capabilities: [],
  },
  "tron:shasta": {
    id: "tron:shasta",
    family: "tron",
    chainId: "shasta",
    aliases: ["shasta"],
    httpEndpoint: "https://api.shasta.trongrid.io",
    feeModel: "tron-resource",
    capabilities: [],
  },
}

export const DEFAULT_CONFIG = {
  defaultNetwork: "tron:mainnet",
  defaultOutput: "text" as const,
  timeoutMs: 60000,
  waitTimeoutMs: 60000,
}
