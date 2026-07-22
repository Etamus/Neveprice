import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import {
  ChartLine,
  ChevronDown,
  ExternalLink,
  ImageIcon,
  Images,
  Package,
  ShoppingBag,
  Tag,
} from "lucide-react";
import type { ComparisonRow, Product } from "../models/product.model";
import { PriceChart } from "./PriceChart";

interface SlidingTabsProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
  loading: boolean;
  products: Product[];
  comparisonRows: ComparisonRow[];
}

const LIST_STEP = 15;
const CARD_STEP = 10;
const BRAND_FILTERS = ["Consul", "Brastemp", "Whirlpool"];
const STORE_FILTERS = [
  { label: "Mercado Livre", aliases: ["mercado livre", "meli"] },
  { label: "Magazine Luiza", aliases: ["magazine luiza", "magalu"] },
  { label: "Amazon Brasil", aliases: ["amazon brasil", "amazon"] },
  { label: "Leroy Merlin", aliases: ["leroy merlin", "leroy"] },
  { label: "Shopee", aliases: ["shopee"] },
  { label: "Dufrio", aliases: ["dufrio"] },
  { label: "Friolar", aliases: ["friolar", "friolar peças", "friolar pecas"] },
  { label: "Refrigeração Mota", aliases: ["refrigeração mota", "refrigeracao mota"] },
  { label: "MG Parts", aliases: ["mg parts", "mgparts"] },
  { label: "Gold Service", aliases: ["gold service", "goldservice"] },
  { label: "ComClick", aliases: ["comclick", "com click"] },
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
  "click",
  "comclick",
  "dufrio",
  "friolar",
  "gold",
  "leroy",
  "magalu",
  "magazine",
  "mercado",
  "livre",
  "meli",
  "mg",
  "mota",
  "parts",
  "refrigeracao",
  "service",
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
  "capacitor",
  "componentes",
  "controle",
  "estojo",
  "filtro",
  "fonte",
  "gaveta",
  "grade",
  "kit",
  "lampada",
  "mangueira",
  "motor",
  "painel",
  "pelicula",
  "peca",
  "pecas",
  "placa",
  "prateleira",
  "refil",
  "resistencia",
  "sensor",
  "suporte",
  "tampa",
  "termostato",
  "ventilador",
  "ventoinha",
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
  { label: "Produtos", icon: Package },
  { label: "Vitrine", icon: Images },
];
type SortOrder = "price_asc" | "price_desc" | "stores_desc";
type StoreRankingState = {
  row: ComparisonRow;
  left: number;
  top: number;
};
type DashboardPriceColumn = {
  label: string;
  aliases: string[];
};

const SORT_OPTIONS: Array<{ label: string; value: SortOrder }> = [
  { label: "Menor preço", value: "price_asc" },
  { label: "Maior preço", value: "price_desc" },
  { label: "Mais lojas", value: "stores_desc" },
];

