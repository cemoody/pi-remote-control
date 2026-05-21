# pi-remote-control extension framework refactor plan

## Goal

Refactor pi-remote-control so features like scheduling, fork/clone controls, Whisper STT, terminals, workspace panels, git workflows, artifact renderers, and future UI/backend capabilities can be implemented as first-party or user-installed extensions rather than hard-coded app features.

The extension model should be deliberately smaller than VS Code/JupyterLab, but should borrow the same core ideas:

- stable contribution points instead of monkey-patching;
- a central command registry;
- web UI slots for panels/actions/renderers;
- optional server-side routes/jobs for trusted extensions;
- explicit session APIs so extensions do not reach into registries directly;
- separate Pi-agent extensions from web/server extensions.

## Non-goals for the first refactor

- No marketplace.
- No remote plugin loading.
- No iframe sandboxing initially.
- No multi-user permission system.
- No arbitrary React internals exposed to plugins.
- No general Express/Node monkey-patching API.
- No dynamic npm install in phase 1.

The first version should support bundled first-party extensions and maybe local trusted extensions later.

## Target architecture

Split extensibility into three layers:

```text
Pi extension
  A normal Pi Coding Agent extension loaded into pi workers.
  Affects model-visible tools, agent hooks, provider hooks, system prompt, etc.

Server extension
  Trusted backend contribution loaded by pi-remote-control.
  Adds API routes, background jobs, storage, server-side capabilities.

Web extension
  Trusted frontend contribution loaded by pi-remote-control WUI.
  Adds sidebar tabs, composer actions, timeline actions, artifact renderers,
  status items, settings pages, etc.
```

Some features may use one layer; others may use all three.

Examples:

```text
Fork/clone buttons
  Web extension only, calling core session APIs.

Schedule tab
  Web extension + server extension.

Whisper STT
  Web extension + server extension.

Artifacts
  Pi extension + web renderer extension + server artifact file route.

Terminal
  Web extension + server extension, optional Pi tool later.
```

## Extension package shape

For built-ins, extensions can be plain TypeScript modules inside the repo:

```text
src/extensions/builtin/
  branching/
    index.ts
  schedule/
    index.ts
    SchedulePanel.tsx
    server.ts
  whisper/
    index.ts
    server.ts
  artifacts/
    index.ts
    ArtifactRenderers.tsx
```

