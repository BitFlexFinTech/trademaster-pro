import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { MainLayout } from "./components/layout/MainLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Signals from "./pages/Signals";
import AutoEarn from "./pages/AutoEarn";
import Airdrops from "./pages/Airdrops";
import Analytics from "./pages/Analytics";
import Risk from "./pages/Risk";
import Sandbox from "./pages/Sandbox";
import Charts from "./pages/Charts";
import Bots from "./pages/Bots";
import Settings from "./pages/Settings";
import DemoAccount from "./pages/DemoAccount";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/signals" element={<Signals />} />
              <Route path="/auto-earn" element={<AutoEarn />} />
              <Route path="/bots" element={<Bots />} />
              <Route path="/airdrops" element={<Airdrops />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/risk" element={<Risk />} />
              <Route path="/sandbox" element={<Sandbox />} />
              <Route path="/charts" element={<Charts />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/demo-account" element={<DemoAccount />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;