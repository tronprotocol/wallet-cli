export interface ProviderListInput {
  limit: number;
  offset: number;
  type?: string;
  category?: string;
  capability?: string;
  network?: string;
  includeBlocked?: boolean;
}

// Catalog JSON passed through for display, with camelCased keys.
export type ProviderCatalogJson =
  | string
  | number
  | boolean
  | null
  | ProviderCatalogJson[]
  | { [field: string]: ProviderCatalogJson };

export interface ProviderRecord {
  [field: string]: ProviderCatalogJson;
}

export interface ProviderListView {
  catalog: string;
  generatedAt?: string;
  warnings?: string[];
  count: number;
  filters: Partial<Record<"type" | "category" | "capability" | "network", string>>;
  results: ProviderRecord[];
  pagination: Record<string, number>;
}

export interface ProviderEndpointsView {
  fqn: string;
  endpoints: ProviderCatalogJson[];
  warnings?: ProviderCatalogJson;
}

export interface ProviderCatalogUpdate {
  updated: true;
  cache: string;
  providers: number;
  generatedAt?: string;
  warnings?: string[];
}

export interface ProviderCatalogPort {
  list(input: ProviderListInput): Promise<ProviderListView>;
  show(fqn: string): Promise<ProviderRecord>;
  endpoints(fqn: string): Promise<ProviderEndpointsView>;
  update(): Promise<ProviderCatalogUpdate>;
}
