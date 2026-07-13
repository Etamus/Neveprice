import { useState } from "react";
import { ExternalLink, ShoppingBag } from "lucide-react";
import type { Product, StoreSearchResult } from "../models/product.model";
import { PriceChart } from "./PriceChart";

interface SlidingTabsProps {
  products: Product[];
  stores: StoreSearchResult[];
}

const unavailableLabel = "Não disponível";

const formatPrice = (price: number) =>
  price.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function SlidingTabs({ products, stores }: SlidingTabsProps) {
  const [active, setActive] = useState(0);

  return (
    <div className="w-full flex flex-col items-center mt-10">
      <div className="relative flex bg-blue-900/40 backdrop-blur-md rounded-full p-1 w-[320px] border border-white/10 shadow-2xl">
        <div
          className="absolute top-1 bottom-1 w-1/2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-300 ease-in-out shadow-[0_0_15px_rgba(37,99,235,0.5)]"
          style={{
            transform: `translateX(${active * 100}%)`,
          }}
        />

        <button
          onClick={() => setActive(0)}
          className={`relative z-10 w-1/2 py-2 text-sm font-bold transition-colors ${
            active === 0 ? "text-white" : "text-blue-200 hover:text-white"
          }`}
        >
          Preços
        </button>

        <button
          onClick={() => setActive(1)}
          className={`relative z-10 w-1/2 py-2 text-sm font-bold transition-colors ${
            active === 1 ? "text-white" : "text-blue-200 hover:text-white"
          }`}
        >
          Histórico
        </button>
      </div>

      <div className="mt-10 w-full">
        {active === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4 animate-fade-in">
            {stores.map((store) => {
              const product = store.product;

              if (!product) {
                return (
                  <div
                    key={store.key}
                    className="flex min-h-64 min-w-0 flex-col justify-between overflow-hidden bg-white/5 backdrop-blur-sm border border-white/10 p-4 rounded-lg"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-blue-100">
                        {store.label}
                      </span>
                      <ShoppingBag
                        size={16}
                        className="shrink-0 text-blue-100/60"
                      />
                    </div>

                    <div className="flex flex-1 min-w-0 flex-col items-center justify-center text-center">
                      <span className="max-w-full break-words text-lg font-bold leading-tight text-white">
                        {store.message || unavailableLabel}
                      </span>
                      <span className="mt-2 max-w-full break-words text-xs leading-snug text-blue-100/60">
                        Sem oferta retornada para esta busca.
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={store.key}
                  className="flex h-full min-w-0 flex-col overflow-hidden bg-white/5 backdrop-blur-sm border border-white/10 p-4 rounded-lg hover:bg-white/10 transition-all group"
                >
                  <div className="flex min-w-0 items-center justify-between gap-2 mb-3">
                    <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-cyan-300">
                      {store.label}
                    </span>
                    <ShoppingBag
                      size={16}
                      className="shrink-0 text-cyan-300/80"
                    />
                  </div>

                  {product.image_url && (
                    <div className="mb-3 flex h-28 shrink-0 items-center justify-center rounded-lg bg-white">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="max-h-24 max-w-full object-contain"
                        loading="lazy"
                      />
                    </div>
                  )}

                  <h3 className="text-slate-200 font-medium leading-snug min-h-14 line-clamp-3 mb-4 group-hover:text-white transition-colors">
                    {product.name}
                  </h3>

                  <div className="flex min-w-0 flex-col mb-4 mt-auto">
                    <span className="text-xs text-blue-300/70 uppercase">
                      Preço atual
                    </span>
                    <span className="max-w-full break-words text-xl 2xl:text-2xl font-black leading-tight text-white tabular-nums">
                      R$ {formatPrice(product.current_price)}
                    </span>
                  </div>

                  <a
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-2 rounded-lg border border-white/5 bg-white/10 px-2 py-2 text-center text-[11px] font-bold leading-tight text-white transition-all hover:bg-gradient-to-r hover:from-blue-600 hover:to-cyan-500"
                  >
                    <ExternalLink size={15} className="shrink-0" />
                    <span className="min-w-0 break-words">ACESSAR PRODUTO</span>
                  </a>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="w-full bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-8 min-h-[400px] flex items-center justify-center">
            <div className="text-center">
              <p className="text-blue-200 font-medium">
                Análise de variação temporal
              </p>

              {active === 1 && (
                <div className="w-full mt-4">
                  {products && products.length > 0 ? (
                    <PriceChart products={products} />
                  ) : (
                    <p className="text-white text-center">
                      Aguardando dados...
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
