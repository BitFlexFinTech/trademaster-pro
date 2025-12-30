import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useOpenPositionMonitor } from '@/hooks/useOpenPositionMonitor';
import { ConnectionStatusIndicator } from '@/components/bots/ConnectionStatusIndicator';

export function MainLayout() {
  // Background position monitor - runs app-wide, independently of bot state
  useOpenPositionMonitor({
    pollingIntervalMs: 3000,
    minProfitThreshold: 0.0001,
    enabled: true,
  });

  return (
    <div className="flex h-screen w-full bg-obsidian overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        {/* CRITICAL: Main content area - never scrolls, child components handle their own scroll */}
        <main className="flex-1 p-4 overflow-hidden min-h-0">
          <Outlet />
        </main>
      </div>
      {/* Global connection status indicator */}
      <ConnectionStatusIndicator />
    </div>
  );
}
