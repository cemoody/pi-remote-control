import { describe, expect, it } from "vitest";
import { imageFaviconDataUrl } from "../../src/web/components/SessionDashboard.js";

describe("imageFaviconDataUrl", () => {
  it("uses explicit contained dimensions for wide images so tab favicons do not stretch", () => {
    const favicon = decodeURIComponent(imageFaviconDataUrl("https://example.com/qxo.png", { width: 150, height: 61 }));

    expect(favicon).toContain('viewBox="0 0 64 64"');
    expect(favicon).toContain('href="https://example.com/qxo.png"');
    expect(favicon).toContain('width="56"');
    expect(favicon).toContain('height="22.77"');
    expect(favicon).toContain('x="4"');
    expect(favicon).toContain('y="20.61"');
    expect(favicon).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it("uses explicit contained dimensions for tall images", () => {
    const favicon = decodeURIComponent(imageFaviconDataUrl("https://example.com/tall.png", { width: 32, height: 64 }));

    expect(favicon).toContain('width="28"');
    expect(favicon).toContain('height="56"');
    expect(favicon).toContain('x="18"');
    expect(favicon).toContain('y="4"');
  });
});
