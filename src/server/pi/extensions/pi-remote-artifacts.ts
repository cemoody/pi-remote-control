import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

const ARTIFACT_DETAIL_KEY = "piRemoteControlArtifact";
const ARTIFACT_SCHEMA_VERSION = 1;

export default function piRemoteArtifacts(pi: ExtensionAPI) {
  pi.registerTool({
    name: "show_artifact",
    label: "Show Artifact",
    description: "Display a rich artifact in the Pi Remote Control web UI. Use this for plots, generated images, HTML reports, markdown reports, JSON data, tables, and Vega-Lite charts that should be rendered for the user.",
    promptSnippet: "show_artifact displays images, HTML, markdown, JSON, tables, and Vega-Lite charts in the Pi Remote Control web UI.",
    promptGuidelines: [
      "Use show_artifact when you create an image, plot, table, report, or other visual result that the user should see in Pi Remote Control.",
      "For plots, prefer writing an image file or returning a Vega-Lite spec via show_artifact instead of pasting a long textual description.",
      "For HTML artifacts, keep the HTML self-contained; Pi Remote Control will render it in a browser sandbox.",
    ],
    parameters: Type.Object({
      kind: StringEnum(["image", "html", "markdown", "json", "table", "vega-lite"] as const),
      title: Type.Optional(Type.String({ description: "Short display title for the artifact." })),
      path: Type.Optional(Type.String({ description: "Path to a generated artifact file, relative to cwd or absolute. Use for image/html files." })),
      mimeType: Type.Optional(Type.String({ description: "MIME type for path-backed artifacts, e.g. image/png or text/html." })),
      html: Type.Optional(Type.String({ description: "Self-contained HTML to render in a sandboxed iframe." })),
      markdown: Type.Optional(Type.String({ description: "Markdown content to render." })),
      data: Type.Optional(Type.Any({ description: "Structured artifact data, e.g. JSON, table rows, or Vega-Lite spec." })),
      alt: Type.Optional(Type.String({ description: "Alt text for image artifacts." })),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: `Displayed ${params.kind} artifact${params.title ? `: ${params.title}` : ""}.` }],
        details: {
          [ARTIFACT_DETAIL_KEY]: {
            version: ARTIFACT_SCHEMA_VERSION,
            kind: params.kind,
            ...(params.title === undefined ? {} : { title: params.title }),
            ...(params.path === undefined ? {} : { path: params.path }),
            ...(params.mimeType === undefined ? {} : { mimeType: params.mimeType }),
            ...(params.html === undefined ? {} : { html: params.html }),
            ...(params.markdown === undefined ? {} : { markdown: params.markdown }),
            ...(params.data === undefined ? {} : { data: params.data }),
            ...(params.alt === undefined ? {} : { alt: params.alt }),
          },
        },
      };
    },
  });
}
