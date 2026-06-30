export interface PromptChoice<T> {
  value: T;
  label: string;
}

/** Interaction capability used by application workflows; implemented by an inbound adapter. */
export interface PromptPort {
  isTTY(): boolean;
  text(options: { label: string; validate?: (value: string) => string | null }): Promise<string>;
  hidden(options: {
    label: string;
    confirm?: boolean;
    confirmLabel?: string;
    validate?: (value: string) => string | null;
  }): Promise<string>;
  confirm(options: { label: string; expect?: string }): Promise<boolean>;
  select<T>(options: {
    label: string;
    choices: PromptChoice<T>[];
    loadMore?: () => Promise<PromptChoice<T>[]>;
  }): Promise<T>;
}
