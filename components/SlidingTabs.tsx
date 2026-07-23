import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  ArrowLeft,
  ArrowUpDown,
  BarChart3,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  ExternalLink,
  Funnel,
  ImageIcon,
  PackageOpen,
  Search,
  Store,
  TrendingDown,
  X,
} from "lucide-react";
import type { ComparisonRow, Product } from "../models/product.model";
import { PriceChart } from "./PriceChart";

interface SlidingTabsProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
  loading: boolean;
  products: Product[];
  comparisonRows: ComparisonRow[];
  lastQuery: string;
}

type SortOrder = "stores_desc" | "price_asc" | "price_desc";
type StoreRankingState = { row: ComparisonRow; left: number; top: number };

const PAGE_SIZE = 12;
const CARD_PAGE_SIZE = 12;
const BRAND_FILTERS = ["Consul", "Brastemp", "Whirlpool"];
const STORE_FILTERS = [
  { label: "Mercado Livre", aliases: ["mercado livre", "meli", "-ml", "mlb"] },
  { label: "Magazine Luiza", aliases: ["magazine luiza", "magalu"] },
  { label: "Amazon Brasil", aliases: ["amazon brasil", "amazon"] },
  { label: "Leroy Merlin", aliases: ["leroy merlin", "leroy"] },
  { label: "Shopee", aliases: ["shopee"] },
  { label: "Duofrio", aliases: ["duofrio", "dufrio"] },
  { label: "Friolar", aliases: ["friolar", "friolar peças", "friolar pecas"] },
  { label: "Refrigeração Mota", aliases: ["refrigeração mota", "refrigeracao mota"] },
  { label: "MG Parts", aliases: ["mg parts", "mgparts"] },
  { label: "Gold Service", aliases: ["gold service", "goldservice"] },
  { label: "ComClick", aliases: ["comclick", "com click"] },
];
const PRODUCT_STOP_WORDS = new Set([
  "a", "as", "com", "da", "de", "do", "dos", "e", "em", "na", "no", "os", "para", "por",
]);
const STORE_WORDS = new Set([
  "amazon", "click", "comclick", "dufrio", "duofrio", "friolar", "gold", "leroy", "magalu",
  "magazine", "mercado", "livre", "meli", "mg", "mota", "parts", "refrigeracao", "service", "shopee",
]);
const ACCESSORY_TERMS = new Set([
  "adaptador", "adesivo", "borracha", "bolsa", "cabo", "capa", "carregador", "case", "capacitor",
  "componentes", "controle", "estojo", "filtro", "fonte", "gaveta", "grade", "kit", "lampada",
  "mangueira", "motor", "painel", "pelicula", "peca", "pecas", "placa", "prateleira", "refil",
  "resistencia", "sensor", "suporte", "tampa", "termostato", "ventilador", "ventoinha", "vidro",
]);
const KNOWN_BRANDS = new Set([
  "apple", "brastemp", "consul", "continental", "electrolux", "elgin", "fast", "fischer", "hisense",
  "hq", "lg", "midea", "panasonic", "philco", "samsung", "shop", "whirlpool",
]);

const sortOptions: Array<{ value: SortOrder; label: string }> = [
  { value: "stores_desc", label: "Mais lojas" },
  { value: "price_asc", label: "Menor preço" },
  { value: "price_desc", label: "Maior preço" },
];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