const DASHBOARD_PRICE_COLUMNS: DashboardPriceColumn[] = [
  { label: "Meli", aliases: ["mercado livre", "meli", "-ml", "mlb"] },
  { label: "Amazon", aliases: ["amazon brasil", "amazon"] },
  { label: "Shopee", aliases: ["shopee"] },
  { label: "Magalu", aliases: ["magazine luiza", "magalu"] },
  { label: "Leroy", aliases: ["leroy merlin", "leroy"] },
  { label: "Dufrio", aliases: ["dufrio"] },
  { label: "Friolar", aliases: ["friolar"] },
  { label: "Mota", aliases: ["refrigeração mota", "refrigeracao mota"] },
  { label: "MG Parts", aliases: ["mg parts", "mgparts"] },
  { label: "Gold Service", aliases: ["gold service", "goldservice"] },
  { label: "ComClick", aliases: ["comclick", "com click"] },
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

const rankingPriceFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatRankingPrice = (value: number) =>
  rankingPriceFormatter.format(value || 0);

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

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const detectBrandInText = (value?: string | null) => {
  const text = normalizeText(value);

  if (!text) {
    return null;
  }

  const matches = BRAND_FILTERS.map((brand) => {
    const normalizedBrand = normalizeText(brand);
    const match = text.match(new RegExp(`\\b${escapeRegExp(normalizedBrand)}\\b`));

    return match?.index === undefined ? null : { brand, index: match.index };
  }).filter((match): match is { brand: string; index: number } =>
    Boolean(match),
  );

  return matches.sort((a, b) => a.index - b.index)[0]?.brand || null;
};

const detectProductBrand = (product: Pick<Product, "name" | "brand">) =>
  detectBrandInText(product.name) || detectBrandInText(product.brand);

const productMatchesBrand = (product: Product, selectedBrands: string[]) => {
  if (selectedBrands.length === 0) {
    return true;
  }

  const productBrand = detectProductBrand(product);

  return productBrand ? selectedBrands.includes(productBrand) : false;
};

const productMatchesStore = (product: Product, selectedStores: string[]) => {
  if (selectedStores.length === 0) {
    return true;
  }

  const storeName = normalizeText(`${product.source || ""} ${product.store}`);
  return selectedStores.some((store) => {
    const filter = STORE_FILTERS.find((item) => item.label === store);
    const aliases = filter?.aliases || [store];
    return aliases.some((alias) => storeName.includes(normalizeText(alias)));
  });
};

const getProductBrand = (row: ComparisonRow) => {
  const brands = (row.offers || [])
    .map((offer) => detectProductBrand(offer))
    .filter((brand): brand is string => Boolean(brand));

  return brands[0] || detectBrandInText(row.name) || "-";
};

const getRowSku = (row: ComparisonRow) => {
  const skuFromOffer = row.offers?.find((offer) => offer.sku)?.sku;
  const skuFromName = row.name.match(/\b(?:W\d{6,}|3\d{8})\b/i)?.[0];

  return row.sku || skuFromOffer || skuFromName || "-";
};

const getDashboardDescription = (row: ComparisonRow) => {
  const sku = getRowSku(row);
  const cleanedName = row.name
    .replace(new RegExp(`\\b${sku}\\b`, "i"), "")
    .replace(/\s+/g, " ")
    .trim();

  return truncateText(cleanedName || row.name, 54);
};

const productMatchesDashboardColumn = (
  product: Product,
  column: DashboardPriceColumn,
) => {
  const searchable = normalizeText(
    `${product.source || ""} ${product.store || ""} ${product.url || ""}`,
  );

  return column.aliases.some((alias) => searchable.includes(normalizeText(alias)));
};

const getDashboardPriceByColumn = (
  products: Product[],
  column: DashboardPriceColumn,
) => {
  const prices = products
    .filter((product) => productMatchesDashboardColumn(product, column))
    .map((product) => Number(product.current_price))
    .filter((price) => price > 0 && !Number.isNaN(price));

  if (prices.length === 0) {
    return null;
  }

  return Math.min(...prices);
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

const splitRowsByBrand = (rows: ComparisonRow[]) =>
  rows.flatMap((row) => {
    const offers = row.offers || [];

    if (offers.length === 0) {
      return [row];
    }

    const offersByBrand = new Map<string, Product[]>();

    offers.forEach((offer) => {
      const brandKey = detectProductBrand(offer) || "Sem marca";
      const currentOffers = offersByBrand.get(brandKey) || [];
      offersByBrand.set(brandKey, [...currentOffers, offer]);
    });

    if (offersByBrand.size <= 1) {
      return [row];
    }

    return [...offersByBrand.values()]
      .map((brandOffers, index) =>
        rebuildRowWithOffers(
          {
            ...row,
            id: row.id * 100 + index + 1,
          },
          brandOffers,
        ),
      )
      .filter((brandRow): brandRow is ComparisonRow => Boolean(brandRow));
  });

const rowToneClass = () => "bg-[#1f8a5f] hover:bg-[#18724f]";

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
    <tr className="bg-[var(--app-surface-strong)] text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
      <th className="w-[11%] px-6 py-4">Marca</th>
      <th className="w-[37%] px-5 py-4">Produto</th>
      <th className="w-[11%] px-5 py-4 text-center">Lojas</th>
      <th className="w-[17%] px-5 py-4 text-center">Preço sugerido</th>
      <th className="w-[16%] px-5 py-4 text-center">Mais barato</th>
      <th className="sticky right-0 z-20 w-[72px] bg-[var(--app-surface-strong)] px-4 py-4" />
    </tr>
  </thead>
);

const StoreRankingPreview = ({
  row,
  left,
  top,
}: {
  row: ComparisonRow;
  left: number;
  top: number;
}) => {
  const topOffers = bestOfferByStore(row.offers || []).slice(0, 10);

  if (topOffers.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed z-50 w-[410px] overflow-hidden rounded-md border border-[var(--app-border)] bg-white text-left shadow-[var(--app-shadow)]"
      style={{ left, top, transform: "translateX(-50%)" }}
    >
      {topOffers.map((offer, index) => (
        <div
          key={`${offer.store}-${offer.url}-${index}`}
          className={`grid grid-cols-[54px_1fr_92px] items-center gap-3 px-4 py-2.5 text-xs ${
            index % 2 === 0 ? "bg-white" : "bg-[var(--app-surface-soft)]"
          } ${index > 0 ? "border-t border-[var(--app-border)]" : ""}`}
        >
          <span className="text-center font-semibold text-[var(--app-calm)]">
            {index + 1}º
          </span>
          <span className="min-w-0 truncate font-medium text-[var(--app-ink)]">
            {offer.store}
          </span>
          <span className="rounded-md bg-[var(--app-accent)] px-3 py-1 text-center font-semibold text-white">
            {formatRankingPrice(offer.current_price)}
          </span>
        </div>
      ))}
    </div>
  );
};

const DashboardPriceTable = ({ row }: { row: ComparisonRow }) => (
  <div className="mt-5 overflow-hidden rounded-md border border-[var(--app-border)] bg-white">
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-left">
        <thead>
          <tr className="bg-[var(--app-surface-strong)] text-xs font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
            <th className="w-[12%] px-4 py-3">Material</th>
            <th className="w-[22%] px-4 py-3">Descrição</th>
            {DASHBOARD_PRICE_COLUMNS.map((column) => (
              <th key={column.label} className="px-3 py-3 text-center">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="bg-white text-xs text-[var(--app-muted)]">
            <td className="px-4 py-4 font-semibold text-[var(--app-ink)]">
              {getRowSku(row)}
            </td>
            <td className="px-4 py-4 text-[var(--app-muted)]">
              {getDashboardDescription(row)}
            </td>
            {DASHBOARD_PRICE_COLUMNS.map((column) => {
              const price = getDashboardPriceByColumn(row.offers || [], column);

              return (
                <td
                  key={column.label}
                  className="whitespace-nowrap px-3 py-4 text-center align-middle font-semibold text-[var(--app-ink)]"
                >
                  <span className="flex min-h-5 w-full items-center justify-center text-center tabular-nums">
                    {price === null ? (
                      <span className="inline-block w-4 text-center text-[var(--app-subtle)]">
                        -
                      </span>
                    ) : (
                      formatCurrency(price)
                    )}
                  </span>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

const LoadMoreButton = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--app-border)] bg-white px-6 py-3 text-sm font-semibold text-[var(--app-ink)] shadow-[var(--app-shadow-sm)] transition-all hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-soft)]"
  >
    <span>Carregar mais</span>
    <ChevronDown size={17} strokeWidth={2.4} />
  </button>
);

const FilterChevron = ({ expanded }: { expanded: boolean }) => (
  <ChevronDown
    size={17}
    className={`text-[var(--app-muted)] transition-transform duration-200 ease-out ${
      expanded ? "rotate-180" : "rotate-0"
    }`}
  />
);

const FilterPanel = ({
  expanded,
  children,
}: {
  expanded: boolean;
  children: ReactNode;
}) => (
  <div
    className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
      expanded
        ? "grid-rows-[1fr] opacity-100"
        : "pointer-events-none grid-rows-[0fr] opacity-0"
    }`}
  >
    <div className="min-h-0 overflow-hidden">
      <div className="mt-2 overflow-hidden rounded-md bg-white">
        {children}
      </div>
    </div>
  </div>
);

export default function SlidingTabs({
  activeTab,
  onTabChange,
  loading,
  products,
  comparisonRows,
}: SlidingTabsProps) {
  const [visibleRows, setVisibleRows] = useState(LIST_STEP);
  const [visibleCards, setVisibleCards] = useState(CARD_STEP);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>("stores_desc");
  const [sortOpen, setSortOpen] = useState(false);
  const [dashboardRow, setDashboardRow] = useState<ComparisonRow | null>(null);
  const [storeRanking, setStoreRanking] = useState<StoreRankingState | null>(
    null,
  );
  const [expandedFilters, setExpandedFilters] = useState({
    brands: true,
    stores: true,
  });
  const sortRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(
    () => {
      const sourceRows =
        comparisonRows.length > 0
          ? comparisonRows
          : buildComparisonRows(products);

      return splitRowsByBrand(sourceRows);
    },
    [comparisonRows, products],
  );

  useEffect(() => {
    setSortOrder("stores_desc");
    setSortOpen(false);
    setDashboardRow(null);
    setStoreRanking(null);
  }, [products]);

  useEffect(() => {
    setDashboardRow(null);
    setStoreRanking(null);
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
      : "Nenhum produto disponível.";

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

  const toggleFilterSection = (section: "brands" | "stores") => {
    setExpandedFilters((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  const showStoreRanking = (
    row: ComparisonRow,
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const panelWidth = 410;
    const panelHeight = Math.min(
      392,
      Math.max(70, bestOfferByStore(row.offers || []).slice(0, 10).length * 38),
    );
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, panelWidth / 2 + 16),
      window.innerWidth - panelWidth / 2 - 16,
    );
    const fitsBelow = rect.bottom + panelHeight + 14 < window.innerHeight;
    const top = fitsBelow
      ? rect.bottom + 8
      : Math.max(96, rect.top - panelHeight - 8);

    setStoreRanking({ row, left, top });
  };

  const hideStoreRanking = () => {
    setStoreRanking(null);
  };

  return (
    <div className="w-full">
      <div className="mx-auto grid w-full max-w-[1600px] grid-cols-[270px_minmax(0,1fr)] items-start gap-6 px-6 text-left max-lg:grid-cols-1 max-md:px-4">
        <aside className="sticky top-0 z-20 w-[270px] shrink-0 rounded-md border border-[var(--app-border)] bg-white/82 p-4 shadow-[var(--app-shadow-sm)] backdrop-blur max-lg:static max-lg:w-full">
          <div className="mb-4 border-b border-[var(--app-border)] pb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-subtle)]">
              Filtros
            </p>
          </div>

          <div className="space-y-4">
            <section>
              <button
                type="button"
                onClick={() => toggleFilterSection("brands")}
                className="flex w-full items-center justify-between border-0 bg-transparent p-0 text-left"
                aria-expanded={expandedFilters.brands}
              >
                <h3 className="text-sm font-semibold text-[var(--app-ink)]">Marcas</h3>
                <FilterChevron expanded={expandedFilters.brands} />
              </button>

              <FilterPanel expanded={expandedFilters.brands}>
                {BRAND_FILTERS.map((brand, index) => (
                  <button
                    key={brand}
                    type="button"
                    onClick={() => toggleBrandFilter(brand)}
                    className={`flex w-full items-center justify-between gap-3 bg-transparent px-4 py-2 text-left text-[13px] font-medium leading-[18px] text-[var(--app-ink)] transition-colors hover:bg-white ${
                      index > 0 ? "border-t border-[var(--app-border)]" : ""
                    }`}
                  >
                    <span className="min-w-0 truncate pb-px">{brand}</span>
                    <span
                      className={`flex h-6 w-11 items-center rounded-md p-0.5 transition-colors ${
                        selectedBrands.includes(brand)
                          ? "bg-[var(--app-accent)]"
                          : "bg-[var(--app-border-strong)]"
                      }`}
                    >
                      <span
                        className={`h-5 w-5 rounded bg-white shadow-sm transition-transform ${
                          selectedBrands.includes(brand)
                            ? "translate-x-5"
                            : "translate-x-0"
                        }`}
                      />
                    </span>
                  </button>
                ))}
              </FilterPanel>
            </section>

            <section>
              <button
                type="button"
                onClick={() => toggleFilterSection("stores")}
                className="flex w-full items-center justify-between border-0 bg-transparent p-0 text-left"
                aria-expanded={expandedFilters.stores}
              >
                <h3 className="text-sm font-semibold text-[var(--app-ink)]">Lojas</h3>
                <FilterChevron expanded={expandedFilters.stores} />
              </button>

              <FilterPanel expanded={expandedFilters.stores}>
                {STORE_FILTERS.map((store, index) => (
                  <button
                    key={store.label}
                    type="button"
                    onClick={() => toggleStoreFilter(store.label)}
                    className={`flex w-full items-center justify-between gap-3 bg-transparent px-4 py-2 text-left text-[13px] font-medium leading-[18px] text-[var(--app-ink)] transition-colors hover:bg-white ${
                      index > 0 ? "border-t border-[var(--app-border)]" : ""
                    }`}
                  >
                    <span className="min-w-0 truncate pb-px">
                      {store.label}
                    </span>
                    <span
                      className={`flex h-6 w-11 items-center rounded-md p-0.5 transition-colors ${
                        selectedStores.includes(store.label)
                          ? "bg-[var(--app-accent)]"
                          : "bg-[var(--app-border-strong)]"
                      }`}
                    >
                      <span
                        className={`h-5 w-5 rounded bg-white shadow-sm transition-transform ${
                          selectedStores.includes(store.label)
                            ? "translate-x-5"
                            : "translate-x-0"
                        }`}
                      />
                    </span>
                  </button>
                ))}
              </FilterPanel>
            </section>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="relative z-40 mb-5 flex flex-wrap items-center justify-between gap-4 rounded-md border border-[var(--app-border)] bg-white/82 px-4 py-3 shadow-[var(--app-shadow-sm)] backdrop-blur">
            <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-[var(--app-muted)]">
              <span className="font-semibold text-[var(--app-ink)]">Mostrando:</span>
              <span className="inline-flex items-center gap-1.5">
                <Tag size={16} strokeWidth={2.2} className="text-[var(--app-accent)]" />
                <span>{displayedOfferCount} ofertas</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Package
                  size={16}
                  strokeWidth={2.2}
                  className="text-[var(--app-calm)]"
                />
                <span>{displayedProductCount} produtos</span>
              </span>
            </p>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="relative shrink-0" ref={sortRef}>
                <button
                  type="button"
                  onClick={() => setSortOpen((current) => !current)}
                  className="inline-flex h-9 flex-none items-center justify-end gap-1 overflow-visible whitespace-nowrap rounded-md border border-[var(--app-border)] bg-white px-3 py-0 text-[13px] font-medium leading-none text-[var(--app-ink)] transition-colors hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-soft)]"
                  aria-expanded={sortOpen}
                >
                  <span
                    className="inline-block whitespace-nowrap leading-none"
                  >
                    {sortLabel}
                  </span>
                  <ChevronDown
                    size={13}
                    className={`shrink-0 text-[var(--app-accent)] transition-transform duration-200 ease-out ${
                      sortOpen ? "rotate-180" : "rotate-0"
                    }`}
                  />
                </button>

                {sortOpen && (
                  <div className="absolute right-0 top-full z-[80] mt-2 w-[168px] overflow-hidden rounded-md border border-[var(--app-border)] bg-white shadow-[var(--app-shadow)]">
                    {SORT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => selectSortOrder(option.value)}
                        className={`flex w-full items-center justify-between whitespace-nowrap px-2.5 py-1 text-left text-[14px] leading-[1.2] transition-colors hover:bg-[var(--app-surface-soft)] ${
                          sortOrder === option.value
                            ? "bg-[var(--app-accent-soft)] font-semibold text-[var(--app-ink)]"
                            : "bg-white font-medium text-[var(--app-muted)]"
                        }`}
                      >
                        <span className="whitespace-nowrap">
                          {option.label}
                        </span>
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
                      className={`flex h-10 items-center gap-2 rounded-md border px-4 py-0 text-[14px] font-semibold transition-colors ${
                        activeTab === index
                          ? "border-[var(--app-accent)] bg-[var(--app-accent)] text-white shadow-sm"
                          : "border-[var(--app-border)] bg-white text-[var(--app-muted)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-soft)] hover:text-[var(--app-ink)]"
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
                <div className="w-full rounded-md border border-[var(--app-border)] bg-white p-5 text-[var(--app-ink)] shadow-[var(--app-shadow-sm)]">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-subtle)]">
                        Dashboard
                      </p>
                      <h3
                        className="truncate text-base font-semibold text-[var(--app-ink)]"
                        title={dashboardRow.name}
                      >
                        {dashboardRow.name}
                      </h3>
                    </div>
                    <button
                      type="button"
                      aria-label="Voltar para lista"
                      onClick={() => setDashboardRow(null)}
                      className="shrink-0 rounded-md border border-[var(--app-border)] bg-white px-3 py-2 text-sm font-semibold leading-none text-[var(--app-ink)] transition-colors hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-soft)]"
                    >
                      Voltar
                    </button>
                  </div>
                  <PriceChart products={dashboardRow.offers} />
                  <DashboardPriceTable row={dashboardRow} />
                </div>
              ) : (
                <>
                <div className="w-full overflow-hidden rounded-md border border-[var(--app-border)] bg-white text-[var(--app-ink)] shadow-[var(--app-shadow-sm)]">
                  <div className="w-full overflow-x-auto">
                    <table className="w-full min-w-[1240px] table-fixed border-separate border-spacing-0">
                      <TableHeader />
                      <tbody>
                        {filteredRows.length > 0 && !loading ? (
                          visibleComparisonRows.map((row, index) => (
                            <tr
                              key={`${row.id}-${row.name}`}
                              className={
                                index % 2 === 0 ? "bg-white" : "bg-[#f6f7f8]"
                              }
                            >
                              <td className="px-6 py-4 text-left align-middle">
                                <span className="inline-flex rounded-md bg-[#eceff1] px-2.5 py-1 text-xs font-semibold text-[#56646b]">
                                  {getProductBrand(row)}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-left align-middle">
                                <p
                                  className="min-w-0 max-w-[580px] overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium leading-snug text-[var(--app-ink)]"
                                  title={row.name}
                                >
                                  {truncateText(row.name)}
                                </p>
                              </td>
                              <td className="px-5 py-4 text-center align-middle">
                                <div
                                  className="inline-flex flex-col items-center"
                                  onMouseEnter={(event) =>
                                    showStoreRanking(row, event)
                                  }
                                  onMouseLeave={hideStoreRanking}
                                >
                                  <div className="inline-flex min-w-[92px] items-center justify-center gap-2 text-sm font-semibold text-[var(--app-ink)]">
                                    <span>{row.store_count}</span>
                                    <ShoppingBag
                                      size={16}
                                      className="text-[var(--app-muted)]"
                                    />
                                  </div>
                                  <p className="mt-1 whitespace-nowrap text-[11px] font-medium text-[var(--app-subtle)]">
                                    {row.store_count} lojas
                                  </p>
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-5 py-4 text-center align-middle text-sm font-medium text-[var(--app-muted)]">
                                {formatCurrency(row.pma)}
                              </td>
                              <td className="px-5 py-4 text-center align-middle">
                                <a
                                  href={row.cheapest_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-flex min-w-[128px] items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold leading-none !text-white transition-colors ${rowToneClass()}`}
                                >
                                  {formatCurrency(row.cheapest_price)}
                                  <ExternalLink
                                    size={14}
                                    className="shrink-0 text-white"
                                  />
                                </a>
                                <p className="mx-auto mt-1 max-w-[160px] truncate text-center text-[11px] font-medium text-[var(--app-subtle)]">
                                  {row.cheapest_store}
                                </p>
                              </td>
                              <td
                                className={`sticky right-0 z-10 w-[72px] px-4 py-4 text-center align-middle ${
                                  index % 2 === 0 ? "bg-white" : "bg-[#f6f7f8]"
                                }`}
                              >
                                <button
                                  type="button"
                                  aria-label="Abrir dashboard do item"
                                  onClick={() => setDashboardRow(row)}
                                  className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border border-[var(--app-border)] bg-white p-0 leading-none text-[var(--app-muted)] opacity-100 transition-colors hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-soft)] hover:text-[var(--app-ink)]"
                                >
                                  <ChartLine
                                    size={22}
                                    strokeWidth={2.3}
                                    className="text-current"
                                  />
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr className="bg-white">
                            <td
                              colSpan={6}
                              className="h-[360px] px-6 py-4 text-center align-middle text-base font-semibold text-[var(--app-muted)]"
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
                      className="group flex min-h-[430px] min-w-0 flex-col overflow-hidden rounded-md border border-[var(--app-border)] bg-white text-left text-[var(--app-ink)] shadow-[var(--app-shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-[var(--app-border-strong)] hover:shadow-[var(--app-shadow)]"
                    >
                      <div className="flex h-[270px] shrink-0 items-center justify-center bg-[#f1f2f4] px-5 py-5">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                            loading="lazy"
                          />
                        ) : (
                          <ImageIcon size={34} className="text-[var(--app-subtle)]" />
                        )}
                      </div>

                      <div className="flex min-h-[160px] flex-col justify-between border-t border-[var(--app-border)] bg-white px-4 py-4">
                        <h3 className="line-clamp-2 min-h-10 break-words text-[13px] font-medium leading-snug text-[var(--app-ink)]">
                          {product.name}
                        </h3>
                        <div className="mt-3 flex min-w-0 items-end justify-between gap-3">
                          <p className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[25px] font-semibold leading-none text-[var(--app-accent-strong)] tabular-nums">
                            {formatCardCurrency(product.current_price)}
                          </p>
                          <a
                            href={product.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--app-border)] bg-white px-3 text-[11px] font-semibold text-[var(--app-ink)] transition-colors hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-soft)]"
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
              <div className="rounded-md border border-[var(--app-border)] bg-white p-8 text-center font-semibold text-[var(--app-muted)] shadow-[var(--app-shadow-sm)]">
                Nenhum produto disponível.
              </div>
            )}
          </div>
          )}

        </div>
      </div>
      {storeRanking &&
        createPortal(
          <StoreRankingPreview
            row={storeRanking.row}
            left={storeRanking.left}
            top={storeRanking.top}
          />,
          document.body,
        )}
    </div>
  );
}
