import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  BarChart3,
  Download,
  Grid2X2,
  LogOut,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import SlidingTabs from "../SlidingTabs";
import useHeroSection from "./viewModel";
import logoUrl from "../../static/logo.png";

const AUTH_USERS = [{ username: "DEUSM2", password: "1234" }];
const AUTH_STORAGE_KEY = "neveprice-auth-user";

const navigation = [
  { label: "Ofertas", description: "Comparação de preços", icon: PackageSearch },
  { label: "Catálogo", description: "Visualização em grade", icon: Grid2X2 },
  { label: "Analytics", description: "Leitura de mercado", icon: BarChart3 },
];

export const HeroSection = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const accountRef = useRef<HTMLDivElement>(null);
  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    const storedUser = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return AUTH_USERS.find((user) => user.username === storedUser)?.username || null;
  });
  const {
    productName,
    products,
    comparisonRows,
    loading,
    lastQuery,
    setProductName,
    handleSearch,
  } = useHeroSection();

  useEffect(() => {
    const closeMenus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLoginOpen(false);
        setAccountOpen(false);
        setSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", closeMenus);
    return () => window.removeEventListener("keydown", closeMenus);
  }, []);

  useEffect(() => {
    const closeAccountMenu = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeAccountMenu, true);
    return () => document.removeEventListener("pointerdown", closeAccountMenu, true);
  }, []);

  const submitSearch = (event?: FormEvent) => {
    event?.preventDefault();
    if (loading || !productName.trim()) return;
    setActiveTab(0);
    setSidebarOpen(false);
    handleSearch();
  };

  const openLogin = () => {
    setAccountOpen(false);
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
    setAccountOpen(false);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const switchTab = (index: number) => {
    setActiveTab(index);
    setSidebarOpen(false);
  };

  const toggleSidebar = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setSidebarCollapsed((collapsed) => !collapsed);
      return;
    }

    setSidebarOpen((open) => !open);
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? "app-shell--sidebar-collapsed" : ""}`}>
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[2px] lg:hidden"
          aria-label="Fechar navegação"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`app-sidebar ${sidebarOpen ? "app-sidebar--open" : ""}`}>
        <div className="flex h-16 items-center justify-center border-b border-[var(--border)] px-5">
          <img src={logoUrl} alt="NevePrice" className="h-8 w-auto" />
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-3 py-5">
          <p className="sidebar-label">Workspace</p>
          <nav className="mt-2 space-y-1" aria-label="Navegação principal">
            {navigation.map((item, index) => {
              const Icon = item.icon;
              const active = activeTab === index;

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => switchTab(index)}
                  className={`sidebar-item ${active ? "sidebar-item--active" : ""}`}
                >
                  <span className="sidebar-item__icon">
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="block text-[13px] font-semibold leading-5">{item.label}</span>
                    <span className="block truncate text-xs font-medium text-[var(--muted)]">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div ref={accountRef} className="account-menu-root mt-auto border-t border-[var(--border)] pt-4">
            {currentUser && accountOpen && (
              <div className="account-popover">
                <button type="button" className="account-popover__item">
                  <Settings size={15} />
                  Configurações
                </button>
                <button type="button" className="account-popover__item">
                  <Download size={15} />
                  Extrações
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="account-popover__item account-popover__item--danger"
                >
                  <LogOut size={15} />
                  Encerrar sessão
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={currentUser ? () => setAccountOpen((open) => !open) : openLogin}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--surface-subtle)]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                {currentUser ? currentUser.slice(0, 2) : <UserRound size={17} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-[var(--foreground)]">
                  {currentUser || "Entrar na conta"}
                </span>
                <span className="block truncate text-xs text-[var(--muted)]">
                  {currentUser ? "Sessão ativa" : "Acesso ao workspace"}
                </span>
              </span>
            </button>
          </div>
        </div>
      </aside>

      <section className="app-main">
        <header className="app-header">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Alternar navegação"
              className="icon-button"
              onClick={toggleSidebar}
            >
              <span className="flex lg:hidden">
                {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
              </span>
              <span className="hidden lg:flex">
                {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </span>
            </button>
            <div className="hidden items-center gap-2 text-xs md:flex">
              <span className="font-medium text-[var(--muted)]">Workspace</span>
              <span className="text-[var(--border-strong)]">/</span>
              <span className="font-semibold text-[var(--foreground)]">{navigation[activeTab].label}</span>
            </div>
          </div>

          <form onSubmit={submitSearch} className="header-search">
            <input
              type="search"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="Buscar produto, modelo ou SKU..."
              disabled={loading}
              aria-label="Buscar produtos"
            />
            <button
              type="submit"
              disabled={loading || !productName.trim()}
              className="search-submit"
              aria-label="Buscar"
            >
              {loading ? <span className="button-spinner" /> : <Search size={17} />}
            </button>
          </form>

          <div aria-hidden="true" />
        </header>

        <main className="app-content">
          <SlidingTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            loading={loading}
            products={products}
            comparisonRows={comparisonRows}
            lastQuery={lastQuery}
          />
        </main>
      </section>

      {loginOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={closeLogin}>
          <form
            onSubmit={handleLogin}
            className="auth-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Acesso"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <UserRound size={19} />
                </span>
                <h2 className="mt-5 text-lg font-semibold text-[var(--foreground)]">Acesso</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Use suas credenciais para continuar.</p>
              </div>
              <button type="button" className="icon-button" onClick={closeLogin} aria-label="Fechar">
                <X size={17} />
              </button>
            </div>

            <label className="form-field mt-6">
              <span>Login</span>
              <input
                type="text"
                value={loginUser}
                onChange={(event) => {
                  setLoginUser(event.target.value);
                  setAuthError("");
                }}
                autoComplete="username"
                autoFocus
              />
            </label>
            <label className="form-field mt-4">
              <span>Senha</span>
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => {
                  setLoginPassword(event.target.value);
                  setAuthError("");
                }}
                autoComplete="current-password"
              />
            </label>

            {authError && <p className="auth-error">{authError}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <button type="submit" className="button-primary">Entrar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