const truncateText = (value: string, maxLength = 28) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 3).trimEnd()}...` : value;

const normalize = (value?: string | null) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const normalizeProductUnits = (name: string) =>
  normalize(name)
    .replace(/frostfree/g, "frost free")
    .replace(/(\d+)\s*(btus?|btu)\b/g, "$1btu")
    .replace(/(\d+)\s*(litros?|lts?|lt|l)\b/g, "$1l")
    .replace(/(\d+)\s*(volts?|volt|v)\b/g, "$1v")
    .replace(/(\d+)\s*(polegadas?|pol)\b/g, "$1pol")
    .replace(/(\d+)\s*(quilos?|kg)\b/g, "$1kg")
    .replace(/(\d+)\s*(gb|tb|ml|w)\b/g, "$1$2");

const productTokens = (name: string) => {
  const tokens = new Set(
    normalizeProductUnits(name)
      .match(/[a-z0-9]+/g)
      ?.filter(
        (token) =>
          token.length > 1 &&
          !PRODUCT_STOP_WORDS.has(token) &&
          !STORE_WORDS.has(token),
      ) || [],
  );

  if (tokens.has("geladeira") || tokens.has("geladeiras")) {
    tokens.add("geladeira");
    tokens.add("refrigerador");
  }
  if (tokens.has("refrigerador") || tokens.has("refrigeradores")) {
    tokens.add("geladeira");
    tokens.add("refrigerador");
  }
  return tokens;
};

const specTokens = (tokens: Set<string>) =>
  new Set([...tokens].filter((token) => /\d/.test(token)));
const brandTokens = (tokens: Set<string>) =>
  new Set([...tokens].filter((token) => KNOWN_BRANDS.has(token)));
const modelTokens = (tokens: Set<string>) =>
  new Set([...tokens].filter((token) => /[a-z]+\d|\d+[a-z]+/.test(token)));
const hasAccessoryToken = (tokens: Set<string>) =>
  [...tokens].some((token) => ACCESSORY_TERMS.has(token));

const sameProduct = (clusterTokens: Set<string>, itemTokens: Set<string>) => {
  if (!clusterTokens.size || !itemTokens.size) return false;
  if (hasAccessoryToken(clusterTokens) !== hasAccessoryToken(itemTokens)) return false;

  const clusterBrands = brandTokens(clusterTokens);
  const itemBrands = brandTokens(itemTokens);
  if (
    clusterBrands.size > 0 &&
    itemBrands.size > 0 &&
    ![...clusterBrands].some((token) => itemBrands.has(token))
  ) return false;

  const clusterModels = modelTokens(clusterTokens);
  const itemModels = modelTokens(itemTokens);
  if (
    clusterModels.size > 0 &&
    itemModels.size > 0 &&
    ![...clusterModels].some((token) => itemModels.has(token))
  ) return false;

  const clusterSpecs = specTokens(clusterTokens);
  const itemSpecs = specTokens(itemTokens);
  const bothHaveSpecs = clusterSpecs.size > 0 && itemSpecs.size > 0;
  if (bothHaveSpecs && ![...clusterSpecs].some((token) => itemSpecs.has(token))) return false;

  const shared = [...clusterTokens].filter((token) => itemTokens.has(token));
  const sharedNumbers = shared.filter((token) => /\d/.test(token));
  const unionScore = shared.length / Math.max(1, Math.max(clusterTokens.size, itemTokens.size));
  const containmentScore = shared.length / Math.max(1, Math.min(clusterTokens.size, itemTokens.size));

  return shared.length >= 3 && (
    unionScore >= 0.52 ||
    containmentScore >= 0.66 ||
    (sharedNumbers.length > 0 && containmentScore >= 0.55) ||
    (bothHaveSpecs && sharedNumbers.length > 0 && unionScore >= 0.42)
  );
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const detectBrandInText = (value?: string | null) => {
  const text = normalize(value);
  const matches = BRAND_FILTERS.map((brand) => {
    const match = text.match(new RegExp(`\\b${escapeRegExp(normalize(brand))}\\b`));
    return match?.index === undefined ? null : { brand, index: match.index };
  }).filter((match): match is { brand: string; index: number } => Boolean(match));

  return matches.sort((a, b) => a.index - b.index)[0]?.brand || null;
};

const detectProductBrand = (product: Pick<Product, "name" | "brand">) =>
  detectBrandInText(product.name) || detectBrandInText(product.brand);

const getRowBrand = (row: ComparisonRow) => {
  const brand = row.offers.map(detectProductBrand).find(Boolean);
  return brand || detectBrandInText(row.name) || "—";
};

const productMatchesBrand = (product: Product, selectedBrands: string[]) =>
  selectedBrands.length === 0 || selectedBrands.includes(detectProductBrand(product) || "");

const productMatchesStore = (product: Product, selectedStores: string[]) => {
  if (selectedStores.length === 0) return true;
  const searchable = normalize(`${product.source || ""} ${product.store} ${product.url || ""}`);
  return selectedStores.some((store) => {
    const filter = STORE_FILTERS.find((item) => item.label === store);
    return (filter?.aliases || [store]).some((alias) => searchable.includes(normalize(alias)));
  });
};

const getRowImage = (row: ComparisonRow) =>
  row.offers.find((offer) => offer.image_url)?.image_url || null;

const bestOffersByStore = (offers: Product[]) => {
  const stores = new Map<string, Product>();

  offers.forEach((offer) => {
    const current = stores.get(offer.store);
    if (!current || offer.current_price < current.current_price) {
      stores.set(offer.store, offer);
    }
  });

  return [...stores.values()].sort((a, b) => a.current_price - b.current_price);
};

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const rebuildRowWithOffers = (
  row: ComparisonRow,
  offers: Product[],
): ComparisonRow | null => {
  const validOffers = offers
    .filter((offer) => Number.isFinite(Number(offer.current_price)) && Number(offer.current_price) > 0)
    .sort((a, b) => a.current_price - b.current_price);

  if (!validOffers.length) return null;

  const storeOffers = bestOffersByStore(validOffers);
  const cheapest = storeOffers[0];
  const pma = storeOffers.reduce((total, offer) => total + offer.current_price, 0) / storeOffers.length;
  const differenceValue = cheapest.current_price - pma;
  const differencePercent = pma > 0 ? Math.abs(differenceValue) / pma * 100 : 0;

  return {
    ...row,
    name: cheapest.name,
    sku: row.sku || cheapest.sku,
    store_count: storeOffers.length,
    offer_count: validOffers.length,
    pma: roundCurrency(pma),
    cheapest_price: cheapest.current_price,
    cheapest_store: cheapest.store,
    cheapest_url: cheapest.url,
    difference_value: roundCurrency(differenceValue),
    difference_percent: roundCurrency(differencePercent),
    offers: validOffers,
  };
};

const splitRowsByBrand = (rows: ComparisonRow[]) =>
  rows.flatMap((row) => {
    const offers = row.offers || [];
    if (!offers.length) return [row];

    const offersByBrand = new Map<string, Product[]>();
    offers.forEach((offer) => {
      const brand = detectProductBrand(offer) || "Sem marca";
      offersByBrand.set(brand, [...(offersByBrand.get(brand) || []), offer]);
    });

    if (offersByBrand.size <= 1) return [row];

    return [...offersByBrand.values()]
      .map((brandOffers, index) =>
        rebuildRowWithOffers({ ...row, id: row.id * 100 + index + 1 }, brandOffers),
      )
      .filter((brandRow): brandRow is ComparisonRow => Boolean(brandRow));
  });

const buildRowFromOffers = (offers: Product[], id: number): ComparisonRow | null => {
  const first = offers[0];
  if (!first) return null;
  return rebuildRowWithOffers(
    {
      id,
      name: first.name,
      sku: first.sku,
      store_count: 0,
      offer_count: 0,
      pma: 0,
      cheapest_price: 0,
      cheapest_store: "",
      cheapest_url: "",
      difference_value: 0,
      difference_percent: 0,
      offers: [],
    },
    offers,
  );
};

const buildComparisonRows = (products: Product[]) => {
  const clusters: Array<{ tokens: Set<string>; offers: Product[] }> = [];

  products.forEach((product) => {
    const itemTokens = productTokens(product.name);
    const targetCluster = clusters.find((cluster) => sameProduct(cluster.tokens, itemTokens));

    if (targetCluster) {
      itemTokens.forEach((token) => targetCluster.tokens.add(token));
      targetCluster.offers.push(product);
      return;
    }

    clusters.push({ tokens: itemTokens, offers: [product] });
  });

  return clusters
    .map((cluster, index) => buildRowFromOffers(cluster.offers, index + 1))
    .filter((row): row is ComparisonRow => Boolean(row))
    .sort(
      (a, b) =>
        b.store_count - a.store_count ||
        b.offer_count - a.offer_count ||
        a.cheapest_price - b.cheapest_price,
    );
};

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

const StoreMarks = ({ offers }: { offers: Product[] }) => {
  const stores = bestOffersByStore(offers).slice(0, 4);
  const remaining = Math.max(0, bestOffersByStore(offers).length - stores.length);

  return (
    <div className="flex items-center justify-center">
      {stores.map((offer, index) => (
        <span
          key={offer.store}
          title={offer.store}
          className="store-mark"
          style={{ zIndex: stores.length - index }}
        >
          {initials(offer.store)}
        </span>
      ))}
      {remaining > 0 && <span className="store-mark store-mark--more">+{remaining}</span>}
    </div>
  );
};

const StoreRankingPreview = ({
  row,
  left,
  top,
}: StoreRankingState) => {
  const offers = bestOffersByStore(row.offers || []).slice(0, 10);
  if (!offers.length) return null;

  return (
    <div className="store-ranking-popover" style={{ left, top, transform: "translateX(-50%)" }}>
      <div className="store-ranking-popover__header">
        <span>Ranking</span>
        <span>{offers.length} resultados</span>
      </div>
      {offers.map((offer, index) => (
        <div key={`${offer.store}-${offer.url}`} className="store-ranking-popover__row">
          <span className="store-ranking-popover__position">{String(index + 1).padStart(2, "0")}</span>
          <span className="min-w-0 flex-1 truncate">{offer.store}</span>
          <strong>{formatCurrency(offer.current_price)}</strong>
        </div>
      ))}
    </div>
  );
};

const EmptyState = ({ searched }: { searched: boolean }) => (
  <div className="flex min-h-[410px] flex-col items-center justify-center px-6 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted)]">
      <PackageOpen size={22} />
    </span>
    <h3 className="mt-4 text-sm font-semibold text-[var(--foreground)]">
      {searched ? "Nenhum resultado encontrado" : "Sua pesquisa começa aqui"}
    </h3>
    <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--muted)]">
      {searched
        ? "Revise os filtros aplicados ou faça uma nova busca no campo superior."
        : "Pesquise um produto, modelo ou SKU para comparar ofertas entre as lojas monitoradas."}
    </p>
  </div>
);

const LoadingState = () => (
  <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
    <div className="flex h-16 items-center gap-3 border-b border-[var(--border)] px-5">
      <div className="skeleton h-9 w-64" />
      <div className="ml-auto skeleton h-9 w-28" />
      <div className="skeleton h-9 w-32" />
    </div>
    <div className="divide-y divide-[var(--border)]">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex h-[74px] items-center gap-4 px-5">
          <div className="skeleton h-10 w-10 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="skeleton h-3.5 w-[min(360px,70%)]" />
            <div className="mt-2 skeleton h-3 w-28" />
          </div>
          <div className="skeleton hidden h-4 w-20 md:block" />
          <div className="skeleton hidden h-8 w-28 lg:block" />
        </div>
      ))}
    </div>
  </div>
);

export default function SlidingTabs({
  activeTab,
  onTabChange,
  loading,
  products,
  comparisonRows,
  lastQuery,
}: SlidingTabsProps) {
  const [resultSearch, setResultSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("stores_desc");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [openFilterGroups, setOpenFilterGroups] = useState({ brands: true, stores: true });
  const [visibleRows, setVisibleRows] = useState(PAGE_SIZE);
  const [visibleCards, setVisibleCards] = useState(CARD_PAGE_SIZE);
  const [selectedRow, setSelectedRow] = useState<ComparisonRow | null>(null);
  const [hoveredStoreRanking, setHoveredStoreRanking] = useState<StoreRankingState | null>(null);
  const filterControlRef = useRef<HTMLDivElement>(null);
  const sortControlRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const sourceRows = comparisonRows.length
      ? comparisonRows
      : buildComparisonRows(products);
    return splitRowsByBrand(sourceRows);
  }, [comparisonRows, products]);

  const marketProducts = useMemo(() => {
    if (products.length) return products;
    const byUrl = new Map<string, Product>();
    rows.flatMap((row) => row.offers).forEach((product) => byUrl.set(product.url, product));
    return [...byUrl.values()];
  }, [products, rows]);

  const brands = BRAND_FILTERS;
  const stores = STORE_FILTERS.map((store) => store.label);

  useEffect(() => {
    const closeControls = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!filterControlRef.current?.contains(target)) setFilterOpen(false);
      if (!sortControlRef.current?.contains(target)) setSortOpen(false);
    };

    document.addEventListener("pointerdown", closeControls, true);
    return () => document.removeEventListener("pointerdown", closeControls, true);
  }, []);

  useEffect(() => {
    setVisibleRows(PAGE_SIZE);
    setVisibleCards(CARD_PAGE_SIZE);
  }, [resultSearch, selectedBrands, selectedStores, sortOrder, lastQuery]);

  useEffect(() => {
    setResultSearch("");
    setSelectedBrands([]);
    setSelectedStores([]);
    setSortOrder("stores_desc");
    setHoveredStoreRanking(null);
  }, [lastQuery]);

  useEffect(() => {
    if (activeTab !== 2) setSelectedRow(null);
    setHoveredStoreRanking(null);
  }, [activeTab]);

  const filteredRows = useMemo(() => {
    const query = normalize(resultSearch);
    const rowsWithOfferFilters =
      selectedBrands.length === 0 && selectedStores.length === 0
        ? rows
        : rows
            .map((row) => {
              const offers = (row.offers || [])
                .filter((offer) => productMatchesBrand(offer, selectedBrands))
                .filter((offer) => productMatchesStore(offer, selectedStores));
              return offers.length ? rebuildRowWithOffers(row, offers) : null;
            })
            .filter((row): row is ComparisonRow => Boolean(row));

    const filtered = query
      ? rowsWithOfferFilters.filter((row) =>
          normalize(
            `${row.name} ${row.sku || ""} ${getRowBrand(row)} ${row.offers.map((offer) => offer.store).join(" ")}`,
          ).includes(query),
        )
      : rowsWithOfferFilters;

    return [...filtered].sort((a, b) => {
      if (sortOrder === "price_asc") return a.cheapest_price - b.cheapest_price;
      if (sortOrder === "price_desc") return b.cheapest_price - a.cheapest_price;
      return (
        b.store_count - a.store_count ||
        b.offer_count - a.offer_count ||
        a.cheapest_price - b.cheapest_price ||
        a.name.localeCompare(b.name, "pt-BR")
      );
    });
  }, [rows, resultSearch, selectedBrands, selectedStores, sortOrder]);

  const filteredProducts = useMemo(() => {
    const query = normalize(resultSearch);
    const filtered = marketProducts.filter((product) => {
      const matchesQuery =
        !query ||
        normalize(`${product.name} ${product.brand} ${product.sku || ""} ${product.store}`).includes(query);
      const matchesBrand = productMatchesBrand(product, selectedBrands);
      const matchesStore = productMatchesStore(product, selectedStores);
      return matchesQuery && matchesBrand && matchesStore;
    });

    return [...filtered].sort((a, b) => {
      if (sortOrder === "price_desc") return b.current_price - a.current_price;
      if (sortOrder === "stores_desc") return a.store.localeCompare(b.store, "pt-BR");
      return a.current_price - b.current_price;
    });
  }, [marketProducts, resultSearch, selectedBrands, selectedStores, sortOrder]);

  const allPrices = marketProducts
    .map((product) => Number(product.current_price))
    .filter((price) => Number.isFinite(price) && price > 0);
  const lowestPrice = allPrices.length ? Math.min(...allPrices) : 0;
  const averagePrice = allPrices.length
    ? allPrices.reduce((sum, price) => sum + price, 0) / allPrices.length
    : 0;
  const activeFilterCount = selectedBrands.length + selectedStores.length;
  const availableStores = new Set(marketProducts.map((product) => product.store)).size;
  const sortLabel = sortOptions.find((option) => option.value === sortOrder)?.label;

  const marketStoreRanking = useMemo(() => {
    const ranked = new Map<string, { name: string; offers: number; lowest: number }>();
    marketProducts.forEach((product) => {
      const current = ranked.get(product.store);
      ranked.set(product.store, {
        name: product.store,
        offers: (current?.offers || 0) + 1,
        lowest: Math.min(current?.lowest ?? Number.POSITIVE_INFINITY, product.current_price),
      });
    });
    return [...ranked.values()].sort((a, b) => b.offers - a.offers || a.lowest - b.lowest);
  }, [marketProducts]);

  const toggleFilter = (
    value: string,
    selected: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setter(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };

  const openAnalytics = (row: ComparisonRow) => {
    setSelectedRow(row);
    onTabChange(2);
  };

  const clearFilters = () => {
    setSelectedBrands([]);
    setSelectedStores([]);
  };

  const showStoreRanking = (
    row: ComparisonRow,
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const panelWidth = Math.min(360, window.innerWidth - 24);
    const offerCount = Math.min(10, bestOffersByStore(row.offers || []).length);
    const panelHeight = 43 + offerCount * 39;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, panelWidth / 2 + 14),
      window.innerWidth - panelWidth / 2 - 14,
    );
    const fitsBelow = rect.bottom + panelHeight + 12 < window.innerHeight;
    const top = fitsBelow ? rect.bottom + 7 : Math.max(72, rect.top - panelHeight - 7);
    setHoveredStoreRanking({ row, left, top });
  };

  const metricCards = [
    {
      label: "Ofertas",
      value: compactFormatter.format(marketProducts.length),
      helper: `${rows.length} produtos comparáveis`,
      icon: Boxes,
      tone: "blue",
    },
    {
      label: "Lojas ativas",
      value: compactFormatter.format(availableStores),
      helper: availableStores ? `${availableStores} fontes encontradas` : "Aguardando pesquisa",
      icon: Building2,
      tone: "violet",
    },
    {
      label: "Menor preço",
      value: lowestPrice ? formatCurrency(lowestPrice) : "—",
      helper: "Melhor preço disponível",
      icon: TrendingDown,
      tone: "green",
    },
    {
      label: "Preço médio",
      value: averagePrice ? formatCurrency(averagePrice) : "—",
      helper: allPrices.length ? `${allPrices.length} preços analisados` : "Sem dados ainda",
      icon: BarChart3,
      tone: "amber",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      {!selectedRow && (
        <section className="metrics-grid" aria-label="Resumo da pesquisa">
          {metricCards.map((metric) => {
            const Icon = metric.icon;
            return (
              <article key={metric.label} className="metric-card">
                <div>
                  <p className="metric-card__label">{metric.label}</p>
                  <p className="metric-card__value">{metric.value}</p>
                  <p className="metric-card__helper">{metric.helper}</p>
                </div>
                <span className={`metric-card__icon metric-card__icon--${metric.tone}`}>
                  <Icon size={18} />
                </span>
              </article>
            );
          })}
        </section>
      )}

      {loading ? (
        <div className="mt-5"><LoadingState /></div>
      ) : selectedRow && activeTab === 2 ? (
        <ProductAnalytics row={selectedRow} onBack={() => setSelectedRow(null)} />
      ) : (
        <>
          <div className="workspace-toolbar">
            <div className="result-search">
              <Search size={16} />
              <input
                type="search"
                value={resultSearch}
                onChange={(event) => setResultSearch(event.target.value)}
                placeholder="Filtrar resultados..."
                aria-label="Filtrar resultados"
              />
              {resultSearch && (
                <button type="button" onClick={() => setResultSearch("")} aria-label="Limpar filtro textual">
                  <X size={14} />
                </button>
              )}
            </div>

            <div ref={filterControlRef} className="relative ml-auto">
              <button
                type="button"
                className={`toolbar-button ${filterOpen ? "toolbar-button--active" : ""}`}
                onClick={() => {
                  setFilterOpen((open) => !open);
                  setSortOpen(false);
                }}
              >
                <Funnel size={15} />
                Filtros
                {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
              </button>

              {filterOpen && (
                <div className="filter-popover">
                  <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                    <div>
                      <p className="text-xs font-semibold text-[var(--foreground)]">Filtrar resultados</p>
                    </div>
                    {activeFilterCount > 0 && (
                      <button type="button" className="text-xs font-semibold text-[var(--accent)]" onClick={clearFilters}>
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="filter-sections">
                    <FilterColumn
                      title="Marcas"
                      items={brands}
                      selected={selectedBrands}
                      open={openFilterGroups.brands}
                      onOpenChange={() =>
                        setOpenFilterGroups((groups) => ({ ...groups, brands: !groups.brands }))
                      }
                      onToggle={(value) => toggleFilter(value, selectedBrands, setSelectedBrands)}
                    />
                    <FilterColumn
                      title="Lojas"
                      items={stores}
                      selected={selectedStores}
                      open={openFilterGroups.stores}
                      onOpenChange={() =>
                        setOpenFilterGroups((groups) => ({ ...groups, stores: !groups.stores }))
                      }
                      onToggle={(value) => toggleFilter(value, selectedStores, setSelectedStores)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div ref={sortControlRef} className="relative">
              <button
                type="button"
                className={`toolbar-button min-w-[138px] justify-between ${sortOpen ? "toolbar-button--active" : ""}`}
                onClick={() => {
                  setSortOpen((open) => !open);
                  setFilterOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <ArrowUpDown size={15} />
                  {sortLabel}
                </span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${sortOpen ? "rotate-180" : ""}`} />
              </button>
              {sortOpen && (
                <div className="sort-menu">
                  {sortOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setSortOrder(option.value);
                        setSortOpen(false);
                      }}
                      className={sortOrder === option.value ? "sort-menu__item--active" : ""}
                    >
                      <span>{option.label}</span>
                      {sortOrder === option.value && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {activeTab === 0 && (
            <OffersTable
              rows={filteredRows.slice(0, visibleRows)}
              total={filteredRows.length}
              searched={Boolean(lastQuery)}
              onAnalytics={openAnalytics}
              onStoreEnter={showStoreRanking}
              onStoreLeave={() => setHoveredStoreRanking(null)}
              hasMore={visibleRows < filteredRows.length}
              onLoadMore={() => setVisibleRows((value) => value + PAGE_SIZE)}
            />
          )}

          {activeTab === 1 && (
            <CatalogGrid
              products={filteredProducts.slice(0, visibleCards)}
              total={filteredProducts.length}
              searched={Boolean(lastQuery)}
              hasMore={visibleCards < filteredProducts.length}
              onLoadMore={() => setVisibleCards((value) => value + CARD_PAGE_SIZE)}
            />
          )}

          {activeTab === 2 && (
            <MarketAnalytics
              products={marketProducts}
              rows={filteredRows}
              stores={marketStoreRanking}
              searched={Boolean(lastQuery)}
              onOpenProduct={openAnalytics}
            />
          )}
        </>
      )}
      {hoveredStoreRanking &&
        createPortal(<StoreRankingPreview {...hoveredStoreRanking} />, document.body)}
    </div>
  );
}

