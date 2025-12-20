import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useOpenPositionMonitor } from '@/hooks/useOpenPositionMonitor';

export function MainLayout() {
  // Background position monitor - runs app-wide, independently of bot state
  // This ensures profits are taken even when bot is stopped or user is on other pages
  useOpenPositionMonitor({
    pollingIntervalMs: 3000, // Check every 3 seconds
    minProfitThreshold: 0.0001, // 0.01% - take any profit above fees
    enabled: true,
  });

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 p-6 overflow-hidden min-h-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