For future local extensions, support a manifest shape like:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "0.1.0",
  "piRemoteControl": {
    "web": "./web.js",
    "server": "./server.js",
    "piExtensions": ["./pi-extension.ts"],
    "capabilities": ["ui.sidebar", "server.routes"]
  }
}
```

Do not implement external package loading until the built-in extension API is proven.

## Core extension API

Create shared extension API types under:

```text
src/extensions/api.ts
src/extensions/registry.ts
src/extensions/builtin.ts
```

Initial public shape:

```ts
export interface PrcExtension {
  readonly id: string;
  readonly name: string;
  readonly apiVersion: 1;
  activate(ctx: PrcExtensionContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export interface PrcExtensionContext {
  readonly commands: CommandRegistry;
  readonly sidebar: SidebarRegistry;
  readonly sessionToolbar: SessionToolbarRegistry;
  readonly timeline: TimelineRegistry;
  readonly composer: ComposerRegistry;
  readonly status: StatusRegistry;
  readonly settings: SettingsRegistry;
  readonly sessions: ExtensionSessionApi;
  readonly api: ExtensionHttpClient;
  readonly events: ExtensionEventBus;
  readonly server?: ServerExtensionApi;
}
```

`server` is present only in the backend extension host. Web-only extension code should not assume it exists.

## Contribution registries

### Commands

Everything user-triggerable should be a command.

```ts
interface CommandRegistry {
  register(command: PrcCommand): Disposable;
  get(id: string): PrcCommand | undefined;
  list(): readonly PrcCommand[];
  run(id: string, args?: unknown): Promise<unknown>;
}

interface PrcCommand {
  id: string;
  title: string;
  description?: string;
  group?: string;
  shortcut?: string;
  icon?: string;
  enabled?(ctx: CommandRunContext): boolean;
  run(ctx: CommandRunContext, args?: unknown): unknown | Promise<unknown>;
}
```

Buttons, menus, keyboard shortcuts, command palette rows, and plugin UI actions should invoke commands.

### Sidebar tabs

```ts
interface SidebarRegistry {
  registerTab(tab: SidebarTabContribution): Disposable;
  open(id: string): void;
}

interface SidebarTabContribution {
  id: string;
  title: string;
  icon?: string;
  order?: number;
  render: React.ComponentType<SidebarTabProps> | (() => Promise<{ default: React.ComponentType<SidebarTabProps> }>);
}
```

Use for schedule, lifecycle, workspaces, terminals, git, etc.

### Session toolbar actions

```ts
interface SessionToolbarRegistry {
  registerAction(action: SessionActionContribution): Disposable;
}

interface SessionActionContribution {
  id: string;
  command: string;
  label: string;
  icon?: string;
  order?: number;
  visible?(ctx: SessionActionContext): boolean;
}
```

Use for clone, abort, export, schedule from session, etc.

### Timeline actions and renderers

```ts
interface TimelineRegistry {
  registerMessageAction(action: TimelineMessageAction): Disposable;
  registerMessageRenderer(renderer: TimelineMessageRenderer): Disposable;
  registerToolRenderer(renderer: TimelineToolRenderer): Disposable;
  registerArtifactRenderer(renderer: ArtifactRenderer): Disposable;
}
```

Use for fork-from-message, copy, label, custom message rendering, custom tool rows, and artifacts.

### Composer actions and providers

```ts
interface ComposerRegistry {
  registerAction(action: ComposerActionContribution): Disposable;
  registerAutocompleteProvider(provider: AutocompleteProvider): Disposable;
  insertText(text: string): void;
  setDraft(text: string): void;
  getDraft(): string;
}
```

Use for Whisper STT, image attachment, file references, command autocomplete, issue autocomplete.

### Status items

```ts
interface StatusRegistry {
  registerItem(item: StatusItemContribution): Disposable;
  set(id: string, value: StatusValue | undefined): void;
}
```

Use for cron active, current workspace, terminal status, git branch, connection state.

### Settings and secrets

```ts
interface SettingsRegistry {
  define(setting: SettingDefinition): Disposable;
  defineSecret(secret: SecretDefinition): Disposable;
  get<T>(id: string): T | undefined;
  getSecret(id: string): string | undefined;
  registerPage(page: SettingsPageContribution): Disposable;
}
```

Phase 1 can read secrets from environment variables only. For example, Whisper reads `OPENAI_API_KEY`.

### Server extension API

```ts
interface ServerExtensionApi {
  readonly routes: ServerRouteRegistry;
  readonly jobs: BackgroundJobRegistry;
  readonly storage: ExtensionStorageRegistry;
}

interface ServerRouteRegistry {
  get(path: string, handler: RouteHandler): Disposable;
  post(path: string, handler: RouteHandler): Disposable;
}

interface BackgroundJobRegistry {
  register(job: BackgroundJob): Disposable;
}

interface BackgroundJob {
  id: string;
  intervalMs: number;
  run(ctx: BackgroundJobContext): void | Promise<void>;
}
```

Routes should be automatically namespaced by extension id:

```text
/api/extensions/<extensionId>/<route>
```

This prevents route collisions and makes capability auditing easier.

## Session API for extensions

Expose host-owned operations instead of internal registries:

```ts
interface ExtensionSessionApi {
  list(): Promise<readonly SessionSummary[]>;
  get(sessionId: string): Promise<SessionState>;
  create(input: { cwd: string; sessionName?: string }): Promise<SessionSummary>;
  prompt(sessionId: string, prompt: string, options?: { deliverAs?: "steer" | "followUp" }): Promise<void>;
  fork(sessionId: string, input: { entryId: string; position?: "before" | "at" }): Promise<SessionSummary>;
  clone(sessionId: string): Promise<SessionSummary>;
  abort(sessionId: string): Promise<void>;
  open(sessionId: string): void;
}
```

Internally this adapts to existing `SessionRegistry` / HTTP APIs.

## Capabilities

Track capabilities even before enforcing them.

```ts
type ExtensionCapability =
  | "ui.sidebar"
  | "ui.timeline"
  | "ui.composer"
  | "ui.status"
  | "ui.settings"
  | "session.read"
  | "session.write"
  | "session.branch"
  | "server.routes"
  | "server.jobs"
  | "server.secrets"
  | "browser.microphone"
  | "network.external"
  | "filesystem.workspace";
```

Example declarations:

```json
{
  "id": "core.branching",
  "capabilities": ["ui.timeline", "ui.status", "session.branch"]
}
```

```json
{
  "id": "core.schedule",
  "capabilities": ["ui.sidebar", "server.jobs", "session.write"]
}
```

```json
{
  "id": "core.whisper",
  "capabilities": ["ui.composer", "browser.microphone", "server.routes", "server.secrets", "network.external"]
}
```

## First-party extensions to extract

### 1. `core.branching`

Move fork/clone UI into an extension.

Contributions:

- timeline user-message action: `Fork from here`;
- session toolbar action: `Clone`;
- command palette commands:
  - `session.forkFromMessage`;
  - `session.clone`.

Implementation:

- call `ctx.sessions.fork()` and `ctx.sessions.clone()`;
- use existing backend routes initially;
- no server extension required unless missing session APIs need adding.

### 2. `core.schedule`

Move current cron UI/server scheduler into an extension.

Contributions:

- sidebar tab: `Schedule`;
- commands:
  - `schedule.newJob`;
  - `schedule.runNow`;
  - `schedule.deleteJob`;
- server routes under `/api/extensions/core.schedule/*`;
- background job runner;
- status item showing next due job or active count.

Refactor targets:

- move `src/server/cron/*` behind server extension API;
- move `CronPanel.tsx` behind sidebar contribution;
- keep the cron store file format compatible with current `PI_REMOTE_CRON_FILE`.

### 3. `core.whisper`

Add Whisper STT as an extension, not core composer code.

Contributions:

- composer microphone action;
- optional settings page/secret definition for `OPENAI_API_KEY`;
- server route `/api/extensions/core.whisper/transcribe`;
- browser audio capture helper.

Implementation notes:

- frontend records `audio/webm`;
- server forwards to OpenAI transcription API;
- extension inserts returned text into composer draft;
- keep silence detection in web extension code if practical.

### 4. `core.artifacts`

Move artifact rendering registrations into extension slots.

Contributions:

- artifact renderers for:
  - image;
  - HTML iframe;
  - Vega-Lite;
  - Markdown;
  - JSON;
  - table;
  - multi-MIME `display()` artifacts.

Pi extension:

- keep `src/server/pi/extensions/pi-remote-artifacts.ts` as the agent-side extension;
- server continues to load it into Pi workers;
- web renderers become registered artifact renderers instead of hard-coded `MessageTimeline` branches.

## Refactor phases

### Phase 0: Stabilize existing contracts

- Identify existing hard-coded features:
  - cron routes/UI;
  - fork/clone UI;
  - artifact rendering;
  - composer attachment actions;
  - lifecycle/status panels.
- Add characterization tests around current behavior before moving code.
- Document current internal APIs needed by extensions.

Deliverable:

- this plan;
- issue checklist;
- tests for fork/clone, cron run-now, artifact rendering, composer submit.

### Phase 1: Add extension host and command registry

Create:

```text
src/extensions/api.ts
src/extensions/registry.ts
src/extensions/builtin.ts
src/web/extensions/ExtensionProvider.tsx
```

Implement:

- extension registration;
- activation/deactivation;
- disposable cleanup;
- command registry;
- extension React context/provider;
- command palette backed by command registry if possible.

No features moved yet.

Acceptance criteria:

- a trivial built-in extension can register a command;
- command can be invoked from UI/test;
- duplicate ids produce clear diagnostics.

### Phase 2: Add UI contribution registries

Implement registries for:

- sidebar tabs;
- session toolbar actions;
- timeline message actions;
- composer actions;
- status items;
- settings pages.

Refactor UI components to render registered contributions alongside current built-ins.

Likely files touched:

```text
src/web/components/SessionDashboard.tsx
src/web/components/SessionTree.tsx
src/web/components/MessageTimeline.tsx
src/web/components/PromptComposer.tsx
src/web/components/RemoteStatusPanel.tsx
src/web/components/ShortcutHelp.tsx
```

Acceptance criteria:

- a built-in demo extension can add a sidebar tab;
- a built-in demo extension can add a composer button;
- a built-in demo extension can add a timeline action.

### Phase 3: Add extension session API

Wrap existing session HTTP/client operations in a stable extension API.

Likely files:

```text
src/web/api/session-api.ts
src/web/api/http-session-api.ts
src/server/session/session-registry.ts
src/server/http-api-server.ts
```

Acceptance criteria:

- extension can create session;
- extension can prompt session;
- extension can fork/clone via host API;
- extension code does not import session dashboard internals.

### Phase 4: Extract `core.branching`

Move fork/clone controls into first-party extension.

Steps:

1. Add `src/extensions/builtin/branching/index.ts`.
2. Register fork/clone commands.
3. Register timeline action for user messages.
4. Register session toolbar clone action.
5. Remove hard-coded fork/clone buttons from components or make them consume registered actions.

Acceptance criteria:

- existing fork/clone behavior unchanged;
- disabling `core.branching` removes fork/clone UI but backend APIs still work;
- tests pass.

### Phase 5: Add server extension host

Create backend extension registry and route/job namespacing.

Likely files:

```text
src/server/extensions/api.ts
src/server/extensions/host.ts
src/server/http-api-server.ts
```

Implement:

- server extension activation at API startup;
- namespaced routes under `/api/extensions/:extensionId/*`;
- background job registry with start/stop lifecycle;
- simple extension storage helper if needed.

Acceptance criteria:

- test extension registers a route;
- test extension registers an interval job;
- jobs stop on API shutdown;
- route collisions are impossible via namespacing.

### Phase 6: Extract `core.schedule`

Move cron scheduler into extension.

Steps:

1. Move `src/server/cron/*` to `src/extensions/builtin/schedule/server/*` or wrap it.
2. Register server routes under `/api/extensions/core.schedule/*`.
3. Register background job for scheduler tick.
4. Move `CronPanel.tsx` into schedule extension web code.
5. Register sidebar tab and commands.
6. Keep env var compatibility for `PI_REMOTE_CRON_FILE`.

Acceptance criteria:

- schedule tab is contributed by extension;
- scheduled jobs still fire;
- run-now still creates a session and starts prompt fire-and-forget;
- disabling extension removes UI and stops scheduler;
- existing cron tests adapted and passing.

### Phase 7: Add `core.whisper`

Implement Whisper STT as a new extension.

Steps:

1. Add composer action contribution.
2. Add browser audio recorder utility.
3. Add server route for transcription.
4. Add setting/secret definition for `OPENAI_API_KEY`.
5. Insert returned text into composer draft.

Acceptance criteria:

- microphone button appears only when extension enabled;
- missing API key produces useful UI error;
- recorded audio is sent to server route;
- transcribed text appears in composer;
- no transcription logic in core composer.

### Phase 8: Extract artifact renderers

Turn hard-coded artifact handling into registered renderers.

Steps:

1. Define `ArtifactRenderer` interface.
2. Register built-in renderers via `core.artifacts`.
3. Refactor `MessageTimeline` to ask registry for renderer.
4. Keep fallback renderer for unknown artifacts.
5. Keep Pi worker extension loading as adapter/server behavior.

Acceptance criteria:

- all current artifact kinds still render;
- a test extension can register a custom artifact renderer;
- unknown artifacts fall back to JSON/text.

### Phase 9: Local trusted extensions

After built-ins work, support local extension discovery.

Potential locations:

```text
~/.pi-remote-control/extensions/*
.pi/remote-control/extensions/*
```

Initial support can be server-side only or web-only depending on risk.

Acceptance criteria:

- local extension manifest loaded;
- browser plugin assets served safely;
- invalid extension fails with diagnostics, not app crash.

## Suggested implementation order

1. Extension API types and registry.
2. Command registry.
3. UI contribution registries.
4. Session API wrapper.
5. Extract branching.
6. Server extension host.
7. Extract schedule.
8. Add Whisper.
9. Artifact renderer registry.
10. Local extension discovery.

This order gives value early while minimizing risk.

## Testing strategy

### Unit tests

- command registry duplicate handling;
- extension activation/deactivation cleanup;
- contribution ordering;
- capability metadata;
- server route namespacing;
- background job lifecycle.

### Component tests

- sidebar renders contributed tabs;
- composer renders contributed actions;
- timeline renders contributed message actions;
- artifact renderer selection.

### E2E tests

- fork button appears via extension and forks from message;
- clone command clones session;
- schedule run-now creates a session and navigates/updates UI;
- Whisper missing API key error path;
- extension disable removes contributions.

### Regression tests to preserve

- API restart resume;
- SSE replay;
- artifact rendering;
- mobile composer layout;
- cron scheduler semantics.

## Migration notes

- Existing environment variables should keep working.
- Existing cron job file should remain readable.
- Existing artifact message details should continue to render.
- Existing session URLs/routes should remain stable; extension routes can be additive.
- Built-in extensions should be enabled by default so user-visible behavior does not disappear during migration.

## Open design questions

1. Should web extensions be React components, lazy module factories, or framework-neutral render callbacks?
   - Recommendation: React components for first-party extensions; hide behind contribution interfaces.

2. Should server and web extension manifests be separate?
   - Recommendation: one manifest, separate `web` and `server` entry points.

3. Should capabilities be enforced in phase 1?
   - Recommendation: no. Record/display them first; enforce later if third-party loading is added.

4. Should extension settings be stored in a global config file?
   - Recommendation: eventually yes, but phase 1 can use env/defaults.

5. Should Pi extensions be loaded by web extensions automatically?
   - Recommendation: declare them in manifest, but server/adapter owns actual `--extension` loading.

## Success criteria

The refactor is successful when:

- schedule is implemented as a built-in extension;
- fork/clone UI is implemented as a built-in extension;
- Whisper STT can be added without editing core composer/server routing code;
- artifact renderers are registered rather than hard-coded;
- adding a new first-party panel requires only extension registration, not edits to central dashboard components;
- existing resilience properties remain intact: detached workers, API restart reattach, SSE replay.
