// The GasFree service credentials; x402 relays through GasFree and reads them too.
export const GASFREE_CREDENTIALS = [
  { key: "gasfreeApiKey", summary: "API key of the GasFree service (open.gasfree.io)" },
  { key: "gasfreeApiSecret", summary: "API secret of the GasFree service (open.gasfree.io)" },
] as const;
