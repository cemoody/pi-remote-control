// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExternalWebActivity } from "../../src/web/extensions/external-web-module.js";
import type { ExtensionActivityInfo, ExtensionRegistryInfo, SessionDashboardApi } from "../../src/web/api/session-api.js";

describe("ExternalWebActivity", () => {
  it("dynamically imports and renders an external web activity module", async () => {
    const source = "export function renderActivity(props) { return `External ${props.activity.title}`; }";
    const activity: ExtensionActivityInfo = {
      id: "external.panel",
      title: "Panel",
      extensionId: "external",
      webModuleUrl: `data:text/javascript,${encodeURIComponent(source)}`,
    };
    const extensions: ExtensionRegistryInfo = { commands: [], activities: [activity], routes: [], diagnostics: [] };

    render(<ExternalWebActivity activity={activity} extensions={extensions} api={{} as SessionDashboardApi} />);

    expect(await screen.findByText("External Panel")).toBeInTheDocument();
  });

  it("shows an error when a web module has no renderer export", async () => {
    const activity: ExtensionActivityInfo = {
      id: "bad.panel",
      title: "Bad",
      extensionId: "bad",
      webModuleUrl: "data:text/javascript,export%20const%20x%20%3D%201%3B",
    };
    const extensions: ExtensionRegistryInfo = { commands: [], activities: [activity], routes: [], diagnostics: [] };

    render(<ExternalWebActivity activity={activity} extensions={extensions} api={{} as SessionDashboardApi} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("does not export a renderer");
  });
});
