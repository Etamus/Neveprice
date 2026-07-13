import SlidingTabs from "../SlidingTabs";
import useHeroSection from "./viewModel";

export const HeroSection = () => {
  const {
    productName,
    products,
    storeResults,
    loading,
    feedback,
    setProductName,
    handleSearch,
  } = useHeroSection();

  return (
    <section className="relative min-h-screen flex flex-col items-center px-4 pt-20">
      <div className="max-w-7xl mx-auto text-center space-y-8 z-10 w-full">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-200">
          Busque os melhores preços
        </h1>

        <p className="text-lg text-blue-100">
          Compare ofertas em segundos e economize com inteligência.
        </p>

        <div className="flex justify-center mt-6">
          <div className="flex w-full max-w-xl bg-white/10 backdrop-blur-md border border-white/20 rounded-full overflow-hidden shadow-lg">
            <input
              type="text"
              placeholder="Digite o nome do produto..."
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="min-w-0 flex-1 px-6 py-3 bg-transparent text-white placeholder-blue-200 focus:outline-none"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="shrink-0 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:opacity-90 transition-all font-medium disabled:grayscale"
            >
              {loading ? "Buscando..." : "Buscar"}
            </button>
          </div>
        </div>

        {feedback && (
          <p className="text-sm text-blue-100/80 max-w-2xl mx-auto">
            {feedback}
          </p>
        )}

        {storeResults.length > 0 && (
          <div className="mt-10 animate-fade-in">
            <SlidingTabs products={products} stores={storeResults} />
          </div>
        )}
      </div>
    </section>
  );
};
