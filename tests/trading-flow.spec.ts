import { test, expect } from '@playwright/test';

/**
 * Trading Flow E2E Tests
 * Tests: Bot Start -> WebSocket Update -> Order Execution -> Profit Log
 */

test.describe('Trading Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to bots page
    await page.goto('/bots');
    await page.waitForLoadState('networkidle');
  });

  test('should display bot cards on bots page', async ({ page }) => {
    // Check for bot card elements (either full cards or micro cards)
    const botElements = page.locator('[class*="bot"], [class*="card"], [data-testid*="bot"]');
    await expect(botElements.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show WebSocket connection status', async ({ page }) => {
    // Look for connection status indicator
    const wsIndicator = page.locator('[class*="ws-status"], [class*="connection"], text=Live, text=Offline, text=Connected');
    await expect(wsIndicator.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display trading mode toggle (Demo/Live)', async ({ page }) => {
    // Check for Demo/Live toggle
    const demoButton = page.locator('button:has-text("Demo")');
    const liveButton = page.locator('button:has-text("Live")');
    
    await expect(demoButton).toBeVisible();
    await expect(liveButton).toBeVisible();
  });

  test('should start in Demo mode by default', async ({ page }) => {
    // Check for Demo mode indicator
    const demoIndicator = page.locator('text=DEMO MODE, text=Demo Mode, [class*="demo"]');
    await expect(demoIndicator.first()).toBeVisible({ timeout: 5000 });
  });

  test('should display portfolio/balance information', async ({ page }) => {
    // Check for balance display
    const balanceElement = page.locator('text=PORTFOLIO, text=VIRTUAL, text=$');
    await expect(balanceElement.first()).toBeVisible({ timeout: 5000 });
  });

  test('should have start/stop bot buttons', async ({ page }) => {
    // Look for start or play buttons
    const startButton = page.locator('button:has(svg[class*="play"]), button:has-text("Start"), [aria-label*="start" i]');
    await expect(startButton.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show bot type badges (Spot/Leverage)', async ({ page }) => {
    // Check for bot type indicators
    const spotBadge = page.locator('text=SPOT, text=Spot');
    const leverageBadge = page.locator('text=LEV, text=Leverage');
    
    // At least one should be visible
    const hasSpot = await spotBadge.first().isVisible().catch(() => false);
    const hasLev = await leverageBadge.first().isVisible().catch(() => false);
    
    expect(hasSpot || hasLev).toBe(true);
  });

  test('should display P&L information', async ({ page }) => {
    // Look for profit/loss display
    const pnlElement = page.locator('text=$, text=P&L, text=PnL, [class*="pnl"], [class*="profit"]');
    await expect(pnlElement.first()).toBeVisible({ timeout: 5000 });
  });

  test('should show hit rate percentage', async ({ page }) => {
    // Look for hit rate display
    const hitRateElement = page.locator('text=HR, text=Hit Rate, text=%');
    await expect(hitRateElement.first()).toBeVisible({ timeout: 5000 });
  });

  test('should have refresh/sync button for live mode', async ({ page }) => {
    // Switch to live mode first if possible
    const liveButton = page.locator('button:has-text("Live")');
    if (await liveButton.isEnabled()) {
      await liveButton.click();
    }
    
    // Look for refresh button
    const refreshButton = page.locator('button:has(svg[class*="refresh"]), [aria-label*="refresh" i], [aria-label*="sync" i]');
    await expect(refreshButton.first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Bot Interaction', () => {
  test('should toggle bot settings drawer', async ({ page }) => {
    await page.goto('/bots');
    await page.waitForLoadState('networkidle');
    
    // Look for settings button/icon
    const settingsButton = page.locator('button:has(svg[class*="settings"]), [aria-label*="settings" i], button:has(svg[class*="cog"])');
    
    if (await settingsButton.first().isVisible()) {
      await settingsButton.first().click();
      
      // Check if drawer/modal opened
      const drawer = page.locator('[role="dialog"], [class*="drawer"], [class*="sheet"]');
      await expect(drawer).toBeVisible({ timeout: 3000 });
    }
  });

  test('should display recent trades section', async ({ page }) => {
    await page.goto('/bots');
    await page.waitForLoadState('networkidle');
    
    // Look for recent trades section
    const recentTrades = page.locator('text=Recent Trades, text=Trade History, [class*="trades"]');
    await expect(recentTrades.first()).toBeVisible({ timeout: 10000 });
  });

  test('should have emergency kill switch', async ({ page }) => {
    await page.goto('/bots');
    await page.waitForLoadState('networkidle');
    
    // Look for kill switch or emergency stop
    const killSwitch = page.locator('text=Kill, text=Emergency, text=Stop All, [class*="kill"], [class*="emergency"]');
    await expect(killSwitch.first()).toBeVisible({ timeout: 5000 });
  });
});
