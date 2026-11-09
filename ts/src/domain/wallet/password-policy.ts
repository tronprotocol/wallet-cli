import { UsageError } from "../errors/index.js";

export const PASSWORD_SPECIALS = "!@#$%^&*()-_=+[]{};:,.?";

export function passwordPolicyErrors(pw: string): string[] {
  const errs: string[] = [];
  if (pw.length < 8) errs.push("must be at least 8 characters");
  if (!/[A-Z]/.test(pw)) errs.push("must include an uppercase letter");
  if (!/[a-z]/.test(pw)) errs.push("must include a lowercase letter");
  if (!/[0-9]/.test(pw)) errs.push("must include a digit");
  const specials = new Set(PASSWORD_SPECIALS);
  if (![...pw].some((c) => specials.has(c)))
    errs.push(`must include a special character (${PASSWORD_SPECIALS})`);
  return errs;
}

export function assertPasswordPolicy(pw: string): void {
  const errs = passwordPolicyErrors(pw);
  if (errs.length) throw new UsageError("weak_password", `password too weak: ${errs.join("; ")}`);
}
