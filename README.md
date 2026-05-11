# pi-remote-control

Mobile-first, self-hosted web control plane for running many concurrent [Pi coding-agent](https://pi.dev/) sessions from a browser, intended for private remote access over Tailscale.

See [`plan.md`](./plan.md) for the implementation roadmap.

## Development

```bash
npm install
npm run typecheck
npm test
npm run e2e
npm run check
```

### API adapter selection

The HTTP API defaults to the in-process Pi SDK adapter. For development without model/API access, keep using the mock adapter:

```bash
PI_REMOTE_USE_MOCK=1 npm run dev:api
```

To run hot sessions through Pi's JSONL RPC protocol instead, use the `pirpc` adapter:

```bash
PI_REMOTE_ADAPTER=pirpc npm run dev:api
```

The `pirpc` adapter starts one `pi --mode rpc` subprocess per hot session and forwards Pi RPC streaming events to the web UI. It also loads the bundled `show_artifact` extension so the agent can return structured `piRemoteControlArtifact` tool results for browser rendering.

## Current status

Phase 0 project skeleton is being established first. Later phases will add the Pi SDK adapter, session registry, WebSocket protocol, and web UI.
