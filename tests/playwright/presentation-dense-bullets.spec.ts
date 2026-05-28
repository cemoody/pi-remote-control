import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "narrow-360", w: 360, h: 740 },
  { name: "mid-768", w: 768, h: 900 },
  { name: "wide-1440", w: 1440, h: 900 },
];

for (const vp of VIEWPORTS) {
  test(`dense bullets inline vs fullscreen @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto("/");
    await page.getByRole("button", { name: /^Dense bullets deck\b/ }).click();

    const card = page.locator('[data-testid="artifact-presentation"]');
    await expect(card).toBeVisible();
    await expect(page.locator('[data-testid="artifact-presentation-preview"]')).toBeVisible();
    await page.waitForTimeout(500);

    // Inline preview as it appears in the chat column.
    await page.screenshot({ path: `test-results/dense-inline-${vp.name}.png`, fullPage: false });
    await card.screenshot({ path: `test-results/dense-card-${vp.name}.png` });

    // Fullscreen Present modal.
    await page.getByRole("button", { name: "Present deck" }).click();
    await expect(page.locator('[data-testid="artifact-presentation-modal"]')).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test-results/dense-fullscreen-${vp.name}.png`, fullPage: false });
    await page.getByRole("button", { name: "Close presentation" }).click();
  });
}
