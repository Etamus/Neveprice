import { useState } from "react";
import { Search, UserRound } from "lucide-react";
import SlidingTabs from "../SlidingTabs";
import useHeroSection from "./viewModel";

export const HeroSection = () => {
  const [activeTab, setActiveTab] = useState(0);
  const {
    productName,
    products,
    storeResults,
    comparisonRows,
    loading,
    setProductName,
    handleSearch,
  } = useHeroSection();

  const submitSearch = () => {
    if (loading) return;
    setActiveTab(0);
    handleSearch();
  };

  return (
    <section className="relative min-h-screen w-full bg-neutral-100 px-0 pt-[86px] text-black">
      <nav className="fixed left-0 right-0 top-0 z-30 bg-white text-black shadow-[0_3px_12px_rgba(0,0,0,0.18)]">
        <div className="relative flex min-h-[86px] w-full items-center justify-center px-6">
          <div className="absolute left-6 top-0 flex h-[74px] items-center text-left text-[28px] font-extrabold tracking-[-0.01em] text-black">
            NevePrice
          </div>

          <div className="flex w-full flex-col items-center justify-center px-44 max-lg:px-36 max-md:px-28">
            <div className="flex h-10 w-full max-w-[785px] items-center overflow-hidden rounded bg-neutral-100">
              <input
                type="text"
                placeholder="Digite o produto que deseja analisar"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitSearch()}
                disabled={loading}
                className="min-w-0 flex-1 bg-transparent px-4 py-2 text-[13px] font-semibold text-black placeholder-neutral-500 focus:outline-none disabled:cursor-wait disabled:opacity-70"
              />
              <button
                type="button"
                onClick={submitSearch}
                disabled={loading}
                aria-label="Buscar"
                className="flex h-10 w-14 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-black transition-colors hover:text-neutral-700 disabled:cursor-wait disabled:opacity-50"
              >
                <Search size={33} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div className="absolute right-7 top-0 flex h-[74px] items-center">
            <button
              type="button"
              aria-label="Login"
              className="flex h-10 w-10 items-center justify-center border-0 bg-transparent p-0 text-black"
            >
              <UserRound size={33} strokeWidth={2.4} />
            </button>
          </div>
        </div>

      </nav>

      <div className="z-10 w-full text-center">
        <div className="neve-scroll-area animate-fade-in">
            <SlidingTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              loading={loading}
              products={products}
              unavailableStoreCount={
                storeResults.filter((store) => !store.available).length
              }
              comparisonRows={comparisonRows}
            />
        </div>
      </div>
    </section>
  );
};
