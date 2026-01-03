// ============================================
// Card Size Constants
// Exact dimensions for all metric cards
// NON-NEGOTIABLE sizing requirements
// ============================================

export const CARD_SIZES = {
  // Small compact cards (session, loop status)
  session: { 
    width: '200px', 
    height: '120px',
    minWidth: '180px',
  },
  loop: { 
    width: '200px', 
    height: '120px',
    minWidth: '180px',
  },
  
  // Medium cards (scanners, charts)
  marketScanner: { 
    width: '300px', 
    height: '240px',
    minWidth: '280px',
  },
  capitalUtilization: { 
    width: '300px', 
    height: '240px',
    minWidth: '280px',
  },
  executionSpeed: { 
    width: '280px', 
    height: '200px', // REDUCED per spec
    minWidth: '260px',
  },
  
  // Larger interactive cards
  positionCalculator: { 
    width: '320px', 
    height: '280px',
    minWidth: '300px',
  },
  
  // Full width cards
  botCard: { 
    width: '100%', 
    minHeight: '300px',
    maxWidth: '100%',
  },
  
  // Dashboard widgets
  profitTracker: {
    width: '260px',
    height: '180px',
    minWidth: '240px',
  },
  regimeIndicator: {
    width: '200px',
    height: '100px',
    minWidth: '180px',
  },
  activityTerminal: {
    width: '100%',
    height: '200px',
    minHeight: '160px',
  },
  tradeQueue: {
    width: '100%',
    height: '180px',
    minHeight: '140px',
  },
} as const;

// Type for card size keys
export type CardSizeKey = keyof typeof CARD_SIZES;

// Helper to get style object for a card
export const getCardStyle = (key: CardSizeKey): React.CSSProperties => {
  const size = CARD_SIZES[key];
  return {
    width: size.width,
    height: 'height' in size ? size.height : undefined,
    minHeight: 'minHeight' in size ? size.minHeight : undefined,
    minWidth: 'minWidth' in size ? size.minWidth : undefined,
    maxWidth: 'maxWidth' in size ? size.maxWidth : undefined,
  };
};

// Grid layout helpers - NO horizontal scrolling
export const LAYOUT_STYLES = {
  // Card container - flex wrap, NO overflow-x
  cardContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '1rem',
    overflow: 'visible',
  },
  
  // Responsive grid
  responsiveGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '1rem',
    overflow: 'visible',
  },
  
  // Two column layout
  twoColumn: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '1rem',
    overflow: 'visible',
  },
  
  // Three column layout
  threeColumn: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1rem',
    overflow: 'visible',
  },
} as const;
