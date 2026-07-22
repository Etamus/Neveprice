import { HeroSection } from "../../components/HeroSection";

export const Home = () => {
  return (
    <section className="relative min-h-screen bg-[var(--app-bg)] text-[var(--app-ink)]">
      <div className="relative z-10 w-full">
        <main>
          <HeroSection />
        </main>
      </div>
    </section>
  );
};
