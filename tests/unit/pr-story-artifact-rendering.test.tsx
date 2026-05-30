// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageTimeline } from "../../src/web/components/MessageTimeline.js";
import { prStoryFixture, prStoryToolMessage } from "../fixtures/pr-story-artifact.js";

describe("PR Story artifact rendering", () => {
  it("renders show_pr_story tool artifacts as a PR Story card, not raw JSON", () => {
    render(<MessageTimeline messages={[prStoryToolMessage]} />);

    expect(screen.getByTestId("artifact-pr-story")).toBeInTheDocument();
    expect(screen.getByTestId("artifact-pr-story")).toHaveTextContent("Worker pool review tour");
    expect(screen.getByTestId("artifact-pr-story")).toHaveTextContent("octo/svc#7");
    expect(screen.getByRole("button", { name: "Open story" })).toBeInTheDocument();
    expect(screen.queryByTestId("artifact-fallback")).not.toBeInTheDocument();
    expect(screen.getByTestId("artifact-pr-story")).not.toHaveTextContent("schemaVersion");
  });

  it("opens the PR Story reader and navigates frames", () => {
    render(<MessageTimeline messages={[prStoryToolMessage]} />);

    fireEvent.click(screen.getByRole("button", { name: "Open story" }));
    expect(screen.getByRole("dialog", { name: /Worker pool review tour PR Story/ })).toBeInTheDocument();
    expect(screen.getAllByText(/The entrypoint imports/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("src/dispatch.ts diff")).toHaveTextContent("WorkerPool");

    fireEvent.click(screen.getAllByRole("button", { name: "Next frame" })[0]!);
    expect(screen.getByRole("heading", { name: /inner loop delegates/i })).toBeInTheDocument();
    expect(screen.getByLabelText("src/dispatch.ts diff")).toHaveTextContent("pool.assign");
  });

  it("keeps draft comments local to the widget when no submit callback is provided", () => {
    render(<MessageTimeline messages={[prStoryToolMessage]} />);

    fireEvent.click(screen.getByRole("button", { name: "Open story" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Comment" })[0]!);
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), { target: { value: "Check shutdown handling." } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(screen.getByText("Check shutdown handling.")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Submit 1 comment to session" });
    expect(() => fireEvent.click(submit)).not.toThrow();
  });

  it("renders invalid PR Story data as an inline alert instead of crashing the timeline", () => {
    const invalid = {
      ...prStoryToolMessage,
      id: "tool-invalid-pr-story",
      tool: {
        ...prStoryToolMessage.tool,
        artifact: { version: 1, kind: "pr-story", title: "Invalid", data: { ...prStoryFixture, frames: [] } },
      },
    };

    expect(() => render(<MessageTimeline messages={[invalid]} />)).not.toThrow();
    expect(screen.getByTestId("artifact-pr-story")).toHaveAttribute("role", "alert");
    expect(screen.getByText("Invalid PR Story")).toBeInTheDocument();
  });

  it("lazy-loads a truncated PR Story tool artifact and renders it inline", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      kind: "pr-story",
      title: prStoryFixture.title,
      data: prStoryFixture,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<MessageTimeline messages={[{
      ...prStoryToolMessage,
      id: "tool-lazy-pr-story",
      tool: {
        ...prStoryToolMessage.tool,
        artifact: {
          version: 1,
          kind: "pr-story",
          title: prStoryFixture.title,
          artifactTruncated: true,
          artifactFullBytes: 2_000_000,
          artifactUrl: "/api/sessions/s1/messages/tool-lazy-pr-story/artifact",
          data: { omitted: true },
        },
      },
    }]} />);

    expect(screen.getByText(/Loading artifact/)).toBeInTheDocument();
    expect(await screen.findByTestId("artifact-pr-story")).toHaveTextContent("Worker pool review tour");
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/s1/messages/tool-lazy-pr-story/artifact");

    vi.unstubAllGlobals();
  });
});
