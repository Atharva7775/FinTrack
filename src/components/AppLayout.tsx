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
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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
        </header>

        <main className="flex-1 p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ pathname, onClose }: { pathname: string; onClose?: () => void }) {
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
        {navItems.map((item) => {
          const isActive = pathname === item.url || (item.url !== "/" && pathname.startsWith(item.url));
          return (
            <CursorTooltip key={item.url} content={item.tooltip}>
              <NavLink
                to={item.url}
                end={item.url === "/"}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-sidebar-primary/15 text-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
                activeClassName=""
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
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
