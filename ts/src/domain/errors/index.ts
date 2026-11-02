// An input named by its field; the inbound adapter spells it for its own interface.
export interface InputRef {
  readonly input: string;
}

// A next step the user can take; the inbound adapter names the command that performs it.
export type FollowUp =
  | "account-list"
  | "asset-info"
  | "bai-report-recharge"
  | "gasfree-trace"
  | "keystore-backup"
  | "ledger-import"
  | "proposal-list"
  | "sunswap-pool-list-v4"
  | "sunswap-position-list"
  | "sunswap-swap"
  | "token-add";

export interface FollowUpRef {
  readonly followUp: FollowUp;
  readonly subject?: string;
}

// Authored layout, an external value (with its text rendering when already composed), or a
// reference the inbound adapter spells.
export type MessagePart =
  string | { readonly value: string; readonly text?: string } | InputRef | FollowUpRef;

// Separates trusted layout from escaped external values. `message` names inputs by field;
// `parts`, when present, lets the inbound adapter spell the references for its interface.
export interface UserMessage {
  readonly message: string;
  readonly textMessage: string;
  readonly parts?: readonly MessagePart[];
}

export function inputRef(field: string): InputRef {
  return { input: field };
}

export function followUp(step: FollowUp, subject?: string): FollowUpRef {
  return subject === undefined ? { followUp: step } : { followUp: step, subject };
}

function isInputRef(value: unknown): value is InputRef {
  return (
    typeof value === "object" && value !== null && typeof (value as InputRef).input === "string"
  );
}

function isFollowUpRef(value: unknown): value is FollowUpRef {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FollowUpRef).followUp === "string"
  );
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
export function renderMessageParts(
  parts: readonly MessagePart[],
  spell: (ref: InputRef | FollowUpRef) => string,
  escape: boolean,
): string {
  let out = "";
  for (const part of parts) {
    if (typeof part === "string") out += part;
    else if ("value" in part)
      out += escape ? (part.text ?? singleLineErrorValue(part.value)) : part.value;
    else out += spell(part);
  }
  return out;
}

function neutralSpelling(ref: InputRef | FollowUpRef): string {
  if ("input" in ref) return ref.input;
  return ref.subject === undefined ? ref.followUp : `${ref.followUp} ${ref.subject}`;
}

function userMessage(parts: readonly MessagePart[]): UserMessage {
  return {
    message: renderMessageParts(parts, neutralSpelling, false),
    textMessage: renderMessageParts(parts, neutralSpelling, true),
    parts,
  };
}

function partsOf(message: UserMessage): readonly MessagePart[] {
  return message.parts ?? [{ value: message.message, text: message.textMessage }];
}

// Escapes interpolated line separators for text output; preserves raw values for JSON.
// Input and follow-up references and nested messages stay structured.
export function errorMessage(strings: TemplateStringsArray, ...values: unknown[]): UserMessage {
  const parts: MessagePart[] = [strings[0]!];
  for (const [index, value] of values.entries()) {
    if (isInputRef(value) || isFollowUpRef(value)) parts.push(value);
    else if (isUserMessage(value)) parts.push(...partsOf(value));
    else parts.push({ value: String(value) });
    parts.push(strings[index + 1]!);
  }
  return userMessage(parts.filter((part) => part !== ""));
}

export abstract class CliError extends Error {
  abstract readonly kind: "usage" | "execution";
  readonly textMessage: string;
  // Empty when the message has no references to spell.
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
  // The message with its references kept structured, for composing another error.
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
