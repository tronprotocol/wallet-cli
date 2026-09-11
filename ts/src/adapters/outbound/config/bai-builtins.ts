/** Trusted recharge destinations. Changing this allowlist requires a CLI release.
 * These addresses cannot be overridden by user configuration.
 */
export const BAI_RECHARGE_ADDRESSES: Readonly<Record<string, string>> = Object.freeze({
  tron: "TSNEPtuCagKEgF2EU4pAKWLzXLz1bekfTE",
  bnb: "0x060f7fd9c9622bdcf9f2887c8171d6e6b4b4ba17",
  base: "0x10bf3d09bd80a00ddbbfe934c7dcc477b42ffdb0",
});
