import { HeroSection } from "../../components/HeroSection";

export const Home = () => {
  return (
    <section className="relative min-h-screen flex items-center px-4 bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 overflow-hidden">
      {/* Glow Effect */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-cyan-500 opacity-30 blur-[120px] rounded-full"></div>
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-blue-500 opacity-30 blur-[120px] rounded-full"></div>

      <div className="relative z-10 max-w-4xl mx-auto text-center text-white space-y-6">
        <main>
          <HeroSection />
        </main>
      </div>
    </section>
  );
};
