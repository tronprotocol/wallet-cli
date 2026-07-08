/**
 * Text-mode renderers, split by command domain:
 *   family.ts  — FAMILY_RENDER per-family hook table (+ renderFamily)
 *   wallet.ts  — wallet create/import/list/… receipts
 *   account.ts — account/token queries (balance, info, history, portfolio, token book)
 *   tx.ts      — tx/stake/contract signing receipts + tx status/info
 *   vote.ts    — SR voting list/status views
 *   reward.ts  — voting/block reward views
 *   misc.ts    — config, networks, contract call/info, message sign, block
 * This barrel reassembles the one TextFormatters table command specs import.
 */
import type { NetworkDescriptor } from "../../../../domain/types/index.js"
import { formatScalar } from "./scalars.js"
import { type Obj, ok } from "./layout.js"
import { WalletFormatters } from "./wallet.js"
import { AccountFormatters } from "./account.js"
import { TxFormatters } from "./tx.js"
import { VoteFormatters } from "./vote.js"
import { RewardFormatters } from "./reward.js"
import { MiscFormatters } from "./misc.js"

export { FAMILY_RENDER, renderFamily } from "./family.js"

export const TextFormatters = {
  ...WalletFormatters,
  ...AccountFormatters,
  ...TxFormatters,
  ...VoteFormatters,
  ...RewardFormatters,
  ...MiscFormatters,
}

export function renderGenericText(command: string, net: NetworkDescriptor | undefined, data: unknown): string {
  const lines: string[] = [`${ok()} ${command}`]
  if (net) lines.push(`  network: ${net.id}`)
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data as Obj)) {
      if (Array.isArray(v) && v.length > 0) {
        lines.push(`  ${k}:`)
        for (const item of v) lines.push(`    - ${formatScalar(item)}`)
      } else {
        lines.push(`  ${k}: ${formatScalar(v)}`)
      }
    }
  } else if (Array.isArray(data)) {
    for (const item of data) lines.push(`  - ${formatScalar(item)}`)
  } else if (data !== undefined && data !== null) {
    lines.push(`  ${String(data)}`)
  }
  return lines.join("\n")
}
