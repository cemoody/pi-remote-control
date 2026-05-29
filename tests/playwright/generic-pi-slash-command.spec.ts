import { expect, test } from '@playwright/test';

test('dynamic Pi slash command autocompletes and runs through generic endpoint, not prompt', async ({ page }) => {
  const piCommandCalls: string[] = [];
  let promptCalls = 0;

  await page.route('**/api/sessions/seeded-session-0001/commands', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ commands: [{ name: 'litellm-refresh', source: 'extension', description: 'Re-discover LiteLLM models' }] }),
    });
  });
  await page.route('**/api/sessions/seeded-session-0001/pi-command', async (route) => {
    const body = await route.request().postDataJSON() as { text?: string };
    piCommandCalls.push(body.text ?? '');
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route('**/api/sessions/seeded-session-0001/prompt', async (route) => {
    promptCalls += 1;
    await route.fallback();
  });

  await page.goto('/');
  await page.getByRole('link', { name: /^Seeded session\b/ }).click();

  await page.getByLabel('Prompt draft').fill('/lite');
  await expect(page.getByRole('button', { name: 'litellm-refresh' })).toBeVisible();
  await page.getByRole('button', { name: 'litellm-refresh' }).click();
  await expect(page.getByLabel('Prompt draft')).toHaveValue('/litellm-refresh');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect.poll(() => piCommandCalls).toEqual(['/litellm-refresh']);
  expect(promptCalls).toBe(0);
  await expect(page.getByText(/Mock response to: \/litellm-refresh/)).toHaveCount(0);
});

test('web-native /model wins over dynamic Pi command collision', async ({ page }) => {
  let piCommandCalls = 0;
  await page.route('**/api/sessions/seeded-session-0001/commands', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ commands: [{ name: 'model', source: 'extension' }] }),
    });
  });
  await page.route('**/api/sessions/seeded-session-0001/pi-command', async (route) => {
    piCommandCalls += 1;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.goto('/');
  await page.getByRole('link', { name: /^Seeded session\b/ }).click();
  await page.getByLabel('Prompt draft').fill('/model');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByRole('dialog', { name: 'Choose a model' })).toBeVisible();
  expect(piCommandCalls).toBe(0);
});
