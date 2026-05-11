// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LifecyclePanel } from "../../src/web/components/LifecyclePanel.js";

function renderPanel(overrides = {}) {
  const handlers = { onCompact: vi.fn(), onAbortRetry: vi.fn(), onSetAutoRetry: vi.fn(), onCopyLastAssistant: vi.fn(), onExportHtml: vi.fn(), onExportJsonl: vi.fn() };
  render(<LifecyclePanel
    details={{ sessionFile: "/s.jsonl", sessionId: "abc", sessionName: "work", userMessages: 2, assistantMessages: 3, toolCalls: 4, toolResults: 4, tokens: "100", cost: "$0.10", contextPercent: 50 }}
    compaction={{ active: false, summary: "old work summarized" }}
    retry={{ active: true, attempt: 1, maxAttempts: 3, delayMs: 2000 }}
    {...handlers}
    {...overrides}
  />);
  return handlers;
}

describe("LifecyclePanel", () => {
  it("renders full session details and context usage", () => {
    renderPanel();
    expect(screen.getByText("/s.jsonl")).toBeInTheDocument();
    expect(screen.getByText("abc")).toBeInTheDocument();
    expect(screen.getByText("2 user / 3 assistant")).toBeInTheDocument();
    expect(screen.getByText("4 calls / 4 results")).toBeInTheDocument();
    expect(screen.getByText("$0.10")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "50");
  });

  it("sends manual and custom compaction", () => {
    const handlers = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Compact" }));
    fireEvent.click(screen.getByRole("button", { name: "Compact with instructions" }));
    expect(handlers.onCompact).toHaveBeenCalledWith();
    expect(handlers.onCompact).toHaveBeenCalledWith("focus on code changes");
  });

  it("renders compaction failure", () => {
    renderPanel({ compaction: { active: false, error: "quota exceeded" } });
    expect(screen.getByRole("alert")).toHaveTextContent("quota exceeded");
  });

  it("renders retry state and controls retry", () => {
    const handlers = renderPanel();
    expect(screen.getByText("Retry 1/3 in 2000ms")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abort retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Enable auto-retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Disable auto-retry" }));
    expect(handlers.onAbortRetry).toHaveBeenCalled();
    expect(handlers.onSetAutoRetry).toHaveBeenCalledWith(true);
    expect(handlers.onSetAutoRetry).toHaveBeenCalledWith(false);
  });

  it("handles copy and export actions", () => {
    const handlers = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Copy last assistant" }));
    fireEvent.click(screen.getByRole("button", { name: "Export HTML" }));
    fireEvent.click(screen.getByRole("button", { name: "Export JSONL" }));
    expect(handlers.onCopyLastAssistant).toHaveBeenCalled();
    expect(handlers.onExportHtml).toHaveBeenCalled();
    expect(handlers.onExportJsonl).toHaveBeenCalled();
  });
});
