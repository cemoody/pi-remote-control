import { expect, test } from '@playwright/test';

/**
 * Repro: opening a session with >200 messages only renders the tail.
 *
 * The current SessionDashboard mount fetches the most recent
 * INITIAL_MESSAGES_LIMIT (=200) messages from /api/sessions/:id/messages and
 * never re-fetches with a `before:` cursor when the user scrolls up. The
 * `before` parameter exists on the HTTP API and the session-api client, but
 * no UI code path ever calls it. Scrolling the timeline to the top therefore
 * exposes the oldest *fetched* message, not the oldest message in the file.
 *
 * The seeded fixture has 1000 messages. The first message has sentinel
 * "FIRST-MESSAGE-MARKER-α", the last has "LAST-MESSAGE-MARKER-ω".
 *
 * Expected (correct) behavior: scrolling the timeline to the very top should
 * eventually reveal FIRST-MESSAGE-MARKER-α.
 * Actual (buggy) behavior: only the last ~200 messages are ever in the DOM,
 * the marker never appears, and scrolling up bottoms out well past it.
 */
test('long session: cannot scroll up to the first message (pagination bug)', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('link', { name: /^Long session\b/ }).click();

  // Tail rendered fine.
  await expect(page.getByText(/LAST-MESSAGE-MARKER-ω/)).toBeVisible();

  const timeline = page.locator('.message-timeline');
  await expect(timeline).toBeVisible();

  // Try really hard to scroll to the top and let any "load older" fetches
  // run. We do this in a loop so a hypothetical on-scroll pagination
  // implementation would have many chances to fire.
  let lastCount = -1;
  for (let attempt = 0; attempt < 12; attempt++) {
    await timeline.evaluate((el) => { el.scrollTop = 0; });
    await page.waitForTimeout(250);
    const count = await page.locator('.message-timeline [data-role], .message-timeline .timeline-message, .message-timeline li, .message-timeline article').count();
    if (count === lastCount) break;
    lastCount = count;
  }

  // How many message rows did we actually get in the DOM? We expect this to
  // be capped near the 200-message initial fetch, far short of the 1000
  // seeded messages.
  const renderedRowCount = await page.locator('.message-timeline-inner > *').count();
  console.log(`rendered timeline children: ${renderedRowCount}`);

  // --- The headline assertion that documents the bug -----------------------
  // If pagination worked, the first seeded message would be reachable from
  // a full scroll-up. It is not, so this assertion currently FAILS, which is
  // the point of the repro.
  await expect(
    page.getByText(/FIRST-MESSAGE-MARKER-α/),
    'scrolling to the top should reveal the first message, but pagination is not implemented'
  ).toBeVisible({ timeout: 5_000 });
});

/**
 * Companion assertion (passes today): the DOM only contains a small window
 * of the transcript. This makes the cap visible in CI output even if the
 * primary assertion above is later "fixed" by removing the sentinel.
 */
test('long session: timeline DOM is capped to roughly the initial-fetch limit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /^Long session\b/ }).click();

  await expect(page.getByText(/LAST-MESSAGE-MARKER-ω/)).toBeVisible();

  // Scroll up so any lazy-render windowing would expand if it existed.
  const timeline = page.locator('.message-timeline');
  for (let i = 0; i < 6; i++) {
    await timeline.evaluate((el) => { el.scrollTop = 0; });
    await page.waitForTimeout(150);
  }

  const renderedRowCount = await page.locator('.message-timeline-inner > *').count();
  // Seeded transcript has 1000 messages. We expect way fewer than that to
  // be in the DOM, demonstrating the truncation.
  expect(renderedRowCount).toBeLessThan(700);
});
