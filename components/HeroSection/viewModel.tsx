import { useState } from "react";
import type {
  ComparisonRow,
  Product,
  SearchResponse,
  StoreSearchResult,
} from "../../models/product.model";

const getApiBaseUrl = () => {
  const configuredApiUrl =
    import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
  const apiUrlWithProtocol = /^https?:\/\//i.test(configuredApiUrl)
    ? configuredApiUrl
    : `http://${configuredApiUrl}`;

  return apiUrlWithProtocol.replace(/\/+$/, "");
};

const useHeroSection = () => {
  const [productName, setProductName] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [storeResults, setStoreResults] = useState<StoreSearchResult[]>([]);
  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [lastQuery, setLastQuery] = useState("");

  const handleSearch = async () => {
    if (loading) return;

    const query = productName.trim();
    if (!query) return;

    setLoading(true);
    setFeedback("");
    setLastQuery(query);

    const apiBase = getApiBaseUrl();

    try {
      const response = await fetch(
        `${apiBase}/products/search?q=${encodeURIComponent(query)}`,
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as SearchResponse;
      const receivedProducts = data.results || [];
      const receivedStores = data.stores || [];
      const receivedComparison = data.comparison || [];

      setProducts(receivedProducts);
      setStoreResults(receivedStores);
      setComparisonRows(receivedComparison);
      setFeedback(data.message || "");
    } catch (e) {
      console.error("Erro ao buscar dados:", e);
      setProducts([]);
      setStoreResults([]);
      setComparisonRows([]);
      setFeedback("Não foi possível buscar os preços agora.");
    } finally {
      setLoading(false);
    }
  };

  return {
    productName,
    products,
    storeResults,
    comparisonRows,
    loading,
    feedback,
    lastQuery,
    setProductName,
    handleSearch,
  };
};

export default useHeroSection;
