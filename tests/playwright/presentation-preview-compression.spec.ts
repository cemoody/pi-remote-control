import { expect, test } from "@playwright/test";

// Repro for: the inline slide preview "widget" looks compressed because
// the artifact card viewport is small in normal session view, but the
// same deck fits well when opened fullscreen (Present modal).

const VIEWPORTS = [
  { name: "narrow-360", w: 360, h: 740 }, // mobile-ish, card is very narrow
  { name: "mid-768", w: 768, h: 900 },    // tablet, card still constrained
  { name: "wide-1440", w: 1440, h: 900 }, // desktop, card has more room
];

for (const vp of VIEWPORTS) {
  test(`preview compression @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto("/");
    await page.getByRole("button", { name: /^Presentation artifact session\b/ }).click();

    const card = page.locator('[data-testid="artifact-presentation"]');
    await expect(card).toBeVisible();
    await expect(page.locator('[data-testid="artifact-presentation-preview"]')).toBeVisible();
    // Let the iframe settle.
    await page.waitForTimeout(400);

    await card.screenshot({ path: `test-results/preview-card-${vp.name}.png` });
    await page.screenshot({ path: `test-results/preview-page-${vp.name}.png`, fullPage: false });

    // Now open the fullscreen Present modal — same deck, full viewport.
    await page.getByRole("button", { name: "Present deck" }).click();
    const modal = page.locator('[data-testid="artifact-presentation-modal"]');
    await expect(modal).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/preview-fullscreen-${vp.name}.png`, fullPage: false });
    await page.getByRole("button", { name: "Close presentation" }).click();
  });
}
