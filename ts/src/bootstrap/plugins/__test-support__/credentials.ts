import { mergeCredentials } from "../../../domain/plugins/index.js";
import { BUILTIN_PLUGINS } from "../builtin.js";

// The credential keys the built-in plugins declare, as `config` lists them.
export const BUILTIN_CREDENTIALS = mergeCredentials(
  BUILTIN_PLUGINS.map((p) => p.credentials ?? []),
);
export const BUILTIN_CREDENTIAL_KEYS = BUILTIN_CREDENTIALS.map((c) => c.key);
