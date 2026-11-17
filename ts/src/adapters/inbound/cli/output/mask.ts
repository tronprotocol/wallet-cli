import { escapeControls, sanitizeText } from "../render/scalars.js";

const MASK = "********";

// Every form a credential takes in written output: raw, JSON-escaped, and as the text renderers escape it.
export function credentialForms(credentials: readonly string[]): string[] {
  const forms = new Set(
    credentials
      .filter((c) => c !== "")
      .flatMap((c) => [c, JSON.stringify(c).slice(1, -1), escapeControls(c), sanitizeText(c)]),
  );
  forms.delete("");
  // Longer first, so a credential containing another is masked whole.
  return [...forms].sort((a, b) => b.length - a.length);
}

export function maskForms(text: string, forms: readonly string[]): string {
  return forms.reduce((masked, form) => masked.split(form).join(MASK), text);
}
