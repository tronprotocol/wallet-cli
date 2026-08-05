import type { EncodingConversion } from "../../../../domain/encoding/index.js";
import { ok, query, receipt } from "./layout.js";

export const EncodingFormatters = {
  encodingConvert: (value: EncodingConversion): string =>
    "tron" in value
      ? query([
          ["TRON", value.tron],
          ["TRON hex", value.tronHex],
          ["EVM", value.evm],
        ])
      : query([
          ["Hex", value.hex],
          ["Base64", value.base64],
          ["Base58Check", value.base58check],
        ]),
  addressGenerate: (value: {
    tron: string;
    evm: string;
    secretFile?: string;
    privateKey?: string;
  }): string => {
    const rendered = receipt(
      ok(),
      "Keypair generated (NOT stored in the wallet)",
      [
        ["TRON address", value.tron],
        ["EVM address", value.evm],
        [
          "Private key",
          value.privateKey ?? `written to ${value.secretFile}`,
        ],
      ],
    );
    return `${
      value.privateKey
        ? "! Private key printed to stdout — keep it offline\n"
        : ""
    }${rendered}\n\n! To sign with this key, import it: wallet-cli import private-key`;
  },
};
