import { singleLineErrorValue } from "../../../../domain/errors/index.js";
import { escapeControls, sanitizeText } from "../render/scalars.js";

const MASK = "********";

// A JSON number, true, false or null at the scan position.
const PRIMITIVE = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;

// The forms a credential takes in written text: raw and as an error value is written on one line,
// each also as the text renderers sanitize and escape it, and each also JSON-escaped; plus the
// JSON-escaped value with `/` written as `\/`, as some JSON encoders write it.
function writtenForms(credential: string): string[] {
  return [credential, singleLineErrorValue(credential)]
    .flatMap((form) => [
      form,
      sanitizeText(form),
      escapeControls(form),
      escapeControls(sanitizeText(form)),
    ])
    .flatMap((form) => [form, JSON.stringify(form).slice(1, -1)])
    .concat(JSON.stringify(credential).slice(1, -1).replaceAll("/", "\\/"));
}

// Longer first, so a credential containing another is masked whole.
function byLength(forms: Iterable<string>): string[] {
  return [...new Set(forms)].filter((f) => f !== "").sort((a, b) => b.length - a.length);
}

function replaceAll(text: string, forms: readonly string[]): string {
  return forms.reduce((masked, form) => masked.split(form).join(MASK), text);
}

// Replaces configured credentials in what is written: by text in text output, by token in JSON, so a
// masked JSON frame stays valid JSON and a frame without a credential is written unchanged.
export class CredentialMask {
  readonly #values: ReadonlySet<string>;
  readonly #forms: readonly string[];

  constructor(credentials: readonly string[]) {
    const values = credentials.filter((c) => c !== "");
    this.#values = new Set(values);
    this.#forms = byLength(values.flatMap(writtenForms));
  }

  text(text: string): string {
    return replaceAll(text, this.#forms);
  }

  // Text that is not valid JSON is masked as text.
  json(text: string): string {
    if (this.#values.size === 0) return text;
    let out = "";
    let i = 0;
    while (i < text.length) {
      const char = text[i]!;
      if (char === '"') {
        let end = i + 1;
        while (end < text.length && text[end] !== '"') end += text[end] === "\\" ? 2 : 1;
        if (end >= text.length) return this.text(text);
        const token = text.slice(i, end + 1);
        const masked = this.#string(token);
        if (masked === undefined) return this.text(text);
        out += masked;
        i = end + 1;
        continue;
      }
      PRIMITIVE.lastIndex = i;
      const primitive = PRIMITIVE.exec(text);
      if (primitive !== null) {
        out += this.#values.has(primitive[0]) ? JSON.stringify(MASK) : primitive[0];
        i += primitive[0].length;
        continue;
      }
      out += char;
      i++;
    }
    return out;
  }

  // The token unchanged when no credential occurs in it; undefined when it is not a JSON string.
  #string(token: string): string | undefined {
    let decoded: string;
    try {
      decoded = token.includes("\\") ? (JSON.parse(token) as string) : token.slice(1, -1);
    } catch {
      return undefined;
    }
    const masked = replaceAll(decoded, this.#forms);
    return masked === decoded ? token : JSON.stringify(masked);
  }
}
