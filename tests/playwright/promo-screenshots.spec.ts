import { test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Captures README hero / promo screenshots showing off:
 *   - a mobile session list (mobile-first sidebar)
 *   - an active conversation with markdown rendering
 *   - the show_artifact tool rendering a Vega-Lite chart inline
 *   - the show_artifact tool rendering a self-contained HTML dashboard
 *   - a cron-spawned session
 *   - the cron jobs admin page
 *   - the same conversation on desktop, for breadth
 *
 * Output: promo-screenshots/<viewport>/<state>.png
 */

const MOBILE = { name: "iphone-14", width: 390, height: 844 };
const TABLET = { name: "ipad-mini", width: 768, height: 1024 };
const DESKTOP = { name: "desktop", width: 1280, height: 820 };

const OUT_ROOT = path.resolve("promo-screenshots");

async function shot(page: Page, vpName: string, name: string) {
  const dir = path.join(OUT_ROOT, vpName);
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false });
}

async function selectSession(page: Page, name: RegExp) {
  await page.getByRole("button", { name }).first().click();
  // Mobile drawer slide-out + first-render of artifacts (vega-lite is lazy).
  await page.waitForTimeout(500);
}

test.beforeAll(async () => {
  for (const vp of [MOBILE, TABLET, DESKTOP]) {
    await fs.rm(path.join(OUT_ROOT, vp.name), { recursive: true, force: true });
  }
});

for (const vp of [MOBILE, TABLET]) {
  test.describe(`promo @ ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });

    test("01 session list", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: /Drafting the postmortem/ }).first().waitFor();
      await shot(page, vp.name, "01-session-list");
    });

    test("02 conversation timeline", async ({ page }) => {
      await page.goto("/");
      await selectSession(page, /Drafting the postmortem/);
      await shot(page, vp.name, "02-conversation");
    });

    test("03 vega-lite artifact", async ({ page }) => {
      await page.goto("/");
      await selectSession(page, /Latency investigation/);
      // Wait for the chart to actually paint.
      await page.locator('[data-testid="artifact-vega-lite"]').first().waitFor({ state: "attached" });
      await page.waitForTimeout(900);
      await shot(page, vp.name, "03-vega-lite-artifact");
    });

    test("04 html dashboard artifact", async ({ page }) => {
      await page.goto("/");
      await selectSession(page, /Cluster sweep/);
      await page.locator('[data-testid="artifact-html"]').first().waitFor();
      await page.waitForTimeout(600);
      await shot(page, vp.name, "04-html-artifact");
    });

    test("05 cron-spawned session", async ({ page }) => {
      await page.goto("/");
      await selectSession(page, /cron: dependabot/);
      await shot(page, vp.name, "05-cron-session");
    });

    test("06 cron jobs admin", async ({ page }) => {
      await page.goto("/");
      const cron = page.getByRole("button", { name: "Cron" });
      if (await cron.isVisible().catch(() => false)) {
        await cron.click();
        await page.waitForTimeout(400);
        await shot(page, vp.name, "06-cron-admin");
      }
    });
  });
}

test.describe(`promo @ ${DESKTOP.name} (${DESKTOP.width}x${DESKTOP.height})`, () => {
  test.use({
    viewport: { width: DESKTOP.width, height: DESKTOP.height },
    deviceScaleFactor: 2,
  });

  test("01 desktop overview with vega-lite", async ({ page }) => {
    await page.goto("/");
    await selectSession(page, /Latency investigation/);
    await page.locator('[data-testid="artifact-vega-lite"]').first().waitFor({ state: "attached" });
    await page.waitForTimeout(900);
    await shot(page, DESKTOP.name, "01-overview-vega-lite");
  });

  test("02 desktop overview with html dashboard", async ({ page }) => {
    await page.goto("/");
    await selectSession(page, /Cluster sweep/);
    await page.locator('[data-testid="artifact-html"]').first().waitFor();
    await page.waitForTimeout(600);
    await shot(page, DESKTOP.name, "02-overview-html");
  });

  test("03 desktop cron admin", async ({ page }) => {
    await page.goto("/");
    const cron = page.getByRole("button", { name: "Cron" });
    if (await cron.isVisible().catch(() => false)) {
      await cron.click();
      await page.waitForTimeout(400);
      await shot(page, DESKTOP.name, "03-cron-admin");
    }
  });
});
