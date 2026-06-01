import { afterEach, describe, expect, it, vi } from "vitest";

async function loadApi() {
  const mod = await import("../../src/web/api/http-session-api.js");
  return new mod.HttpSessionDashboardApi();
}

function mockFetchOnce(body: unknown, status = 200) {
  const calls: { url: string; init?: RequestInit | undefined }[] = [];
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

describe("HttpSessionDashboardApi — extension updates", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("GETs /api/extensions/updates and returns the parsed body", async () => {
    const calls = mockFetchOnce({ updates: [{ source: "npm:x", kind: "npm", state: "update-available", pinned: false, installed: "1.0.0", latest: "2.0.0" }] });
    const api = await loadApi();
    const result = await api.checkExtensionUpdates!();
    expect(calls[0]!.url).toContain("/api/extensions/updates");
    expect(result.updates[0]).toMatchObject({ source: "npm:x", state: "update-available" });
  });

  it("passes force=1 when requested", async () => {
    const calls = mockFetchOnce({ updates: [] });
    const api = await loadApi();
    await api.checkExtensionUpdates!(true);
    expect(calls[0]!.url).toContain("force=1");
  });

  it("POSTs the source to /api/extensions/packages/update", async () => {
    const calls = mockFetchOnce({ source: "npm:x", kind: "npm", updated: true, applied: true });
    const api = await loadApi();
    const result = await api.updateExtensionPackage!("npm:x");
    expect(calls[0]!.url).toContain("/api/extensions/packages/update");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ source: "npm:x" });
    expect(result).toMatchObject({ updated: true, applied: true });
  });

  it("throws on a non-2xx response", async () => {
    mockFetchOnce({ error: "source is required" }, 400);
    const api = await loadApi();
    await expect(api.updateExtensionPackage!("")).rejects.toBeTruthy();
  });
});
