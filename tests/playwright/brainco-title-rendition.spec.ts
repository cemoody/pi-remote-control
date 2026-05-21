import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { compileRevealHtml } from "../../src/presentations/reveal.js";
import type { PresentationDeck } from "../../src/presentations/schema.js";

const assetRoot = path.resolve(process.cwd(), "extensions/presentations/templates/builtin/assets");

const pageOneDeck: PresentationDeck = {
  title: "Primary Title",
  subtitle: "Secondary Title",
  theme: "brainco",
  client: "Client",
  confidential: "Confidential and Proprietary",
  logo: { src: "brainco-wordmark.png", alt: "Brain Co" },
  slides: [{
    template: "title",
    title: "Primary Title\nSecondary Title",
    body: "This executive summary briefly outlines objectives, strategies, outcomes, considerations, assumptions, timelines, stakeholders, metrics, risks, opportunities, constraints, dependencies, and next steps.",
  }],
};

test("captures BrainCo PDF page 1 title template rendition", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const html = compileRevealHtml(pageOneDeck, {
    assetResolver(src) {
      if (src !== "brainco-wordmark.png") return undefined;
      return { mimeType: "image/png", data: fs.readFileSync(path.join(assetRoot, src)) };
    },
  });

  await page.setContent(html);
  await expect(page.locator(".brand-logo")).toBeVisible();
  await expect(page.locator(".brand-rule-footer")).toBeVisible();
  await page.screenshot({ path: "test-results/brainco-title-rendition.png" });
});
