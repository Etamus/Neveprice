import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ImageIcon,
  ShoppingBag,
  Store,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import type { ComparisonRow, Product } from "../models/product.model";
import { PriceChart } from "./PriceChart";

interface SlidingTabsProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
  loading: boolean;
  products: Product[];
  unavailableStoreCount: number;
  comparisonRows: ComparisonRow[];
}

const LIST_STEP = 15;
const CARD_STEP = 10;
const BRAND_FILTERS = ["Consul", "Brastemp"];
const STORE_FILTERS = [
  { label: "Mercado Livre", aliases: ["mercado livre", "meli"] },
  { label: "Magalu", aliases: ["magalu", "magazine luiza"] },
  { label: "Amazon", aliases: ["amazon"] },
  { label: "Leroy", aliases: ["leroy", "leroy merlin"] },
  { label: "Shopee", aliases: ["shopee"] },
];
const PRODUCT_STOP_WORDS = new Set([
  "a",
  "as",
  "com",
  "da",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "no",
  "os",
  "para",
  "por",
]);
const STORE_WORDS = new Set([
  "amazon",
  "leroy",
  "magalu",
  "magazine",
  "mercado",
  "livre",
  "meli",
  "shopee",
]);
const ACCESSORY_TERMS = new Set([
  "adaptador",
  "adesivo",
  "borracha",
  "bolsa",
  "cabo",
  "capa",
  "carregador",
  "case",
  "controle",
  "estojo",
  "filtro",
  "fonte",
  "gaveta",
  "grade",
  "kit",
  "pelicula",
  "peca",
  "pecas",
  "prateleira",
  "refil",
  "suporte",
  "vidro",
]);
const KNOWN_BRANDS = new Set([
  "apple",
  "brastemp",
  "consul",
  "continental",
  "electrolux",
  "elgin",
  "fast",
  "fischer",
  "hisense",
  "hq",
  "lg",
  "midea",
  "panasonic",
  "philco",
  "samsung",
  "shop",
]);
const navigationTabs = [
  { label: "Ranking", icon: Trophy },
  { label: "Marketplace", icon: Store },
];
type SortOrder = "price_asc" | "price_desc" | "stores_desc";

const SORT_OPTIONS: Array<{ label: string; value: SortOrder }> = [
  { label: "Menor preço", value: "price_asc" },
  { label: "Maior preço", value: "price_desc" },
  { label: "Mais lojas", value: "stores_desc" },
];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

const cardCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const formatCardCurrency = (value: number) =>
  cardCurrencyFormatter.format(value || 0);

const truncateText = (value: string, maxLength = 86) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;

const normalizeText = (value?: string | null) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const normalizeProductUnits = (name: string) =>
  normalizeText(name)
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

  if (tokens.has("geladeira")) {
    tokens.add("refrigerador");
  }
  if (tokens.has("refrigerador")) {
    tokens.add("geladeira");
  }
  if (tokens.has("geladeiras")) {
    tokens.add("geladeira");
    tokens.add("refrigerador");
  }
  if (tokens.has("refrigeradores")) {
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
  if (clusterTokens.size === 0 || itemTokens.size === 0) {
    return false;
  }

  if (hasAccessoryToken(clusterTokens) !== hasAccessoryToken(itemTokens)) {
    return false;
  }

  const clusterBrands = brandTokens(clusterTokens);
  const itemBrands = brandTokens(itemTokens);
  if (
    clusterBrands.size > 0 &&
    itemBrands.size > 0 &&
    ![...clusterBrands].some((token) => itemBrands.has(token))
  ) {
    return false;
  }

  const clusterModels = modelTokens(clusterTokens);
  const itemModels = modelTokens(itemTokens);
  if (
    clusterModels.size > 0 &&
    itemModels.size > 0 &&
    ![...clusterModels].some((token) => itemModels.has(token))
  ) {
    return false;
  }

  const clusterSpecs = specTokens(clusterTokens);
  const itemSpecs = specTokens(itemTokens);
  const bothHaveSpecs = clusterSpecs.size > 0 && itemSpecs.size > 0;
  if (
    bothHaveSpecs &&
    ![...clusterSpecs].some((token) => itemSpecs.has(token))
  ) {
    return false;
  }

  const shared = [...clusterTokens].filter((token) => itemTokens.has(token));
  const sharedNumbers = shared.filter((token) => /\d/.test(token));
  const unionScore =
    shared.length / Math.max(1, Math.max(clusterTokens.size, itemTokens.size));
  const containmentScore =
    shared.length / Math.max(1, Math.min(clusterTokens.size, itemTokens.size));

  return (
    shared.length >= 3 &&
    (unionScore >= 0.52 ||
      containmentScore >= 0.66 ||
      (sharedNumbers.length > 0 && containmentScore >= 0.55) ||
      (bothHaveSpecs && sharedNumbers.length > 0 && unionScore >= 0.42))
  );
};

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const bestOfferByStore = (offers: Product[]) => {
  const bestByStore = new Map<string, Product>();

  offers.forEach((offer) => {
    const currentOffer = bestByStore.get(offer.store);

    if (!currentOffer || offer.current_price < currentOffer.current_price) {
      bestByStore.set(offer.store, offer);
    }
  });

  return [...bestByStore.values()].sort(
    (a, b) => a.current_price - b.current_price,
  );
};

