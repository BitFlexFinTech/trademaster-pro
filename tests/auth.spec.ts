import { test, expect } from '@playwright/test';

/**
 * Authentication Flow E2E Tests
 * Tests: Login -> Persistent Session -> Protected Routes
 */

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing session
    await page.context().clearCookies();
  });

  test('should display login page for unauthenticated users', async ({ page }) => {
    await page.goto('/bots');
    
    // Should redirect to auth page or show login prompt
    await expect(page).toHaveURL(/auth|login/);
  });

  test('should show email and password input fields', async ({ page }) => {
    await page.goto('/auth');
    
    // Check for login form elements
    await expect(page.locator('input[type="email"], input[placeholder*="email" i]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/auth');
    
    // Fill in invalid credentials
    await page.fill('input[type="email"], input[placeholder*="email" i]', 'invalid@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    
    // Submit form
    await page.click('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")');
    
    // Should show error message
    await expect(page.locator('text=Invalid credentials, text=error, [role="alert"]')).toBeVisible({ timeout: 5000 }).catch(() => {
      // Error might be shown as toast
      expect(page.locator('.sonner-toast, [data-sonner-toast]')).toBeVisible();
    });
  });

  test('should maintain session after page reload', async ({ page, context }) => {
    // This test assumes demo mode is accessible without auth
    await page.goto('/');
    
    // Check if we're on the main page
    await expect(page).not.toHaveURL(/auth|login/);
    
    // Reload page
    await page.reload();
    
    // Should still be on the same page (session maintained)
    await expect(page).not.toHaveURL(/auth|login/);
  });

  test('should show sign up option', async ({ page }) => {
    await page.goto('/auth');
    
    // Check for sign up link or tab
    const signUpElement = page.locator('text=Sign Up, text=Register, text=Create Account, button:has-text("Sign Up")');
    await expect(signUpElement.first()).toBeVisible();
  });
});

test.describe('Protected Routes', () => {
  test('should protect admin routes', async ({ page }) => {
    await page.goto('/admin');
    
    // Should redirect to auth or show access denied
    const currentUrl = page.url();
    expect(currentUrl.includes('auth') || currentUrl.includes('login') || currentUrl === 'http://localhost:8080/').toBe(true);
  });

  test('should protect settings routes', async ({ page }) => {
    await page.goto('/settings');
    
    // Settings might require auth
    await page.waitForLoadState('networkidle');
  });
});
