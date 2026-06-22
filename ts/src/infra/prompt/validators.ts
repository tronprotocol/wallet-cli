/** Pure input validators for the interactive prompt layer (no I/O). */
import { Derivation } from "../../core/derivation/index.js";

export const PASSWORD_SPECIALS = "!@#$%^&*()-_=+[]{};:,.?";

/** First-time master-password policy. Returns unmet requirements ([] = acceptable). */
export function passwordPolicyErrors(pw: string): string[] {
  const errs: string[] = [];
  if (pw.length < 8) errs.push("must be at least 8 characters");
  if (!/[A-Z]/.test(pw)) errs.push("must include an uppercase letter");
  if (!/[a-z]/.test(pw)) errs.push("must include a lowercase letter");
  if (!/[0-9]/.test(pw)) errs.push("must include a digit");
  const specials = new Set(PASSWORD_SPECIALS);
  if (![...pw].some((c) => specials.has(c))) errs.push(`must include a special character (${PASSWORD_SPECIALS})`);
  return errs;
}

export function isValidPrivateKeyHex(s: string): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(s.trim());
}

export function isValidMnemonic(s: string): boolean {
  return Derivation.validateMnemonic(s);
}
