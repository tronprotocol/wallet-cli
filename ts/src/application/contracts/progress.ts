/** Intermediate application events emitted by long-running signing and transaction flows. */
export type ProgressEvent =
  | { type: "awaiting_device"; reason: "sign" | "open_app" | "unlock" }
  | { type: "deriving-address" }
  | { type: "pre-verify-address"; address: string }
  | { type: "signed" }
  | { type: "broadcasting" }
  | { type: "dry-run" };
