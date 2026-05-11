import { expect, test } from '@playwright/test';

test('can select a listed cold session and send hello without unknown-session error', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: /Seeded session/ })).toBeVisible();
  await page.getByRole('button', { name: /Seeded session/ }).click();

  await page.getByLabel('Prompt draft').fill('hello');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('Mock response to: hello')).toBeVisible();
  await expect(page.getByText(/Unknown session/)).toHaveCount(0);
});

test('shows existing session history and renders markdown when a session is selected', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Seeded session/ }).click();

  await expect(page.getByText('previously sent hello')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plan' })).toBeVisible();
  await expect(page.locator('.markdown-lite strong', { hasText: 'bold step' })).toBeVisible();
  await expect(page.locator('.markdown-lite em', { hasText: 'italic' })).toBeVisible();
  await expect(page.locator('.markdown-lite code', { hasText: 'inline code' })).toBeVisible();
  await expect(page.locator('.markdown-lite ul li').first()).toBeVisible();
  await expect(page.locator('.code-block')).toContainText('const answer = 42;');
});

test('default copy puts only the last assistant text on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: /Seeded session/ }).click();

  const footer = page.getByLabel('Turn actions').first();
  await expect(footer).toBeVisible();
  await footer.getByRole('button', { name: 'Copy assistant response' }).click();
  await expect(footer.getByText('copied', { exact: true })).toBeVisible();

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).not.toMatch(/^\*\*You:/);
  expect(clipboard).not.toContain('previously sent hello');
  expect(clipboard).toContain('## Plan');
});

test('overflow menu can copy the entire turn as markdown', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: /Seeded session/ }).click();

  const footer = page.getByLabel('Turn actions').first();
  await footer.getByRole('button', { name: 'More copy options' }).click();
  await footer.getByRole('menuitem', { name: /Copy entire turn as markdown/ }).click();
  await expect(footer.getByText('copied turn')).toBeVisible();

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('**You:**');
  expect(clipboard).toContain('previously sent hello');
  expect(clipboard).toContain('**Assistant:**');
  expect(clipboard).toContain('## Plan');
});

test('preserves the active session in the URL across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Seeded session/ }).click();
  await expect(page).toHaveURL(/[?&]session=seeded-session-0001/);

  await page.reload();
  await expect(page.getByText('previously sent hello')).toBeVisible();
  await expect(page).toHaveURL(/[?&]session=seeded-session-0001/);
});

test('opens model picker for /model slash command instead of sending it as a prompt', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Seeded session/ }).click();

  await page.getByLabel('Prompt draft').fill('/model');
  await page.getByRole('button', { name: 'Send' }).click();

  const dialog = page.getByRole('dialog', { name: 'Choose a model' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Mock Echo')).toBeVisible();
  await expect(page.getByText(/Mock response to: \/model/)).toHaveCount(0);

  const echoItem = dialog.getByRole('button', { name: /Mock Echo/ });
  await expect(echoItem.locator('strong')).toHaveText('Mock Echo');
  await expect(echoItem.locator('span')).toHaveText('mock/mock-echo');

  const dimensions = await echoItem.evaluate((node) => ({
    height: (node as HTMLElement).getBoundingClientRect().height,
    display: window.getComputedStyle(node).display,
  }));
  expect(dimensions.height).toBeGreaterThan(40);
  expect(dimensions.display).toBe('grid');

  await echoItem.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('mock/mock-echo')).toBeVisible();
});

test('streams the user and assistant messages over SSE during a turn', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Seeded session/ }).click();
  await page.getByLabel('Prompt draft').fill('streaming hello');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('streaming hello').first()).toBeVisible();
  await expect(page.getByText('Mock response to: streaming hello')).toBeVisible();
});

test('pasting an image attaches it as an attachment instead of inserting raw text', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Seeded session/ }).click();
  const draft = page.getByLabel('Prompt draft');
  await draft.focus();

  // 1x1 transparent PNG
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  await page.evaluate(async (b64) => {
    const draftEl = document.querySelector('textarea[aria-label="Prompt draft"]') as HTMLTextAreaElement;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const file = new File([bytes], 'pasted.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    draftEl.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, pngBase64);

  await expect(draft).toHaveValue('');
  await expect(page.getByText('pasted.png')).toBeVisible();
});

test('giant text paste is rejected with a friendly warning', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Seeded session/ }).click();
  const draft = page.getByLabel('Prompt draft');
  await draft.focus();

  const fake = 'iVBORw0KGgo' + 'A'.repeat(3000);
  await page.evaluate((payload) => {
    const draftEl = document.querySelector('textarea[aria-label="Prompt draft"]') as HTMLTextAreaElement;
    const dt = new DataTransfer();
    dt.setData('text/plain', payload);
    draftEl.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, fake);

  await expect(draft).toHaveValue('');
  await expect(page.getByText(/Clipboard looks like raw image data/i)).toBeVisible();
});

test('shows status row beneath composer with cwd, model, and TUI-style stats', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Seeded session/ }).click();

  const status = page.getByLabel('Session status');
  await expect(status).toBeVisible();
  await expect(status).toContainText('idle');
  await expect(status).toContainText('pi-remote-control');
  await expect(status).toContainText('no model selected');
  await expect(status).toContainText('↑0');
  await expect(status).toContainText('↓0');
  await expect(status).toContainText('$0.0000');
  await expect(status).toContainText('200k');
});

test('sidebar collapses without shrinking the main area', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.getByRole('complementary', { name: 'Sessions' });
  const main = page.getByRole('region', { name: 'Active session' });
  await expect(sidebar).toBeVisible();

  const openWidth = await main.evaluate((node) => (node as HTMLElement).getBoundingClientRect().width);

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(sidebar).toBeHidden();

  const collapsedWidth = await main.evaluate((node) => (node as HTMLElement).getBoundingClientRect().width);
  expect(collapsedWidth).toBeGreaterThan(openWidth);

  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(sidebar).toBeVisible();
});

test('shortcut modal opens with ? outside an input, ignored inside textarea', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Seeded session/ }).click();

  await page.locator('body').press('Shift+?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden();

  await page.getByLabel('Prompt draft').focus();
  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden();
  await expect(page.getByLabel('Prompt draft')).toHaveValue('?');
});

test('can create a new session and send hello', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'New session' }).click();
  await expect(page.getByRole('dialog', { name: 'Create new session' })).toBeVisible();
  await page.getByLabel('New session cwd').fill(process.cwd());
  await page.getByLabel('New session name').fill('Playwright new session');
  await page.getByRole('button', { name: 'Create session' }).click();

  await expect(page.getByRole('heading', { name: 'Playwright new session' })).toBeVisible();
  await page.getByLabel('Prompt draft').fill('hello');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('Mock response to: hello')).toBeVisible();
  await expect(page.getByText(/Unknown session/)).toHaveCount(0);
});
