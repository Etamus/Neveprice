import { useState } from "react";
import type {
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
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");

  const handleSearch = async () => {
    const query = productName.trim();
    if (!query) return;

    setLoading(true);
    setFeedback("");

    const apiBase = getApiBaseUrl();

    console.log("Conectando em:", apiBase);

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

      console.log("Produtos recebidos:", receivedProducts);
      setProducts(receivedProducts);
      setStoreResults(receivedStores);
      setFeedback(data.message || "");
    } catch (e) {
      console.error("Erro ao buscar dados:", e);
      setProducts([]);
      setStoreResults([]);
      setFeedback("Não foi possível buscar os preços agora.");
    } finally {
      setLoading(false);
    }
  };

  return {
    productName,
    products,
    storeResults,
    loading,
    feedback,
    setProductName,
    handleSearch,
  };
};

export default useHeroSection;
