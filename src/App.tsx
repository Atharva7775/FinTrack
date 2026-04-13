import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CursorTooltipProvider } from "@/components/CursorTooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { SupabaseSync } from "@/components/SupabaseSync";
import { AuthProvider } from "@/hooks/useAuth";
import { LoginModal } from "@/components/LoginModal";
import { OnboardingModal } from "@/components/OnboardingModal";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Goals from "./pages/Goals";
import Insights from "./pages/Insights";
import SettingsPage from "./pages/Settings";
import ScenarioLab from "./pages/ScenarioLab";
import NotFound from "./pages/NotFound";

import { ThemeProvider } from "@/components/theme-provider";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" storageKey="fintrack-theme">
    <AuthProvider>
      <TooltipProvider>
        <CursorTooltipProvider>
          <SupabaseSync />
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <LoginModal />
            <OnboardingModal />
            <AppLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/scenario-lab" element={<ScenarioLab />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
          </BrowserRouter>
        </CursorTooltipProvider>
      </TooltipProvider>
    </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
