/**
 * Text-mode renderers, split by command domain:
 *   family.ts  — FAMILY_RENDER per-family hook table (+ renderFamily)
 *   wallet.ts  — wallet create/import/list/… receipts
 *   account.ts — account/token queries (balance, info, history, portfolio, token book)
 *   tx.ts      — tx/stake/contract signing receipts + tx status/info
 *   stake.ts   — stake queries (info, delegated)
 *   vote.ts    — SR voting list/status views
 *   reward.ts  — voting/block reward views
 *   chain.ts   — chain queries (params, prices, node)
 *   sunswap.ts — SunSwap market queries (price)
 *   misc.ts    — config, networks, contract call/info, message sign, block
 * This barrel reassembles the one TextFormatters table command specs import.
 */
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import { structuredText } from "./structured.js";
import { ok } from "./layout.js";
import { WalletFormatters } from "./wallet.js";
import { AccountFormatters } from "./account.js";
import { AssetFormatters } from "./asset.js";
import { ExchangeFormatters } from "./exchange.js";
import { TxFormatters } from "./tx.js";
import { StakeFormatters } from "./stake.js";
import { VoteFormatters } from "./vote.js";
import { RewardFormatters } from "./reward.js";
import { ChainFormatters } from "./chain.js";
import { MiscFormatters } from "./misc.js";
import { GovernanceFormatters } from "./governance.js";
import { PermissionFormatters } from "./permission.js";
import { MultisigFormatters } from "./multisig.js";
import { GasFreeFormatters } from "./gasfree.js";
import { SunSwapFormatters } from "./sunswap.js";
import { SunSwapLiquidityFormatters } from "./sunswap-liquidity.js";
import { SunSwapRemoveLiquidityFormatters } from "./sunswap-remove-liquidity.js";
import { SunSwapCollectFeesFormatters } from "./sunswap-collect-fees.js";
import { SunPumpTradeFormatters } from "./sunpump-trade.js";
import { SunPumpMarketFormatters } from "./sunpump-market.js";
import { SunPumpLaunchFormatters } from "./sunpump-launch.js";
import { SunSwapSwapFormatters } from "./sunswap-swap.js";
import { withTokenBookNotes } from "./token-book.js";
import { ContactFormatters } from "./contact.js";
import { EncodingFormatters } from "./encoding.js";

export { FAMILY_RENDER, renderFamily } from "./family.js";
export { renderErrorDetails } from "./error-details.js";

export const TextFormatters = {
  ...WalletFormatters,
  ...AccountFormatters,
  ...AssetFormatters,
  ...ExchangeFormatters,
  ...TxFormatters,
  ...StakeFormatters,
  ...VoteFormatters,
  ...RewardFormatters,
  ...ChainFormatters,
  ...MiscFormatters,
  ...GovernanceFormatters,
  ...PermissionFormatters,
  ...MultisigFormatters,
  ...GasFreeFormatters,
  ...SunSwapFormatters,
  // The liquidity receipts keep addresses out of their rows; a token resolved from the
  // user's own book is the exception, named in a note under the receipt.
  sunswapLiquidity: withTokenBookNotes(SunSwapLiquidityFormatters.sunswapLiquidity),
  sunswapRemoveLiquidity: withTokenBookNotes(
    SunSwapRemoveLiquidityFormatters.sunswapRemoveLiquidity,
  ),
  sunswapCollectFees: withTokenBookNotes(SunSwapCollectFeesFormatters.sunswapCollectFees),
  ...SunPumpTradeFormatters,
  ...SunPumpMarketFormatters,
  ...SunPumpLaunchFormatters,
  ...SunSwapSwapFormatters,
  ...ContactFormatters,
  ...EncodingFormatters,
};

export function renderGenericText(
  command: string,
  net: NetworkDescriptor | undefined,
  data: unknown,
): string {
  const lines: string[] = [`${ok()} ${command}`];
  if (net) lines.push(`  network: ${net.id}`);
  if (data !== undefined && data !== null) lines.push(structuredText(data, "  "));
  return lines.join("\n");
}