const FilterColumn = ({
  title,
  items,
  selected,
  open,
  onOpenChange,
  onToggle,
}: {
  title: string;
  items: string[];
  selected: string[];
  open: boolean;
  onOpenChange: () => void;
  onToggle: (value: string) => void;
}) => (
  <div className="filter-section">
    <button type="button" className="filter-section__trigger" onClick={onOpenChange}>
      <span>{title}</span>
      <span className="flex items-center gap-2">
        {selected.length > 0 && <span className="filter-section__count">{selected.length}</span>}
        <ChevronDown size={15} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </span>
    </button>

    {open && (
      <div className="filter-section__content">
        {items.length ? (
          items.map((item) => {
            const active = selected.includes(item);
            return (
              <button key={item} type="button" onClick={() => onToggle(item)} className="filter-option">
                <span className={`filter-checkbox ${active ? "filter-checkbox--active" : ""}`}>
                  {active && <Check size={11} strokeWidth={3} />}
                </span>
                <span className="truncate">{item}</span>
              </button>
            );
          })
        ) : (
          <p className="px-1 py-3 text-xs text-[var(--muted)]">Sem opções</p>
        )}
      </div>
    )}
  </div>
);

const OffersTable = ({
  rows,
  total,
  searched,
  onAnalytics,
  onStoreEnter,
  onStoreLeave,
  hasMore,
  onLoadMore,
}: {
  rows: ComparisonRow[];
  total: number;
  searched: boolean;
  onAnalytics: (row: ComparisonRow) => void;
  onStoreEnter: (row: ComparisonRow, event: ReactMouseEvent<HTMLDivElement>) => void;
  onStoreLeave: () => void;
  hasMore: boolean;
  onLoadMore: () => void;
}) => (
  <section className="data-panel">
    <div className="data-panel__header">
      <div>
        <h2>Lista de produtos</h2>
        <p>{total} {total === 1 ? "produto encontrado" : "produtos encontrados"}</p>
      </div>
    </div>

    {rows.length ? (
      <>
        <div className="overflow-x-auto">
          <table className="offer-table">
            <thead>
              <tr>
                <th className="w-[42%]">Produto</th>
                <th>Marca / SKU</th>
                <th className="text-center">Lojas</th>
                <th className="text-center">Preço médio</th>
                <th className="text-center">Melhor preço</th>
                <th>Atualização</th>
                <th className="w-14" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const image = getRowImage(row);
                return (
                  <tr key={`${row.id}-${row.name}`}>
                    <td>
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="product-thumb">
                          {image ? <img src={image} alt="" loading="lazy" /> : <ImageIcon size={18} />}
                        </div>
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-semibold leading-[1.35rem] text-[var(--foreground)]">
                            {row.name}
                          </p>
                          <p className="mt-0.5 text-[13px] text-[var(--muted)]">
                            {row.offer_count} {row.offer_count === 1 ? "oferta analisada" : "ofertas analisadas"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="text-sm font-medium text-[var(--foreground)]">{getRowBrand(row)}</p>
                      <p className="mt-1 font-mono text-[13px] text-[var(--muted)]">{row.sku || "SKU não informado"}</p>
                    </td>
                    <td className="text-center">
                      <div
                        className="inline-flex cursor-help flex-col items-center"
                        onMouseEnter={(event) => onStoreEnter(row, event)}
                        onMouseLeave={onStoreLeave}
                      >
                        <StoreMarks offers={row.offers} />
                        <p className="mt-1 text-[13px] text-[var(--muted)]">{row.store_count} lojas</p>
                      </div>
                    </td>
                    <td className="text-center">
                      <span className="text-sm font-medium tabular-nums text-[var(--muted-strong)]">{formatCurrency(row.pma)}</span>
                    </td>
                    <td className="text-center">
                      <a href={row.cheapest_url} target="_blank" rel="noreferrer" className="best-price-link">
                        <span>
                          <span className="best-price-link__value">
                            <strong>{formatCurrency(row.cheapest_price)}</strong>
                            <ExternalLink size={13} />
                          </span>
                          <small title={row.cheapest_store}>{truncateText(row.cheapest_store)}</small>
                        </span>
                      </a>
                    </td>
                    <td>
                      <span className="text-[13px] text-[var(--muted)]">{formatDate(row.offers[0]?.last_update)}</span>
                    </td>
                    <td>
                      <button type="button" className="table-action" onClick={() => onAnalytics(row)} aria-label="Abrir analytics" title="Abrir analytics">
                        <BarChart3 size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PanelFooter shown={rows.length} total={total} hasMore={hasMore} onLoadMore={onLoadMore} />
      </>
    ) : (
      <EmptyState searched={searched} />
    )}
  </section>
);

const PanelFooter = ({
  shown,
  total,
  hasMore,
  onLoadMore,
}: {
  shown: number;
  total: number;
  hasMore: boolean;
  onLoadMore: () => void;
}) => (
  <div className="panel-footer">
    <p>Exibindo <strong>{shown}</strong> de <strong>{total}</strong></p>
    {hasMore && <button type="button" onClick={onLoadMore}>Mais</button>}
  </div>
);

const CatalogGrid = ({
  products,
  total,
  searched,
  hasMore,
  onLoadMore,
}: {
  products: Product[];
  total: number;
  searched: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) => (
  <section className="data-panel">
    <div className="data-panel__header">
      <div>
        <h2>Todos os itens</h2>
        <p>{total} {total === 1 ? "oferta no catálogo" : "ofertas no catálogo"}</p>
      </div>
    </div>
    {products.length ? (
      <>
        <div className="catalog-grid">
          {products.map((product) => (
            <article key={`${product.id}-${product.url}`} className="catalog-card">
              <div className="catalog-card__media">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} loading="lazy" />
                ) : (
                  <ImageIcon size={28} />
                )}
                <span className="catalog-card__store">{product.store}</span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--muted)]">
                  <span>{product.brand || "Sem marca"}</span>
                </div>
                <h3 className="mt-2 line-clamp-2 min-h-[42px] text-[13px] font-semibold leading-[1.35rem] text-[var(--foreground)]">
                  {product.name}
                </h3>
                <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                  <div>
                    <p className="text-xs font-medium text-[var(--muted)]">Preço atual</p>
                    <p className="mt-0.5 text-lg font-semibold tracking-tight text-[var(--foreground)]">{formatCurrency(product.current_price)}</p>
                  </div>
                  <a href={product.url} target="_blank" rel="noreferrer" className="catalog-link" aria-label={`Abrir ${product.name}`}>
                    <ExternalLink size={15} />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
        <PanelFooter shown={products.length} total={total} hasMore={hasMore} onLoadMore={onLoadMore} />
      </>
    ) : (
      <EmptyState searched={searched} />
    )}
  </section>
);

const MarketAnalytics = ({
  products,
  rows,
  stores,
  searched,
  onOpenProduct,
}: {
  products: Product[];
  rows: ComparisonRow[];
  stores: Array<{ name: string; offers: number; lowest: number }>;
  searched: boolean;
  onOpenProduct: (row: ComparisonRow) => void;
}) => {
  if (!products.length) return <section className="data-panel"><EmptyState searched={searched} /></section>;

  const maxOffers = Math.max(...stores.map((store) => store.offers), 1);

  return (
    <div className="analytics-layout">
      <section className="data-panel analytics-chart-panel">
        <div className="data-panel__header">
          <div><h2>Preço mínimo por loja</h2><p>Melhor condição encontrada em cada fonte</p></div>
        </div>
        <div className="p-4 sm:p-5"><PriceChart products={products} /></div>
      </section>

      <section className="data-panel">
        <div className="data-panel__header">
          <div><h2>Cobertura das lojas</h2><p>Participação nas ofertas encontradas</p></div>
        </div>
        <div className="store-ranking-list">
          {stores.slice(0, 8).map((store, index) => (
            <div key={store.name} className="store-ranking-row">
              <span className="store-ranking-index">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs font-semibold text-[var(--foreground)]">{store.name}</span>
                  <span className="text-xs font-medium text-[var(--muted)]">{store.offers} ofertas</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(8, store.offers / maxOffers * 100)}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="data-panel analytics-products-panel">
        <div className="data-panel__header">
          <div><h2>Produtos em destaque</h2><p>Itens com maior cobertura entre lojas</p></div>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {rows.slice(0, 6).map((row) => (
            <button key={`${row.id}-${row.name}`} type="button" className="analytics-product-row" onClick={() => onOpenProduct(row)}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--surface-muted)] text-[var(--muted)]">
                <Store size={16} />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <strong className="block truncate text-xs font-semibold text-[var(--foreground)]">{row.name}</strong>
                <small className="mt-0.5 block text-xs text-[var(--muted)]">{row.store_count} lojas · {row.offer_count} ofertas</small>
              </span>
              <span className="text-right">
                <strong className="block text-xs font-semibold text-[var(--success)]">{formatCurrency(row.cheapest_price)}</strong>
                <small className="mt-0.5 block text-xs text-[var(--muted)]">Melhor preço</small>
              </span>
              <ChevronDown size={15} className="-rotate-90 text-[var(--muted)]" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

const ProductAnalytics = ({ row, onBack }: { row: ComparisonRow; onBack: () => void }) => {
  const offers = bestOffersByStore(row.offers);
  const spread = offers.length > 1 ? offers[offers.length - 1].current_price - offers[0].current_price : 0;

  return (
    <div className="mt-5 animate-enter">
      <button type="button" onClick={onBack} className="back-button"><ArrowLeft size={15} />Voltar para visão geral</button>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="detail-stat"><span>Melhor preço</span><strong className="text-[var(--success)]">{formatCurrency(row.cheapest_price)}</strong><small>{row.cheapest_store}</small></article>
        <article className="detail-stat"><span>Preço médio</span><strong>{formatCurrency(row.pma)}</strong><small>{row.offer_count} ofertas analisadas</small></article>
        <article className="detail-stat"><span>Amplitude</span><strong>{formatCurrency(spread)}</strong><small>Entre menor e maior preço</small></article>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
        <section className="data-panel">
          <div className="data-panel__header"><div><h2>Distribuição de preços</h2><p>{row.name}</p></div></div>
          <div className="p-4 sm:p-5"><PriceChart products={offers} /></div>
        </section>
        <section className="data-panel">
          <div className="data-panel__header"><div><h2>Ofertas por loja</h2><p>{offers.length} fontes com disponibilidade</p></div></div>
          <div className="divide-y divide-[var(--border)]">
            {offers.map((offer, index) => (
              <a key={`${offer.store}-${offer.url}`} href={offer.url} target="_blank" rel="noreferrer" className="detail-offer-row">
                <span className="store-ranking-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1"><strong>{offer.store}</strong><small>{formatDate(offer.last_update)}</small></span>
                <span className="text-right"><strong className={index === 0 ? "!text-[var(--success)]" : ""}>{formatCurrency(offer.current_price)}</strong><small>{index === 0 ? "Melhor preço" : "Ver produto"}</small></span>
                <ExternalLink size={14} />
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
