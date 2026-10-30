import { errorMessage, inputRef, UsageError } from "../errors/index.js";
import { utf8ByteLength } from "../tron/governance/limits.js";

export type AccountTextKind = "name" | "id";

// UTF-8 byte bounds the chain accepts for an account name and an account id.
export const ACCOUNT_TEXT_BYTES: Record<AccountTextKind, { min: number; max: number }> = {
  name: { min: 1, max: 32 },
  id: { min: 8, max: 32 },
};

// Control and format characters are refused; the input is named by its kind.
export function accountText(kind: AccountTextKind, value: string): string {
  const { min, max } = ACCOUNT_TEXT_BYTES[kind];
  const bytes = utf8ByteLength(value);
  if (bytes < min || bytes > max || /[\p{Cc}\p{Cf}]/u.test(value)) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef(kind)} must be ${min}-${max} safe UTF-8 bytes`,
    );
  }
  return value;
}
