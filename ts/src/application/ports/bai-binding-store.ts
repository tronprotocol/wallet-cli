/** Local setup confirmation, scoped to a credential, backend chain and payer address. */
export interface BaiBindingStore {
  isConfirmed(apiKey: string, chain: string, address: string): boolean;
  confirm(apiKey: string, chain: string, address: string): void;
}
