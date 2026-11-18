// Authored layout, or an external value (with its text rendering when already composed).
export type MessagePart = string | { readonly value: string; readonly text?: string };

// Separates trusted layout from escaped external values: `message` keeps raw values for JSON,
// `textMessage` escapes their line separators for text output. `parts` keeps the two apart.
export interface UserMessage {
  readonly message: string;
  readonly textMessage: string;
  readonly parts?: readonly MessagePart[];
}

export function isUserMessage(value: unknown): value is UserMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as UserMessage).message === "string" &&
    typeof (value as UserMessage).textMessage === "string"
  );
}

// Escapes line separators before composing text output.
export function singleLineErrorValue(value: string): string {
  return value.replace(/[\n\r\u0085\u2028\u2029]/g, (char) => {
    if (char === "\n") return "\\n";
    if (char === "\r") return "\\r";
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
  });
}

// External values are escaped only when `escape` is set.
function renderMessageParts(parts: readonly MessagePart[], escape: boolean): string {
  let out = "";
  for (const part of parts) {
    if (typeof part === "string") out += part;
    else out += escape ? (part.text ?? singleLineErrorValue(part.value)) : part.value;
  }
  return out;
}

function partsOf(message: UserMessage): readonly MessagePart[] {
  return message.parts ?? [{ value: message.message, text: message.textMessage }];
}

// Escapes interpolated line separators for text output; preserves raw values for JSON.
// A nested message keeps its parts.
export function errorMessage(strings: TemplateStringsArray, ...values: unknown[]): UserMessage {
  const parts: MessagePart[] = [strings[0]!];
  for (const [index, value] of values.entries()) {
    if (isUserMessage(value)) parts.push(...partsOf(value));
    else parts.push({ value: String(value) });
    parts.push(strings[index + 1]!);
  }
  const kept = parts.filter((part) => part !== "");
  return {
    message: renderMessageParts(kept, false),
    textMessage: renderMessageParts(kept, true),
    parts: kept,
  };
}

export abstract class CliError extends Error {
  abstract readonly kind: "usage" | "execution";
  readonly textMessage: string;
  // Empty when the message is a plain string.
  readonly parts: readonly MessagePart[];
  constructor(
    public readonly code: string,
    message: string | UserMessage,
    public readonly details?: object,
  ) {
    super(typeof message === "string" ? message : message.message);
    this.textMessage = typeof message === "string" ? message : message.textMessage;
    this.parts = typeof message === "string" ? [] : (message.parts ?? []);
    this.name = new.target.name;
  }
  // The message with its parts, for composing another error.
  get userMessage(): UserMessage {
    return this.parts.length === 0
      ? { message: this.message, textMessage: this.textMessage }
      : { message: this.message, textMessage: this.textMessage, parts: this.parts };
  }
}

export class UsageError extends CliError {
  readonly kind = "usage" as const;
}

export class ExecutionError extends CliError {
  readonly kind = "execution" as const;
}
export class TransportError extends ExecutionError {}
export class ChainError extends ExecutionError {}
export class WalletError extends ExecutionError {}

// Redact unrecognized errors so library messages cannot expose secrets.
export function classifyError(e: unknown): CliError {
  if (e instanceof CliError) return e;
  if (e instanceof Error && e.name === "AbortError") {
    return new ChainError(
      "timeout",
      "operation aborted (timed out waiting for the device or network)",
    );
  }
  return new ExecutionError("internal_error", "an unexpected internal error occurred");
}
