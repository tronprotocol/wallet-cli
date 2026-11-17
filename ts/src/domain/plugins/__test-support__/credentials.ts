import { mergeCredentials } from "../index.js";

// Credential keys as two installed plugins declare them, for tests of the core's credential handling.
export const PLUGIN_CREDENTIALS = mergeCredentials([
  [
    { key: "demoApiKey", summary: "API key of the demo service" },
    { key: "demoApiSecret", summary: "API secret of the demo service" },
  ],
  [{ key: "otherApiKey", summary: "API key of another service" }],
]);
export const PLUGIN_CREDENTIAL_KEYS = PLUGIN_CREDENTIALS.map((c) => c.key);
