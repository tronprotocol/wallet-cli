import { baseUnitAmount, type BaseUnits } from "../amounts/index.js";

// Max uint256: an ERC-20 or TRC-20 allowance that spending never lowers.
export const MAX_UINT256 = 2n ** 256n - 1n;
export const UNLIMITED_ALLOWANCE: BaseUnits = baseUnitAmount(MAX_UINT256);

// Base units, as integer text or a bigint.
export function isUnlimitedAllowance(amount: string | bigint): boolean {
  return BigInt(amount) === MAX_UINT256;
}
