export interface Product {
  id: number;
  name: string;
  brand: string;
  category: string;
  sku?: string | null;
  current_price: number;
  store: string;
  source?: string | null;
  url: string;
  image_url?: string | null;
  last_update: string; // ISO Date string vinda do backend
  description?: string | null;
}

export interface StoreSearchResult {
  key: string;
  label: string;
  available: boolean;
  message?: string | null;
  product: Product | null;
  products?: Product[];
}

export interface ComparisonRow {
  id: number;
  name: string;
  sku?: string | null;
  store_count: number;
  offer_count: number;
  pma: number;
  cheapest_price: number;
  cheapest_store: string;
  cheapest_url: string;
  difference_value: number;
  difference_percent: number;
  offers: Product[];
}

export interface SearchResponse {
  message?: string;
  results?: Product[];
  stores?: StoreSearchResult[];
  comparison?: ComparisonRow[];
}
