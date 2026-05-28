import { chromium } from "@playwright/test";

const url = "http://coder-chris-v03-1.tail38f572.ts.net:5173/?session=019e5104-c0fc-700e-906d-a3ade876defd";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 2400 }, ignoreHTTPSErrors: true });
const page = await context.newPage();
page.on("pageerror", (err) => console.error("[pageerror]", err.message));
page.on("console", (msg) => { if (msg.type() === "error") console.error("[console]", msg.text()); });

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
// Give the timeline a beat to populate
await page.waitForTimeout(6_000);

// Quick semantic probe: count tool cards vs. "Extension"-labelled custom messages
const probe = await page.evaluate(() => {
  const toolCards = document.querySelectorAll('details.tool-card').length;
  const extensionTitles = Array.from(document.querySelectorAll('article')).filter((node) =>
    node.querySelector('strong')?.textContent === 'Extension'
  ).length;
  const customMessages = document.querySelectorAll('article[aria-label="custom message"]').length;
  const userMessages = document.querySelectorAll('article[aria-label="user message"]').length;
  const assistantMessages = document.querySelectorAll('article[aria-label="assistant message"]').length;
  const visibleParagraphs = Array.from(document.querySelectorAll('.markdown-lite p'));
  const rawJsonLooking = visibleParagraphs.filter((p) => /\{\s*"type"\s*:/.test(p.textContent ?? "")).length;
  return { toolCards, extensionTitles, customMessages, userMessages, assistantMessages, rawJsonLooking };
});
console.log("Probe:", JSON.stringify(probe, null, 2));

await page.screenshot({ path: "/tmp/session-019e5104-fullpage.png", fullPage: true });
console.log("Full-page screenshot: /tmp/session-019e5104-fullpage.png");

// Also a viewport-only snap of the bottom of the timeline (most-recent turns)
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/session-019e5104-bottom.png", fullPage: false });
console.log("Bottom-of-timeline screenshot: /tmp/session-019e5104-bottom.png");

await browser.close();
