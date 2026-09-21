export interface ProviderListInput {
  limit: number;
  offset: number;
  type?: string;
  category?: string;
  capability?: string;
  network?: string;
  includeBlocked?: boolean;
}

export interface ProviderCatalogPort {
  list(input: ProviderListInput): Promise<{
    results: Record<string, unknown>[];
    pagination: Record<string, number>;
    [key: string]: unknown;
  }>;
  show(fqn: string): Promise<Record<string, unknown>>;
  endpoints(fqn: string): Promise<Record<string, unknown>>;
  update(): Promise<Record<string, unknown>>;
}
