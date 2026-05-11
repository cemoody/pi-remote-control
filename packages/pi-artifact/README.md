# @cemoody/pi-artifact

> Pi extension that turns the LLM into a scientific-notebook author.

`@cemoody/pi-artifact` registers a single `display` tool that the LLM calls
to render **inline images, sandboxed HTML/D3 snippets, and declarative
Vega-Lite / Plotly charts** in a compatible viewer. Artifacts appear as
first-class messages in the timeline — not buried inside tool cards — and
the LLM only ever sees a one-line text result, so rendered bytes don't
bloat the context window.

The wire format is small, MIME-typed, versioned, and always includes a
`text/plain` fallback so non-graphical viewers (RPC, print mode, low
bandwidth) degrade gracefully.

## What the LLM can do

```python
# Inline image — save to disk first, then display
plt.savefig("plots/revenue.png")
display(path="plots/revenue.png", caption="Q4 revenue")

# Arbitrary HTML / D3 — runs in a sandboxed iframe (null origin, no allow-same-origin)
display(html="<svg>…D3 code…</svg>", height=400)

# Declarative chart — preferred path; no iframe, re-themable, smaller payload
display(vegaLite={"mark": "bar", "data": {...}, "encoding": {...}})
display(plotly={"data": [...], "layout": {...}})
```

The tool returns a single short line to the LLM (`"Displayed image/png (12.3 KB)."`)
so subsequent turns don't pay context cost for the artifact bytes.

## Install

Project-local (recommended while you evaluate):

```bash
pi install -l npm:@cemoody/pi-artifact
```

Global:

```bash
pi install npm:@cemoody/pi-artifact
```

Or from git:

```bash
pi install git:github.com/cemoody/pi-artifact
```

After install, `pi list` should show the package and the `display` tool
becomes available to the LLM. `/reload` picks up changes without restart.

## What the viewer must do

The extension writes bytes to:

```
<projectRoot>/.pi/artifacts/<sessionId>/<sha256[:16]>.<ext>
```

and emits a [pi custom message](https://github.com/earendil-works/pi-mono)
with `customType: "artifact"` whose `details` payload follows the schema in
[`src/artifact-types.ts`](./src/artifact-types.ts).

A viewer (e.g. `pi-remote-control`) needs to:

1. Recognize `role === "custom" && customType === "artifact"` messages and
   render them as first-class timeline entries.
2. Serve the artifact bytes via an HTTP route under
   `<projectRoot>/.pi/artifacts/<sid>/` with strict path containment.
3. Render representations in MIME priority order, falling back to
   `text/plain` when nothing else is recognized.
4. For `text/html` representations, render inside an iframe with
   `sandbox="allow-scripts"` and **no** `allow-same-origin`.

See the [reference implementation in `pi-remote-control`](https://github.com/cemoody/pi-remote-control/tree/feat/rich-artifacts)
for a working web viewer, including the HTTP route, CSP headers, sandboxed
iframe component, and lazy-loaded chart renderers.

## Size limits

| Limit | Default | Behavior |
|---|---|---|
| Per-artifact file | 25 MiB | Hard error to LLM (`size_cap`). |
| Inline HTML in wire | 64 KiB | Spills to artifact store; wire becomes `{src: {kind: "url", url}}`. |
| Inline chart spec | 32 KiB | Spills to artifact store with a `$ref` URL. |
| Spec absolute max | 256 KiB | Hard error to LLM. |

## Security

- The extension refuses to read source paths that resolve outside the
  project cwd (defeats `display(path="../../../../etc/passwd")`).
- Tool arguments never carry rendered bytes — the LLM passes a file path
  or a compact JSON spec.
- HTML snippets are rendered with **null origin**. The host control plane
  is not reachable from artifact JS.

## Schema versioning

The wire payload carries `version: ARTIFACT_SCHEMA_VERSION` (currently `1`).
Future additions (LaTeX, DataResource for dataframes, etc.) bump this
constant and add new variants to the `ArtifactRepresentation` union.
Viewers should walk the `artifacts` list in order and pick the first MIME
they recognize; the always-present `text/plain` representation is the
universal fallback.

## License

MIT