const productMatchesBrand = (product: Product, selectedBrands: string[]) => {
  if (selectedBrands.length === 0) {
    return true;
  }

  const searchable = normalizeText(`${product.name} ${product.brand || ""}`);
  return selectedBrands.some((brand) =>
    searchable.includes(normalizeText(brand)),
  );
};

const productMatchesStore = (product: Product, selectedStores: string[]) => {
  if (selectedStores.length === 0) {
    return true;
  }

  const storeName = normalizeText(product.store);
  return selectedStores.some((store) => {
    const filter = STORE_FILTERS.find((item) => item.label === store);
    const aliases = filter?.aliases || [store];
    return aliases.some((alias) => storeName.includes(normalizeText(alias)));
  });
};

const rebuildRowWithOffers = (
  row: ComparisonRow,
  offers: Product[],
): ComparisonRow | null => {
  const validOffers = offers
    .filter((offer) => offer.current_price && !Number.isNaN(offer.current_price))
    .sort((a, b) => a.current_price - b.current_price);

  if (validOffers.length === 0) {
    return null;
  }

  const storeOffers = bestOfferByStore(validOffers);
  const cheapest = storeOffers[0];
  const pma =
    storeOffers.reduce((total, offer) => total + offer.current_price, 0) /
    storeOffers.length;
  const differenceValue = cheapest.current_price - pma;
  const differencePercent = pma > 0 ? Math.abs(differenceValue) / pma * 100 : 0;

  return {
    ...row,
    name: cheapest.name,
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

const formatSignedCurrency = (value: number) => {
  const formatted = formatCurrency(Math.abs(value));

  if (value < 0) {
    return `-${formatted}`;
  }

  if (value > 0) {
    return formatted;
  }

  return formatCurrency(0);
};

const formatPercent = (value: number) =>
  `${Math.round(Math.abs(value || 0))}%`;

const formatUnavailableStores = (count: number) =>
  `${count} ${count === 1 ? "loja" : "lojas"} sem disponibilidade`;

const rowToneClass = (row: ComparisonRow) =>
  Math.abs(row.difference_value) < 100
    ? "bg-emerald-700 hover:bg-emerald-800"
    : "bg-red-600 hover:bg-red-700";

const buildRowFromOffers = (
  offers: Product[],
  id: number,
): ComparisonRow | null => {
  const validOffers = offers
    .filter((offer) => offer.current_price && !Number.isNaN(offer.current_price))
    .sort((a, b) => a.current_price - b.current_price);

  if (validOffers.length === 0) {
    return null;
  }

  const storeOffers = bestOfferByStore(validOffers);
  const cheapest = storeOffers[0];
  const pma =
    storeOffers.reduce((total, offer) => total + offer.current_price, 0) /
    storeOffers.length;
  const differenceValue = cheapest.current_price - pma;
  const differencePercent = pma > 0 ? Math.abs(differenceValue) / pma * 100 : 0;

  return {
    id,
    name: cheapest.name,
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

const buildComparisonRows = (items: Product[]): ComparisonRow[] => {
  const clusters: Array<{ tokens: Set<string>; offers: Product[] }> = [];

  items.forEach((product) => {
    const itemTokens = productTokens(product.name);
    const targetCluster = clusters.find((cluster) =>
      sameProduct(cluster.tokens, itemTokens),
    );

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
    .sort((a, b) =>
      a.cheapest_price === b.cheapest_price
        ? b.store_count - a.store_count
        : a.cheapest_price - b.cheapest_price,
    );
};

const sortRows = (rows: ComparisonRow[], sortOrder: SortOrder) =>
  [...rows].sort((a, b) => {
    if (sortOrder === "price_asc") {
      return a.cheapest_price - b.cheapest_price;
    }

    if (sortOrder === "price_desc") {
      return b.cheapest_price - a.cheapest_price;
    }

    return (
      b.store_count - a.store_count ||
      b.offer_count - a.offer_count ||
      a.cheapest_price - b.cheapest_price ||
      a.name.localeCompare(b.name)
    );
  });

const sortProducts = (products: Product[], sortOrder: SortOrder) => {
  if (sortOrder === "price_asc") {
    return [...products].sort((a, b) => a.current_price - b.current_price);
  }

  if (sortOrder === "price_desc") {
    return [...products].sort((a, b) => b.current_price - a.current_price);
  }

  return [...products];
};

const TableHeader = () => (
  <thead>
    <tr className="bg-neutral-800 text-left text-xs font-semibold text-white">
      <th className="w-[40%] px-6 py-4">Produto</th>
      <th className="w-[10%] px-5 py-4 text-center">Lojas</th>
      <th className="w-[14%] px-5 py-4 text-right">Preço sugerido</th>
      <th className="w-[14%] px-5 py-4 text-center">Mais barato</th>
      <th className="w-[18%] px-5 py-4 text-center">Diferença</th>
      <th className="sticky right-0 z-20 w-[72px] bg-neutral-800 px-4 py-4" />
    </tr>
  </thead>
);

const EyeIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height="28"
    style={{
      color: "#000000",
      display: "block",
      opacity: 1,
      visibility: "visible",
    }}
    viewBox="0 0 24 24"
    width="28"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
      stroke="#000000"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
    />
    <circle
      cx="12"
      cy="12"
      r="3"
      fill="#000000"
      stroke="#000000"
      strokeWidth="2"
    />
  </svg>
);

const LoadMoreButton = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-neutral-300 !bg-white px-6 py-3 text-sm font-bold text-black shadow-[0_8px_22px_rgba(0,0,0,0.08)] transition-all hover:!bg-white hover:shadow-[0_10px_26px_rgba(0,0,0,0.12)]"
  >
    <span>Carregar mais</span>
    <ChevronDown size={17} strokeWidth={2.4} />
  </button>
);

const DifferenceBadge = ({ row }: { row: ComparisonRow }) => {
  const isNegative = row.difference_value < 0;
  const Icon = isNegative ? TrendingDown : TrendingUp;

  return (
    <div
      className={`inline-flex min-w-[178px] items-center justify-center gap-2 whitespace-nowrap rounded px-3 py-2 text-sm font-black leading-none text-white ${rowToneClass(row)}`}
    >
      <span>{formatSignedCurrency(row.difference_value)}</span>
      <Icon size={16} className="shrink-0" />
      <span>{formatPercent(row.difference_percent)}</span>
    </div>
  );
};

export default function SlidingTabs({
  activeTab,
  onTabChange,
  loading,
  products,
  unavailableStoreCount,
  comparisonRows,
}: SlidingTabsProps) {
  const [visibleRows, setVisibleRows] = useState(LIST_STEP);
  const [visibleCards, setVisibleCards] = useState(CARD_STEP);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>("stores_desc");
  const [sortOpen, setSortOpen] = useState(false);
  const [dashboardRow, setDashboardRow] = useState<ComparisonRow | null>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(
    () =>
      comparisonRows.length > 0
        ? comparisonRows
        : buildComparisonRows(products),
    [comparisonRows, products],
  );

  useEffect(() => {
    setSortOrder("stores_desc");
    setSortOpen(false);
    setDashboardRow(null);
  }, [products]);

  useEffect(() => {
    setDashboardRow(null);
  }, [activeTab]);

  useEffect(() => {
    if (!sortOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (
        sortRef.current &&
        !sortRef.current.contains(event.target as Node)
      ) {
        setSortOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [sortOpen]);

  const filteredRows = useMemo(() => {
    if (selectedStores.length === 0 && selectedBrands.length === 0) {
      return sortRows(rows, sortOrder);
    }

    const rowsWithFilters = rows
      .map((row) => {
        const offers = (row.offers?.length ? row.offers : [])
          .filter((offer) => productMatchesBrand(offer, selectedBrands))
          .filter((offer) => productMatchesStore(offer, selectedStores));

        if (offers.length > 0) {
          return rebuildRowWithOffers(row, offers);
        }

        return null;
      })
      .filter((row): row is ComparisonRow => Boolean(row));

    return sortRows(rowsWithFilters, sortOrder);
  }, [rows, selectedBrands, selectedStores, sortOrder]);

  useEffect(() => {
    setVisibleRows(LIST_STEP);
  }, [filteredRows]);

  const visibleComparisonRows = filteredRows.slice(0, visibleRows);
  const sortedProducts = useMemo(() => {
    const productsWithFilters = products
      .filter((product) => productMatchesBrand(product, selectedBrands))
      .filter((product) => productMatchesStore(product, selectedStores));

    return sortProducts(productsWithFilters, sortOrder);
  }, [products, selectedBrands, selectedStores, sortOrder]);

  useEffect(() => {
    setVisibleCards(CARD_STEP);
  }, [sortedProducts]);

  const visibleProducts = sortedProducts.slice(0, visibleCards);
  const displayedOfferCount =
    activeTab === 0
      ? filteredRows.reduce((total, row) => total + row.offer_count, 0)
      : sortedProducts.length;
  const displayedProductCount =
    activeTab === 0 ? filteredRows.length : sortedProducts.length;
  const sortLabel =
    SORT_OPTIONS.find((option) => option.value === sortOrder)?.label ||
    "Mais lojas";
  const tableMessage = loading
    ? "Pesquisando..."
    : products.length > 0 || rows.length > 0
      ? "Nenhum produto disponível para os filtros selecionados."
      : "Pesquise um produto para preencher a lista.";

  const toggleBrandFilter = (brand: string) => {
    setSelectedBrands((current) =>
      current.includes(brand)
        ? current.filter((item) => item !== brand)
        : [...current, brand],
    );
  };

  const toggleStoreFilter = (store: string) => {
    setSelectedStores((current) =>
      current.includes(store)
        ? current.filter((item) => item !== store)
        : [...current, store],
    );
  };

  const selectSortOrder = (order: SortOrder) => {
    setSortOrder(order);
    setSortOpen(false);
  };

  return (
    <div className="w-full">
      <div className="flex w-full items-start gap-6 pl-5 text-left">
        <aside className="w-72 shrink-0 px-1">
          <div className="h-8 px-3 pb-3" />

          <div className="space-y-3 px-3">
            <section>
              <h3 className="text-sm font-bold text-black">Marca</h3>
              <div className="mt-1 overflow-hidden rounded-md border border-neutral-200 !bg-white shadow-[0_8px_20px_rgba(0,0,0,0.05)]">
                {BRAND_FILTERS.map((brand, index) => (
                  <button
                    key={brand}
                    type="button"
                    onClick={() => toggleBrandFilter(brand)}
                    className={`flex w-full items-center justify-between gap-3 !bg-white px-4 py-2 text-left text-sm font-semibold text-black transition-colors hover:!bg-neutral-50 ${
                      index > 0 ? "border-t border-neutral-100" : ""
                    }`}
                  >
                    <span>{brand}</span>
                    <span
                      className={`flex h-6 w-11 items-center rounded-md p-0.5 transition-colors ${
                        selectedBrands.includes(brand)
                          ? "bg-black"
                          : "bg-neutral-300"
                      }`}
                    >
                      <span
                        className={`h-5 w-5 rounded-sm bg-white shadow-sm transition-transform ${
                          selectedBrands.includes(brand)
                            ? "translate-x-5"
                            : "translate-x-0"
                        }`}
                      />
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-bold text-black">Loja</h3>
              <div className="mt-1 overflow-hidden rounded-md border border-neutral-200 !bg-white shadow-[0_8px_20px_rgba(0,0,0,0.05)]">
                {STORE_FILTERS.map((store, index) => (
                  <button
                    key={store.label}
                    type="button"
                    onClick={() => toggleStoreFilter(store.label)}
                    className={`flex w-full items-center justify-between gap-3 !bg-white px-4 py-2 text-left text-sm font-semibold text-black transition-colors hover:!bg-neutral-50 ${
                      index > 0 ? "border-t border-neutral-100" : ""
                    }`}
                  >
                    <span>{store.label}</span>
                    <span
                      className={`flex h-6 w-11 items-center rounded-md p-0.5 transition-colors ${
                        selectedStores.includes(store.label)
                          ? "bg-black"
                          : "bg-neutral-300"
                      }`}
                    >
                      <span
                        className={`h-5 w-5 rounded-sm bg-white shadow-sm transition-transform ${
                          selectedStores.includes(store.label)
                            ? "translate-x-5"
                            : "translate-x-0"
                        }`}
                      />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </aside>

        <div className="min-w-0 flex-1 pr-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm font-normal text-neutral-700">
              <span className="font-semibold text-black">Mostrando:</span>{" "}
              <span>{displayedOfferCount} ofertas</span>,{" "}
              <span>{displayedProductCount} produtos</span>,{" "}
              <span>{formatUnavailableStores(unavailableStoreCount)}</span>
            </p>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="relative" ref={sortRef}>
                <button
                  type="button"
                  onClick={() => setSortOpen((current) => !current)}
                  className="flex h-7 items-center gap-1 border-0 !bg-transparent px-0 py-0 text-[10px] font-normal text-black hover:!bg-transparent"
                  aria-expanded={sortOpen}
                >
                  <span>{sortLabel}</span>
                  {sortOpen ? (
                    <ChevronUp size={16} className="text-blue-500" />
                  ) : (
                    <ChevronDown size={16} className="text-blue-500" />
                  )}
                </button>

                {sortOpen && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-40 overflow-hidden rounded-md border border-neutral-200 !bg-white shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
                    {SORT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => selectSortOrder(option.value)}
                        className={`flex w-full items-center justify-between px-4 py-2 text-left text-xs transition-colors hover:!bg-neutral-100 ${
                          sortOrder === option.value
                            ? "!bg-neutral-100 font-semibold text-black"
                            : "!bg-white font-normal text-neutral-700"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="inline-flex gap-1">
                {navigationTabs.map((tab, index) => {
                  const Icon = tab.icon;

                  return (
                    <button
                      key={tab.label}
                      type="button"
                      onClick={() => onTabChange(index)}
                      className={`flex h-10 items-center gap-2 border border-transparent px-4 py-0 text-[14px] font-semibold transition-colors ${
                        activeTab === index
                          ? "border-neutral-200 !bg-white text-black shadow-sm"
                          : "bg-transparent text-neutral-600 hover:bg-white hover:text-black"
                      }`}
                    >
                      <Icon size={18} strokeWidth={2.4} className="shrink-0" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {activeTab === 0 && (
            <div className="animate-fade-in">
              {dashboardRow ? (
                <div className="w-full rounded-md border border-slate-200 bg-white p-5 text-slate-900">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-500">
                        Dashboard do item
                      </p>
                      <h3
                        className="truncate text-base font-semibold text-black"
                        title={dashboardRow.name}
                      >
                        {dashboardRow.name}
                      </h3>
                    </div>
                    <button
                      type="button"
                      aria-label="Voltar para lista"
                      onClick={() => setDashboardRow(null)}
                      className="shrink-0 border-0 !bg-transparent p-0 text-sm font-semibold text-black transition-colors hover:!bg-transparent hover:text-neutral-600"
                      style={{
                        background: "transparent",
                        border: 0,
                        padding: 0,
                      }}
                    >
                      Voltar
                    </button>
                  </div>
                  <PriceChart products={dashboardRow.offers} />
                </div>
              ) : (
                <>
                <div className="w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-slate-900">
                  <div className="w-full overflow-x-auto">
                    <table className="w-full min-w-[1260px] table-fixed border-separate border-spacing-0">
                      <TableHeader />
                      <tbody>
                        {filteredRows.length > 0 && !loading ? (
                          visibleComparisonRows.map((row, index) => (
                            <tr
                              key={`${row.id}-${row.name}`}
                              className={
                                index % 2 === 0 ? "bg-white" : "bg-slate-50"
                              }
                            >
                              <td className="w-[40%] px-6 py-4 text-left align-middle">
                                <p
                                  className="min-w-0 max-w-[580px] overflow-hidden text-ellipsis whitespace-nowrap text-sm font-normal leading-snug text-slate-800"
                                  title={row.name}
                                >
                                  {truncateText(row.name)}
                                </p>
                              </td>
                              <td className="px-5 py-4 text-center align-middle">
                                <div className="inline-flex min-w-[92px] items-center justify-center gap-2 text-sm font-black text-slate-800">
                                  <span>{row.store_count}</span>
                                  <ShoppingBag
                                    size={16}
                                    className="text-slate-500"
                                  />
                                </div>
                                <p className="mt-1 whitespace-nowrap text-[11px] font-semibold text-slate-500">
                                  {row.store_count} lojas
                                </p>
                              </td>
                              <td className="whitespace-nowrap px-5 py-4 text-right align-middle text-sm font-normal text-slate-700">
                                {formatCurrency(row.pma)}
                              </td>
                              <td className="px-5 py-4 text-center align-middle">
                                <a
                                  href={row.cheapest_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-flex min-w-[128px] items-center justify-center gap-2 rounded px-3 py-2 text-sm font-black leading-none text-white ${rowToneClass(row)}`}
                                >
                                  {formatCurrency(row.cheapest_price)}
                                  <ExternalLink
                                    size={14}
                                    className="shrink-0"
                                  />
                                </a>
                                <p className="mt-1 max-w-[160px] truncate text-[11px] font-semibold text-slate-500">
                                  {row.cheapest_store}
                                </p>
                              </td>
                              <td className="whitespace-nowrap px-5 py-4 text-center align-middle">
                                <DifferenceBadge row={row} />
                              </td>
                              <td
                                className={`sticky right-0 z-10 w-[72px] px-4 py-4 text-center align-middle ${
                                  index % 2 === 0 ? "bg-white" : "bg-slate-50"
                                }`}
                              >
                                <button
                                  type="button"
                                  aria-label="Abrir dashboard do item"
                                  onClick={() => setDashboardRow(row)}
                                  className="mx-auto flex h-10 w-10 items-center justify-center border-0 !bg-transparent p-0 text-black opacity-100 transition-opacity hover:!bg-transparent hover:opacity-70"
                                  style={{
                                    background: "transparent",
                                    border: 0,
                                    color: "#000000",
                                    padding: 0,
                                  }}
                                >
                                  <EyeIcon />
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr className="bg-white">
                            <td
                              colSpan={6}
                              className="h-[360px] px-6 py-4 text-center align-middle text-base font-semibold text-black"
                            >
                              {tableMessage}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

            {visibleRows < filteredRows.length && (
              <div className="mt-5 flex justify-center">
                <LoadMoreButton
                  onClick={() =>
                    setVisibleRows((current) => current + LIST_STEP)
                  }
                />
              </div>
            )}
                </>
              )}
            </div>
          )}

          {activeTab === 1 && (
          <div className="animate-fade-in">
            {visibleProducts.length > 0 ? (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {visibleProducts.map((product) => (
                    <article
                      key={`${product.id}-${product.url}`}
                      className="group flex min-h-[430px] min-w-0 flex-col overflow-hidden rounded-md border border-neutral-200 bg-white text-left text-black shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
                    >
                      <div className="flex h-[270px] shrink-0 items-center justify-center bg-neutral-50 px-5 py-5">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="max-h-full max-w-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <ImageIcon size={34} className="text-black" />
                        )}
                      </div>

                      <div className="flex min-h-[160px] flex-col justify-between border-t border-neutral-100 bg-white px-4 py-4">
                        <h3 className="line-clamp-2 min-h-10 break-words text-[13px] font-normal leading-snug text-black">
                          {product.name}
                        </h3>
                        <div className="mt-3 flex min-w-0 items-end justify-between gap-3">
                          <p className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[25px] font-normal leading-none text-black tabular-nums">
                            {formatCardCurrency(product.current_price)}
                          </p>
                          <a
                            href={product.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-neutral-200 !bg-white px-3 text-[11px] font-semibold text-black transition-colors hover:!bg-neutral-100"
                          >
                            <span>Acessar produto</span>
                            <ExternalLink size={13} className="shrink-0" />
                          </a>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {visibleCards < sortedProducts.length && (
                  <div className="mt-5 flex justify-center">
                    <LoadMoreButton
                      onClick={() =>
                        setVisibleCards((current) => current + CARD_STEP)
                      }
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 text-center text-black">
                Nenhum produto disponível.
              </div>
            )}
          </div>
          )}

        </div>
      </div>
    </div>
  );
}
