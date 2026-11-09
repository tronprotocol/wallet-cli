const MASK = "********";

// Replaces every configured credential in rendered error text, raw or JSON-escaped.
export function maskCredentials(text: string, credentials: readonly string[]): string {
  const forms = new Set(
    credentials.filter((c) => c !== "").flatMap((c) => [c, JSON.stringify(c).slice(1, -1)]),
  );
  // Longer first, so a credential containing another is masked whole.
  return [...forms]
    .sort((a, b) => b.length - a.length)
    .reduce((masked, form) => masked.split(form).join(MASK), text);
}
