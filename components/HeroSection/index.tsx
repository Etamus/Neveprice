import { useState } from "react";
import type { FormEvent } from "react";
import { Search, UserRound } from "lucide-react";
import SlidingTabs from "../SlidingTabs";
import useHeroSection from "./viewModel";
import logoUrl from "../../static/logo.png";

const AUTH_USERS = [
  {
    username: "DEUSM2",
    password: "1234",
  },
];
const AUTH_STORAGE_KEY = "neveprice-auth-user";

export const HeroSection = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    const storedUser = window.localStorage.getItem(AUTH_STORAGE_KEY);
    const knownUser = AUTH_USERS.find((user) => user.username === storedUser);

    return knownUser?.username || null;
  });
  const {
    productName,
    products,
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

  const openLogin = () => {
    setAuthError("");
    setLoginOpen(true);
  };

  const closeLogin = () => {
    setLoginOpen(false);
    setAuthError("");
    setLoginPassword("");
  };

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedUser = loginUser.trim().toUpperCase();
    const user = AUTH_USERS.find(
      (candidate) =>
        candidate.username === normalizedUser &&
        candidate.password === loginPassword,
    );

    if (!user) {
      setAuthError("Login ou senha inválidos.");
      return;
    }

    setCurrentUser(user.username);
    window.localStorage.setItem(AUTH_STORAGE_KEY, user.username);
    setLoginUser("");
    setLoginPassword("");
    setAuthError("");
    setLoginOpen(false);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  return (
    <section className="relative min-h-screen w-full bg-transparent px-0 pt-[78px] text-[var(--app-ink)] max-md:pt-[74px]">
      <nav className="fixed inset-x-0 top-0 z-30 border-b border-[var(--app-border)] bg-white/90 text-[var(--app-ink)] shadow-[var(--app-shadow-sm)] backdrop-blur-xl">
        <div className="relative mx-auto min-h-[78px] w-full max-w-[1600px] px-6 max-md:min-h-[74px] max-md:px-4">
          <div className="absolute left-6 top-1/2 flex -translate-y-1/2 items-center max-md:left-4">
            <img
              src={logoUrl}
              alt="NevePrice"
              className="h-9 w-auto object-contain max-sm:h-7"
            />
          </div>

          <div className="absolute left-1/2 top-1/2 flex w-[min(860px,calc(100vw-360px))] -translate-x-1/2 -translate-y-1/2 justify-center max-lg:w-[min(720px,calc(100vw-300px))] max-md:w-[calc(100vw-144px)] max-sm:w-[calc(100vw-126px)]">
            <div className="flex h-12 w-full max-w-[860px] items-center overflow-hidden rounded-md border border-[#d7dce0] bg-[#f3f4f6] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-colors focus-within:border-[#aeb7bd] focus-within:bg-white max-sm:h-11">
              <input
                type="text"
                placeholder="Digite o produto que deseja analisar"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitSearch()}
                disabled={loading}
                className="min-w-0 flex-1 bg-transparent px-4 py-2 text-[14px] font-medium text-[var(--app-ink)] placeholder-[var(--app-subtle)] outline-none disabled:opacity-70 max-sm:px-3"
              />
              <button
                type="button"
                onClick={submitSearch}
                disabled={loading}
                aria-label="Buscar"
                className="m-1 flex h-10 w-12 shrink-0 items-center justify-center rounded-md border-0 bg-[var(--app-accent-strong)] p-0 text-white transition-colors hover:bg-[var(--app-accent)] disabled:opacity-55 max-sm:h-9 max-sm:w-10"
              >
                <Search size={20} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          <div className="absolute right-6 top-1/2 flex -translate-y-1/2 items-center max-md:right-4">
            <button
              type="button"
              onClick={currentUser ? handleLogout : openLogin}
              aria-label={currentUser ? "Sair" : "Login"}
              className={`flex h-11 items-center justify-center gap-2 rounded-md border border-[var(--app-border)] bg-white px-3 text-sm font-semibold transition-colors hover:border-[var(--app-border-strong)] max-sm:h-10 max-sm:w-10 max-sm:px-0 ${
                currentUser
                  ? "text-[var(--app-accent-strong)]"
                  : "text-[var(--app-muted)] hover:text-[var(--app-ink)]"
              }`}
            >
              <UserRound size={22} strokeWidth={2.2} />
              {currentUser && <span className="max-sm:hidden">{currentUser}</span>}
            </button>
          </div>
        </div>
      </nav>

      {loginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(19,33,38,0.38)] px-4 backdrop-blur-sm">
          <form
            onSubmit={handleLogin}
            className="w-full max-w-[360px] rounded-md border border-[var(--app-border)] bg-white p-5 text-left shadow-[var(--app-shadow)]"
          >
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-subtle)]">
                Acesso
              </p>
            </div>

            <label className="mb-3 block">
              <span className="mb-1.5 block text-sm font-semibold text-[var(--app-muted)]">
                Login
              </span>
              <input
                type="text"
                value={loginUser}
                onChange={(event) => {
                  setLoginUser(event.target.value);
                  setAuthError("");
                }}
                autoComplete="username"
                autoFocus
                className="h-11 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-soft)] px-3 text-sm font-medium text-[var(--app-ink)] outline-none transition-colors focus:border-[var(--app-accent)] focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-[var(--app-muted)]">
                Senha
              </span>
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => {
                  setLoginPassword(event.target.value);
                  setAuthError("");
                }}
                autoComplete="current-password"
                className="h-11 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-soft)] px-3 text-sm font-medium text-[var(--app-ink)] outline-none transition-colors focus:border-[var(--app-accent)] focus:bg-white"
              />
            </label>

            {authError && (
              <p className="mt-3 rounded-md bg-[var(--app-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--app-danger)]">
                {authError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeLogin}
                className="h-10 rounded-md border border-[var(--app-border)] bg-white px-4 text-sm font-semibold text-[var(--app-muted)] transition-colors hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-soft)] hover:text-[var(--app-ink)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="h-10 rounded-md border border-[var(--app-accent)] bg-[var(--app-accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--app-accent-strong)]"
              >
                Entrar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="z-10 w-full">
        <div className="neve-scroll-area animate-fade-in">
          <SlidingTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            loading={loading}
            products={products}
            comparisonRows={comparisonRows}
          />
        </div>
      </div>
    </section>
  );
};
