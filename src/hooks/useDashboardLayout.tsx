import { useState, useCallback, useEffect } from 'react';

export interface CardLayout {
  id: string;
  colSpan: number;
  rowSpan: number;
  visible: boolean;
  order: number;
}

interface DashboardLayoutResult {
  layouts: CardLayout[];
  isEditMode: boolean;
  setEditMode: (mode: boolean) => void;
  updateCardSize: (id: string, colSpan: number, rowSpan: number) => void;
  toggleCardVisibility: (id: string) => void;
  reorderCard: (id: string, newOrder: number) => void;
  resetLayout: () => void;
  getCardLayout: (id: string) => CardLayout | undefined;
}

const DEFAULT_LAYOUTS: CardLayout[] = [
  { id: 'market-regime', colSpan: 12, rowSpan: 1, visible: true, order: 0 },
  { id: 'live-profit', colSpan: 12, rowSpan: 1, visible: true, order: 1 },
  { id: 'volatility-scanner', colSpan: 6, rowSpan: 2, visible: true, order: 2 },
  { id: 'timing-advisor', colSpan: 6, rowSpan: 2, visible: true, order: 3 },
  { id: 'spot-bot', colSpan: 3, rowSpan: 2, visible: true, order: 4 },
  { id: 'leverage-bot', colSpan: 3, rowSpan: 2, visible: true, order: 5 },
  { id: 'unified-dashboard', colSpan: 6, rowSpan: 3, visible: true, order: 6 },
  { id: 'cumulative-chart', colSpan: 6, rowSpan: 2, visible: true, order: 7 },
  { id: 'trade-queue', colSpan: 12, rowSpan: 1, visible: true, order: 8 },
];

const STORAGE_KEY = 'greenback-dashboard-layout';

export function useDashboardLayout(): DashboardLayoutResult {
  const [layouts, setLayouts] = useState<CardLayout[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new cards
        return DEFAULT_LAYOUTS.map(defaultLayout => {
          const saved = parsed.find((l: CardLayout) => l.id === defaultLayout.id);
          return saved || defaultLayout;
        });
      }
    } catch {
      // ignore
    }
    return DEFAULT_LAYOUTS;
  });
  
  const [isEditMode, setEditMode] = useState(false);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  }, [layouts]);

  const updateCardSize = useCallback((id: string, colSpan: number, rowSpan: number) => {
    setLayouts(prev => prev.map(layout => 
      layout.id === id 
        ? { ...layout, colSpan: Math.max(1, Math.min(12, colSpan)), rowSpan: Math.max(1, Math.min(4, rowSpan)) }
        : layout
    ));
  }, []);

  const toggleCardVisibility = useCallback((id: string) => {
    setLayouts(prev => prev.map(layout => 
      layout.id === id ? { ...layout, visible: !layout.visible } : layout
    ));
  }, []);

  const reorderCard = useCallback((id: string, newOrder: number) => {
    setLayouts(prev => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const cardIndex = sorted.findIndex(l => l.id === id);
      if (cardIndex === -1) return prev;
      
      const [card] = sorted.splice(cardIndex, 1);
      sorted.splice(newOrder, 0, card);
      
      return sorted.map((layout, index) => ({ ...layout, order: index }));
    });
  }, []);

  const resetLayout = useCallback(() => {
    setLayouts(DEFAULT_LAYOUTS);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const getCardLayout = useCallback((id: string) => {
    return layouts.find(l => l.id === id);
  }, [layouts]);

  return {
    layouts: [...layouts].sort((a, b) => a.order - b.order),
    isEditMode,
    setEditMode,
    updateCardSize,
    toggleCardVisibility,
    reorderCard,
    resetLayout,
    getCardLayout,
  };
}
