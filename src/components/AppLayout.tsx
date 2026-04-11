import { NavLink } from "@/components/NavLink";
import { CursorTooltip } from "@/components/CursorTooltip";
import { useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Target,
  Lightbulb,
  Settings,
  TrendingUp,
  Menu,
  X,
  FlaskConical,
  LogOut,
  LogIn,
  User,
} from "lucide-react";
import { useState, useEffect } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useFinanceStore } from "@/store/financeStore";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, tooltip: "View your monthly income, expenses, savings, and charts at a glance." },
  { title: "Transactions", url: "/transactions", icon: ArrowLeftRight, tooltip: "Add, edit, and delete income and expense entries. Filter by type." },
  { title: "Goals", url: "/goals", icon: Target, tooltip: "Create and track savings goals with target amount, deadline, and monthly contribution." },
  { title: "Insights", url: "/insights", icon: Lightbulb, tooltip: "See spending analysis, budget suggestions, and category trends." },
  { title: "Scenario Lab", url: "/scenario-lab", icon: FlaskConical, tooltip: "Simulate life decisions: project cash flow and compare baseline vs. scenario over 12 months." },
  { title: "Settings", url: "/settings", icon: Settings, tooltip: "Manage account and app preferences (coming soon)." },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  useRealtimeSync(user?.email);

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-sidebar border-r border-sidebar-border fixed inset-y-0 left-0 z-30">
        <SidebarContent pathname={location.pathname} />
      </aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border lg:hidden"
            >
              <SidebarContent pathname={location.pathname} onClose={() => setSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border h-16 flex items-center px-4 lg:px-8">
          <CursorTooltip content="Open the navigation menu (Dashboard, Transactions, Goals, Insights, Settings).">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors mr-3"
            >
              <Menu className="h-5 w-5 text-foreground" />
            </button>
          </CursorTooltip>
          <CursorTooltip content="App name. Click to stay on the current page.">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="font-display text-lg font-semibold text-foreground">FinTrack AI</span>
            </div>
          </CursorTooltip>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ pathname, onClose }: { pathname: string; onClose?: () => void }) {
  const { viewMode } = useFinanceStore();
  const visibleNavItems = navItems.filter(item => 
    viewMode === "splitwise" ? item.title !== "Insights" : true
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sidebar-primary flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold text-sidebar-primary-foreground">
            FinTrack
          </span>
        </div>
        {onClose && (
          <CursorTooltip content="Close the navigation menu.">
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-sidebar-accent transition-colors">
              <X className="h-5 w-5 text-sidebar-foreground" />
            </button>
          </CursorTooltip>
        )}
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {visibleNavItems.map((item) => {
          const isActive = pathname === item.url || (item.url !== "/" && pathname.startsWith(item.url));
          return (
            <CursorTooltip key={item.url} content={item.tooltip}>
              <NavLink
                to={item.url}
                end={item.url === "/"}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border border-transparent ${
                  isActive
                    ? "bg-primary/10 text-primary border-primary/20 shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                activeClassName=""
              >
                <div className={`p-1.5 rounded-lg transition-colors ${isActive ? "bg-primary/20" : "bg-transparent group-hover:bg-muted"}`}>
                  <item.icon className="h-4.5 w-4.5 flex-shrink-0" />
                </div>
                <span>{item.title}</span>
              </NavLink>
            </CursorTooltip>
          );
        })}
      </nav>

      <CursorTooltip content="Tip: Create savings goals on the Goals page to plan and track progress toward targets.">
        <div className="p-4 m-3 rounded-xl bg-sidebar-accent">
          <p className="text-xs text-sidebar-foreground mb-1">Pro Tip</p>
          <p className="text-xs text-sidebar-accent-foreground">
            Set savings goals to stay on track with your finances.
          </p>
        </div>
      </CursorTooltip>
    </div>
  );
}

/** User avatar / sign-in button shown in the top header bar. */
function UserMenu() {
  const { user, signIn, signOut, gsiReady } = useAuth();
  const [open, setOpen] = useState(false);
  const hasGoogleClientId = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const googleSignInLoading = hasGoogleClientId && !gsiReady;

  if (!user) {
    return (
      <CursorTooltip
        content={
          googleSignInLoading
            ? "Loading Google sign-in…"
            : "Sign in with Google to personalise your dashboard and email statements."
        }
      >
        <button
          type="button"
          onClick={signIn}
          disabled={googleSignInLoading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border hover:bg-muted transition-colors text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
        >
          <LogIn className="h-4 w-4" />
          <span className="hidden sm:inline">
            {googleSignInLoading ? "Loading…" : "Sign in"}
          </span>
        </button>
      </CursorTooltip>
    );
  }

  return (
    <div className="relative">
      <CursorTooltip content={`Signed in as ${user.email}. Click to sign out.`}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-muted transition-colors"
        >
          {user.picture ? (
            <img
              src={user.picture}
              alt={user.name}
              className="w-7 h-7 rounded-full object-cover ring-2 ring-primary/30"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
          )}
          <span className="hidden sm:inline text-sm font-medium text-foreground max-w-[120px] truncate">
            {user.name.split(" ")[0]}
          </span>
        </button>
      </CursorTooltip>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-10 z-50 min-w-[200px] rounded-xl border border-border bg-card shadow-xl p-2"
            >
              <div className="px-3 py-2 border-b border-border mb-1">
                <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <button
                onClick={() => { signOut(); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
