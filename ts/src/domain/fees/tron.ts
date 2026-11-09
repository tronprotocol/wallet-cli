import { sunAmount, type Sun } from "../amounts/index.js";

// Maximum energy fee a TRON contract call may burn when the caller sets none: 100 TRX.
export const DEFAULT_FEE_LIMIT_SUN: Sun = sunAmount("100000000");

// Fixed estimate of what a TRX transfer burns when the sender has no free or staked bandwidth.
export const TRX_TRANSFER_BANDWIDTH_BURN_SUN = 100_000;
