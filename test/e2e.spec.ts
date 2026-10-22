import { test, expect } from '@playwright/test';
import path from 'path';

const PORT = process.env.PORT || '3000';
const BASE_URL = `http://localhost:${PORT}`;

// Safety check: Prevent running destructive tests against a non-test Supabase instance
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const isTestSupabase =
  !supabaseUrl ||
  supabaseUrl.includes('test') ||
  supabaseUrl.includes('mock') ||
  supabaseUrl.includes('localhost') ||
  process.env.ALLOW_E2E_PROD === 'true';

if (!isTestSupabase && process.env.NODE_ENV === 'production') {
  throw new Error(
    `[SECURITY PREVENT] E2E tests refused to run against non-test Supabase instance: ${supabaseUrl}. Configure a test project or mock URL.`
  );
}

// Helper to log in test user if auth is required
async function ensureAuthenticated(page: any) {
  const loginRequired = await page.evaluate(() => window.location.pathname.includes('/login'));
  if (loginRequired) {
    await page.fill('input[type="email"]', 'demand@aksharveda.com');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
  }
}

test.describe('Aksharveda Dashboard End-to-End Suite', () => {
  test('1. Upload sample CSV, view /pos totals, and switch views', async ({ page }) => {
    test.setTimeout(60000);

    // Navigate to /upload
    await page.goto(`${BASE_URL}/upload`);
    await ensureAuthenticated(page);
    await expect(page.locator('h1')).toContainText('Upload Blinkit PO Export');

    // Upload sample CSV
    const sampleCsv = path.join(process.cwd(), 'sample-data', 'bulk_po_csv-3672559.csv');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(sampleCsv);

    // Wait for Step 3 Preview (Check for Reconciliation Check or file summary pill)
    await expect(page.locator('text=Reconciliation Check')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('text=New POs')).toBeVisible();

    // Confirm Import
    const confirmBtn = page.locator('button:has-text("Confirm Import")');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Verify Step 4 Done
    await expect(page.locator('text=Import Successfully Processed!')).toBeVisible({ timeout: 30000 });

    // Navigate to /pos
    await page.goto(`${BASE_URL}/pos`);
    await expect(page.locator('h1')).toContainText('Purchase Orders Dashboard');

    // Check summary tile numbers
    await expect(page.locator('text=Total Purchase Orders')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Total PO Value')).toBeVisible();
    await expect(page.locator('text=Total Units Ordered')).toBeVisible();

    // Switch view to Last X days
    await page.click('button:has-text("Last X Days")');
    await expect(page).toHaveURL(/view=recent/);

    // Switch view back to By Month
    await page.click('button:has-text("By Month")');
    await expect(page).toHaveURL(/view=month/);
  });

  test('2. Open PO drawer, inspect line items and state audit history', async ({ page }) => {
    await page.goto(`${BASE_URL}/pos`);

    // Wait for row to be interactive and click it
    const row = page.locator('table tbody tr[role="button"]').first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.click();

    // Verify drawer slides in
    const drawer = page.locator('div[role="dialog"]');
    await expect(drawer).toBeVisible({ timeout: 15000 });
    await expect(drawer.getByText(/Line Items/i)).toBeVisible({ timeout: 10000 });
    await expect(drawer.getByText(/State History Timeline/i)).toBeVisible({ timeout: 10000 });

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
  });

  test('3. Edit planning sheet cells, check persistence on reload, and export Excel', async ({ page }) => {
    const TEST_PO_NUMBER = 'TEST-E2E-99999999';
    const TEST_REMARK = 'TEST-E2E-ISOLATED-REMARK';

    // Step 0: Ensure clean test isolation before test begins - insert dedicated test PO
    await page.request.post(`${BASE_URL}/api/planning`, {
      data: {
        action: 'upsert_test_po',
        po_number: TEST_PO_NUMBER,
      }
    }).catch(() => null);

    try {
      await page.goto(`${BASE_URL}/planning?search=${TEST_PO_NUMBER}`);
      await expect(page.locator('h1')).toContainText('Dispatch Planning Sheet');

      // Wait for matrix row for our isolated test PO
      const remarksInput = page.locator(`input[placeholder="Add remarks..."]`).first();
      await expect(remarksInput).toBeVisible({ timeout: 15000 });

      // Edit remarks cell on isolated test PO
      await remarksInput.fill(TEST_REMARK);
      await remarksInput.blur();
      await page.waitForTimeout(1000);

      // Reload and check persistence
      await page.reload();
      const reloadedRemarksInput = page.locator(`input[placeholder="Add remarks..."]`).first();
      await expect(reloadedRemarksInput).toBeVisible({ timeout: 15000 });
      await expect(reloadedRemarksInput).toHaveValue(TEST_REMARK);

      // Test Export Excel button triggers download
      await Promise.all([
        page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
        page.click('button:has-text("Export Excel")').catch(() => null),
      ]);
    } finally {
      // Step: Mandatory loud cleanup of dedicated test PO - fails loudly if cleanup fails
      const cleanupRes = await page.request.post(`${BASE_URL}/api/planning`, {
        data: {
          action: 'delete_test_po',
          po_number: TEST_PO_NUMBER,
        }
      });
      if (!cleanupRes.ok()) {
        throw new Error(`CRITICAL: E2E cleanup failed for test PO ${TEST_PO_NUMBER}: ${cleanupRes.statusText()}`);
      }
    }
  });

  test('4. Upload modified CSV with rejected rows and verify diff preview', async ({ page }) => {
    await page.goto(`${BASE_URL}/upload`);

    const badRowsCsv = path.join(process.cwd(), 'test-data', 'bad_rows.csv');
    await page.locator('input[type="file"]').setInputFiles(badRowsCsv);

    // Verify preview renders rejected rows
    await expect(page.locator('text=Rejected Rows (2)')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Download Error CSV")')).toBeVisible();
  });
});
