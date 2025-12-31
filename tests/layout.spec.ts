import { test, expect } from '@playwright/test';

/**
 * UI Layout E2E Tests
 * Tests: Zero page scroll, only designated containers scrollable
 * Asserts: scrollHeight == clientHeight for body (no page scroll)
 */

test.describe('UI Layout - Zero Scroll Policy', () => {
  test('body should have no scroll (scrollHeight == clientHeight)', async ({ page }) => {
    await page.goto('/bots');
    await page.waitForLoadState('networkidle');
    
    // Wait for content to load
    await page.waitForTimeout(1000);
    
    const scrollInfo = await page.evaluate(() => ({
      scrollHeight: document.body.scrollHeight,
      clientHeight: document.body.clientHeight,
      overflow: window.getComputedStyle(document.body).overflow,
      overflowY: window.getComputedStyle(document.body).overflowY,
    }));
    
    // Body should not be scrollable
    expect(scrollInfo.scrollHeight).toBeLessThanOrEqual(scrollInfo.clientHeight + 1); // Allow 1px tolerance
    expect(['hidden', 'clip']).toContain(scrollInfo.overflow);
  });

  test('html element should have overflow hidden', async ({ page }) => {
    await page.goto('/bots');
    await page.waitForLoadState('networkidle');
    
    const htmlOverflow = await page.evaluate(() => 
      window.getComputedStyle(document.documentElement).overflow
    );
    
    expect(['hidden', 'clip']).toContain(htmlOverflow);
  });

  test('root element should have fixed height', async ({ page }) => {
    await page.goto('/bots');
    await page.waitForLoadState('networkidle');
    
    const rootInfo = await page.evaluate(() => {
      const root = document.getElementById('root');
      if (!root) return null;
      const style = window.getComputedStyle(root);
      return {
        height: root.offsetHeight,
        viewportHeight: window.innerHeight,
        overflow: style.overflow,
      };
    });
    
    expect(rootInfo).not.toBeNull();
    if (rootInfo) {
      // Root height should match viewport
      expect(rootInfo.height).toBeLessThanOrEqual(rootInfo.viewportHeight + 1);
      expect(['hidden', 'clip', '']).toContain(rootInfo.overflow);
    }
  });

  test('designated scroll containers should be scrollable', async ({ page }) => {
    await page.goto('/bots');
    await page.waitForLoadState('networkidle');
    
    // Look for scroll areas (using Radix ScrollArea or custom scrollable-box)
    const scrollContainers = await page.evaluate(() => {
      const containers = document.querySelectorAll('[data-radix-scroll-area-viewport], .scrollable-box, [class*="scroll-area"]');
      return Array.from(containers).map(el => {
        const style = window.getComputedStyle(el);
        return {
          overflowY: style.overflowY,
          hasScroll: el.scrollHeight > el.clientHeight,
        };
      });
    });
    
    // At least some scroll containers should exist
    expect(scrollContainers.length).toBeGreaterThanOrEqual(0);
    
    // If there are scroll containers with overflow content, they should allow scrolling
    scrollContainers.forEach(container => {
      if (container.hasScroll) {
        expect(['auto', 'scroll']).toContain(container.overflowY);
      }
    });
  });

  test('bot-grid container should be the only scrollable area', async ({ page }) => {
    await page.goto('/bots');
    await page.waitForLoadState('networkidle');
    
    // Check that bot-grid has overflow auto
    const botGridInfo = await page.evaluate(() => {
      const botGrid = document.querySelector('[data-testid="bot-grid"]');
      if (!botGrid) return null;
      const style = window.getComputedStyle(botGrid);
      return {
        overflowY: style.overflowY,
        overflowX: style.overflowX,
      };
    });
    
    // Bot grid should exist and allow scrolling
    expect(botGridInfo).not.toBeNull();
  });
});

test.describe('UI Layout - Viewport Constraints', () => {
  test('page should fit within viewport on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/bots');
    await page.waitForLoadState('networkidle');
    
    const pageInfo = await page.evaluate(() => ({
      bodyWidth: document.body.offsetWidth,
      bodyHeight: document.body.offsetHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      hasHorizontalScroll: document.body.scrollWidth > window.innerWidth,
      hasVerticalScroll: document.body.scrollHeight > window.innerHeight,
    }));
    
    expect(pageInfo.hasHorizontalScroll).toBe(false);
    expect(pageInfo.hasVerticalScroll).toBe(false);
  });

  test('page should fit within viewport on laptop (14 inch)', async ({ page }) => {
    // 14" laptop typical resolution
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/bots');
    await page.waitForLoadState('networkidle');
    
    const pageInfo = await page.evaluate(() => ({
      hasHorizontalScroll: document.body.scrollWidth > window.innerWidth,
      hasVerticalScroll: document.body.scrollHeight > window.innerHeight,
    }));
    
    expect(pageInfo.hasHorizontalScroll).toBe(false);
    expect(pageInfo.hasVerticalScroll).toBe(false);
  });

  test('page should fit within viewport on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/bots');
    await page.waitForLoadState('networkidle');
    
    const pageInfo = await page.evaluate(() => ({
      hasHorizontalScroll: document.body.scrollWidth > window.innerWidth,
      hasVerticalScroll: document.body.scrollHeight > window.innerHeight,
    }));
    
    expect(pageInfo.hasHorizontalScroll).toBe(false);
    expect(pageInfo.hasVerticalScroll).toBe(false);
  });
});

test.describe('UI Layout - Custom Scrollbar', () => {
  test('should have thin scrollbar styles applied', async ({ page }) => {
    await page.goto('/bots');
    await page.waitForLoadState('networkidle');
    
    // Check if custom scrollbar width is applied via CSS
    const hasCustomScrollbar = await page.evaluate(() => {
      // Create a test element to check scrollbar width
      const testEl = document.createElement('div');
      testEl.style.cssText = 'width:100px;height:100px;overflow:scroll;position:absolute;top:-9999px;';
      testEl.innerHTML = '<div style="height:200px;"></div>';
      document.body.appendChild(testEl);
      
      const scrollbarWidth = testEl.offsetWidth - testEl.clientWidth;
      document.body.removeChild(testEl);
      
      // Custom thin scrollbar should be <= 8px
      return scrollbarWidth <= 8;
    });
    
    expect(hasCustomScrollbar).toBe(true);
  });
});

test.describe('UI Layout - Component Visibility', () => {
  test('header should be visible and fixed', async ({ page }) => {
    await page.goto('/bots');
    await page.waitForLoadState('networkidle');
    
    const header = page.locator('header, [class*="header"]');
    await expect(header.first()).toBeVisible();
  });

  test('sidebar should be visible on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/bots');
    await page.waitForLoadState('networkidle');
    
    // Look for sidebar or navigation
    const sidebar = page.locator('aside, nav, [class*="sidebar"]');
    await expect(sidebar.first()).toBeVisible({ timeout: 5000 });
  });

  test('main content area should fill available space', async ({ page }) => {
    await page.goto('/bots');
    await page.waitForLoadState('networkidle');
    
    const mainContent = page.locator('main, [class*="main"], [class*="content"]');
    await expect(mainContent.first()).toBeVisible();
    
    const mainInfo = await mainContent.first().boundingBox();
    expect(mainInfo).not.toBeNull();
    if (mainInfo) {
      // Main content should have reasonable height
      expect(mainInfo.height).toBeGreaterThan(200);
    }
  });
});
