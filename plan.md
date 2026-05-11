# pi-remote-control plan

A mobile-first, self-hosted web control plane for running many concurrent Pi coding-agent sessions from a browser, intended to be accessed remotely over Tailscale.

The design goal is not to mirror Pi's terminal TUI through `xterm.js`; instead, the web app should treat Pi's TUI as the behavioral specification and use the Pi SDK/RPC event model as the structured interface.

## Guiding principles

- Use `@earendil-works/pi-coding-agent` as a library via the SDK where possible.
- Do not fork Pi unless core protocol changes become necessary.
- Prefer structured Pi events over terminal scraping.
- Support many independent sessions concurrently.
- Keep mobile approval/steering workflows first-class.
- Treat the existing Pi TUI features as the parity baseline.
- Build test-first around event streams, state reducers, and browser flows.
- Keep Tailscale deployment simple: bind locally or on tailnet interface, add app-level auth token anyway.

## Architectural target

```text
Browser / PWA
  ├─ session dashboard
  ├─ active session timeline
  ├─ prompt composer
  ├─ tool cards
  ├─ approval modals
  └─ settings/tree/model panels
        │
        │ WebSocket / HTTP
        ▼
Node server
  ├─ auth / pairing
  ├─ WebSocket fanout
  ├─ SessionRegistry: Map<sessionId, AgentSession>
  ├─ Pi SDK integration
  ├─ resource/extension loading
  └─ optional git/worktree orchestration
        │
        ▼
Pi SDK
  ├─ AgentSession
  ├─ SessionManager
  ├─ SettingsManager
  ├─ ModelRegistry
  └─ tool/event streams
```

---

# Phase 0 — repository and project skeleton

## Goal

Create a clean repository with project conventions, basic tooling decisions, and an initial planning/testing structure.

## Todo

- [ ] Initialize git repository.
- [ ] Add `plan.md`.
- [ ] Decide package manager: npm, pnpm, bun, or yarn.
- [ ] Decide app layout:
  - [ ] `server/`
  - [ ] `web/`
  - [ ] `shared/`
  - [ ] `docs/`
  - [ ] `fixtures/`
- [ ] Choose frontend stack.
  - Candidate: Vite + React + TypeScript.
- [ ] Choose backend stack.
  - Candidate: Node + TypeScript + Fastify + WebSocket.
- [ ] Choose test stack.
  - Unit/component: Vitest.
  - Browser E2E: Playwright.
  - Optional component tests: Testing Library.
- [ ] Add formatting/linting conventions.
- [ ] Add `.gitignore`.
- [ ] Add README with local run/development notes.

## TDD-style tests

- [ ] Repository sanity test: project installs cleanly.
- [ ] Typecheck command exists and passes.
- [ ] Unit test command exists and passes with one placeholder test.
- [ ] E2E command exists and can launch a placeholder page/server.

---

# Phase 1 — Pi SDK spike and session registry

## Goal

Prove that the server can create, hold, resume, and dispose multiple independent Pi `AgentSession` instances.

## Todo

- [ ] Add dependency on `@earendil-works/pi-coding-agent`.
- [ ] Create a minimal server-side Pi adapter.
- [ ] Create `SessionRegistry` abstraction.
- [ ] Support creating a new persistent session for a cwd.
- [ ] Support opening an existing session file.
- [ ] Support listing sessions by cwd.
- [ ] Support listing all sessions.
- [ ] Support disposing idle sessions.
- [ ] Ensure each session uses cwd-specific tool factories, not global tool singletons.
- [ ] Ensure no code calls `process.chdir()`.
- [ ] Share global `AuthStorage`, `ModelRegistry`, and `SettingsManager` safely.
- [ ] Define internal session handle metadata:
  - [ ] session id
  - [ ] session file
  - [ ] cwd
  - [ ] user/session owner
  - [ ] status: idle/running/compacting/retrying/error
  - [ ] last activity timestamp

## TDD-style tests

- [ ] Creating two sessions returns two different Pi session IDs.
- [ ] Creating two sessions returns two different session files.
- [ ] Prompting session A does not append messages to session B.
- [ ] Aborting session A does not alter session B state.
- [ ] Opening an existing session restores its messages.
- [ ] Listing sessions includes newly created persistent sessions.
- [ ] Disposing a session removes it from the hot registry but leaves its session file on disk.
- [ ] Reopening a disposed session restores state from disk.
- [ ] Registry rejects unknown session IDs with a typed error.
- [ ] Tests assert no `process.chdir()` usage in server code.

---

# Phase 2 — WebSocket protocol and event-state reducer

## Goal

Define the browser/server protocol and build a deterministic client-side reducer that consumes Pi events into web UI state.

## Todo

- [ ] Define shared TypeScript protocol types.
- [ ] Define client-to-server operations:
  - [ ] `list_sessions`
  - [ ] `new_session`
  - [ ] `open_session`
  - [ ] `close_session`
  - [ ] `get_state`
  - [ ] `get_messages`
  - [ ] `prompt`
  - [ ] `steer`
  - [ ] `follow_up`
  - [ ] `abort`
  - [ ] `set_model`
  - [ ] `set_thinking_level`
- [ ] Define server-to-client messages:
  - [ ] session list response
  - [ ] session state update
  - [ ] Pi event envelope
  - [ ] error envelope
  - [ ] extension UI request envelope
- [ ] Implement WebSocket connection lifecycle.
- [ ] Implement session subscription/fanout.
- [ ] Implement reconnect behavior at protocol level.
- [ ] Build client-side event reducer:
  - [ ] messages
  - [ ] streaming text deltas
  - [ ] streaming thinking deltas
  - [ ] tool call deltas
  - [ ] tool execution state
  - [ ] queue state
  - [ ] compaction state
  - [ ] retry state
  - [ ] extension UI state

## TDD-style tests

- [ ] Reducer handles `agent_start` and marks session running.
- [ ] Reducer handles `agent_end` and marks session idle.
- [ ] Reducer merges `message_update` text deltas into one assistant draft.
- [ ] Reducer merges thinking deltas into the right content block.
- [ ] Reducer creates a tool card on `tool_execution_start`.
- [ ] Reducer updates the same tool card on `tool_execution_update`.
- [ ] Reducer marks tool success/error on `tool_execution_end`.
- [ ] Reducer updates steering/follow-up queues on `queue_update`.
- [ ] Reducer tracks compaction lifecycle.
- [ ] Reducer tracks retry lifecycle and countdown metadata.
- [ ] WebSocket fanout sends session A events only to clients subscribed to session A.
- [ ] Reconnected client can request current session state and messages.
- [ ] Malformed client messages return typed protocol errors.

---

# Phase 3 — basic web shell and multi-session dashboard

## Goal

Create a usable browser interface for creating, opening, switching, and monitoring multiple sessions.

## Todo

- [ ] Create responsive app shell.
- [ ] Implement session/project sidebar.
- [ ] Implement session list.
- [ ] Implement active session view.
- [ ] Implement new session flow:
  - [ ] choose cwd
  - [ ] optional model
  - [ ] optional display name
- [ ] Implement open/resume existing session flow.
- [ ] Implement close/dispose hot session.
- [ ] Implement rename session.
- [ ] Implement delete/archive session only after confirmation.
- [ ] Show per-session status:
  - [ ] idle
  - [ ] streaming
  - [ ] waiting for approval
  - [ ] compacting
  - [ ] retrying
  - [ ] error
- [ ] Show per-session metadata:
  - [ ] cwd
  - [ ] session name
  - [ ] model
  - [ ] token/cost summary
  - [ ] last activity
- [ ] Support mobile navigation between dashboard and active session.

## TDD-style tests

- [ ] Dashboard loads with empty session list.
- [ ] Creating a session adds it to the dashboard.
- [ ] Opening a session shows its timeline pane.
- [ ] Two sessions can be open at once in the hot registry.
- [ ] Session A status can be running while Session B remains idle.
- [ ] Renaming a session updates the dashboard.
- [ ] Deleting a session requires confirmation.
- [ ] Mobile viewport shows session switcher and active session without horizontal overflow.
- [ ] Refresh/reconnect restores previously open session metadata.

---

# Phase 4 — message timeline and streaming renderer

## Goal

Render Pi conversation state with enough fidelity to replace the basic TUI message area.

## Todo

- [ ] Render user messages.
- [ ] Render assistant messages with Markdown.
- [ ] Render streaming assistant drafts.
- [ ] Render thinking blocks.
- [ ] Add global thinking hide/show toggle.
- [ ] Add per-thinking-block collapse.
- [ ] Render assistant metadata:
  - [ ] provider
  - [ ] model
  - [ ] stop reason
  - [ ] token usage
  - [ ] cost
- [ ] Render message errors and aborted messages.
- [ ] Render custom messages.
- [ ] Render branch summaries.
- [ ] Render compaction summaries.
- [ ] Implement copy message.
- [ ] Implement copy code block.
- [ ] Support auto-scroll with user scroll lock.

## TDD-style tests

- [ ] User message fixture renders text content.
- [ ] User message fixture renders image attachment preview.
- [ ] Assistant markdown fixture renders headings/lists/code blocks.
- [ ] Streaming text fixture progressively updates one visible assistant draft.
- [ ] Thinking fixture renders collapsed when global hide-thinking is enabled.
- [ ] Assistant metadata fixture shows model/provider/usage.
- [ ] Error assistant fixture shows error state.
- [ ] Aborted assistant fixture shows aborted state.
- [ ] Custom message fixture renders label and content.
- [ ] Branch summary fixture renders summary card.
- [ ] Compaction summary fixture renders summary card.
- [ ] Copy button copies expected message text.
- [ ] Auto-scroll pauses when user scrolls upward.

---

# Phase 5 — built-in tool cards

## Goal

Render Pi tool calls/results as structured web UI cards with live updates.

## Todo

- [ ] Create generic `ToolCard` component.
- [ ] Implement pending/running/success/error states.
- [ ] Implement collapse/expand per tool.
- [ ] Implement collapse all / expand all.
- [ ] Implement bash renderer:
  - [ ] live output
  - [ ] exit code
  - [ ] cancelled state
  - [ ] truncation indicator
- [ ] Implement read renderer:
  - [ ] file path
  - [ ] syntax-highlighted preview
- [ ] Implement edit renderer:
  - [ ] diff viewer
  - [ ] added/removed/context coloring
- [ ] Implement write renderer.
- [ ] Implement grep renderer.
- [ ] Implement find renderer.
- [ ] Implement ls renderer.
- [ ] Implement unknown/custom tool fallback renderer.
- [ ] Add copy/download full tool output.

## TDD-style tests

- [ ] Generic tool start renders pending/running card.
- [ ] Tool update replaces accumulated output without duplicating it.
- [ ] Tool success shows success state.
- [ ] Tool error shows error state and remains expanded by default.
- [ ] Bash fixture renders streamed output and final exit code.
- [ ] Read fixture renders file path and highlighted content.
- [ ] Edit fixture renders expected diff hunks.
- [ ] Grep fixture renders result list with file paths/lines.
- [ ] Find fixture renders matched file list.
- [ ] Ls fixture renders directory listing.
- [ ] Unknown tool fixture renders arguments and result JSON/text.
- [ ] Collapse all hides successful tool details.
- [ ] Download full output uses full output path/URL when available.

---

# Phase 6 — prompt composer, queues, and attachments

## Goal

Match Pi's editor workflows in web form, including steering/follow-up while an agent is running.

## Todo

- [ ] Build multiline prompt composer.
- [ ] Persist draft per session.
- [ ] Submit prompt when session is idle.
- [ ] When session is streaming, present choices:
  - [ ] steer
  - [ ] follow-up
  - [ ] cancel
- [ ] Add explicit buttons for steer/follow-up/abort.
- [ ] Show steering queue.
- [ ] Show follow-up queue.
- [ ] Allow deleting queued messages.
- [ ] Allow moving queued follow-ups.
- [ ] Allow restoring queued message to editor.
- [ ] Implement image upload.
- [ ] Implement image paste.
- [ ] Implement mobile camera/photo picker.
- [ ] Implement `@file` reference autocomplete.
- [ ] Implement slash-command autocomplete.
- [ ] Implement shell-command mode for `!command` and `!!command`.

## TDD-style tests

- [ ] Idle submit sends `prompt` operation.
- [ ] Streaming submit opens queue-choice UI instead of blindly sending.
- [ ] Steer button sends `steer` operation.
- [ ] Follow-up button sends `follow_up` operation.
- [ ] Abort button sends `abort` operation.
- [ ] Queue update fixture renders steering and follow-up queues.
- [ ] Deleting queued message updates UI optimistically and/or after server ack.
- [ ] Draft persists across session switch.
- [ ] Pasted image appears as attachment preview.
- [ ] Removed attachment is not sent.
- [ ] `@` opens file autocomplete.
- [ ] Selected file reference is inserted into composer.
- [ ] `/` opens command autocomplete.
- [ ] Selecting extension command sends prompt with slash command.
- [ ] `!echo hi` runs shell-command path and renders result.
- [ ] `!!echo hi` runs hidden shell-command path and marks output excluded from context.

---

# Phase 7 — extension UI compatibility

## Goal

Support Pi extension UI primitives in the browser so existing extensions can ask for confirmations, inputs, statuses, widgets, and notifications.

## Todo

- [ ] Implement extension UI request dispatcher.
- [ ] Render `confirm` as modal/bottom sheet.
- [ ] Render `select` as modal list.
- [ ] Render `input` as prompt dialog.
- [ ] Render `editor` as multiline dialog.
- [ ] Render `notify` as toast/notification.
- [ ] Render `setStatus` as status bar pill.
- [ ] Render `setWidget` above/below composer.
- [ ] Render `setTitle` in session/browser title.
- [ ] Implement `setEditorText` by updating composer draft.
- [ ] Handle request timeouts.
- [ ] Create or load an `rpc-demo`-style extension fixture to exercise all primitives.
- [ ] Add an approval inbox across sessions.

## TDD-style tests

- [ ] Confirm request opens modal and returns confirmed true/false.
- [ ] Select request opens options and returns selected value.
- [ ] Input request returns typed text.
- [ ] Editor request returns multiline text.
- [ ] Cancelled dialog sends cancellation response.
- [ ] Timeout closes dialog without duplicate response.
- [ ] Notify request creates toast.
- [ ] Status request creates/updates/removes status pill.
- [ ] Widget request renders above composer by default.
- [ ] Widget request renders below composer when requested.
- [ ] Set-title request updates active session title.
- [ ] Set-editor-text request replaces composer content.
- [ ] Approval inbox shows pending approval from background session.
- [ ] Approving from inbox sends response to correct session.

---

# Phase 8 — model, thinking, settings, and resources

## Goal

Replace TUI built-in panels such as `/model`, `/scoped-models`, `/settings`, `/hotkeys`, and `/reload` with web-native equivalents.

## Todo

- [ ] Model selector:
  - [ ] list available models
  - [ ] search/filter
  - [ ] show provider/model metadata
  - [ ] set model per session
- [ ] Thinking selector:
  - [ ] off/minimal/low/medium/high/xhigh
  - [ ] hide/show thinking setting
- [ ] Scoped models configuration.
- [ ] Settings panel:
  - [ ] global settings
  - [ ] project settings
  - [ ] effective merged settings
  - [ ] save/flush
- [ ] Settings groups:
  - [ ] model/thinking
  - [ ] UI/display
  - [ ] compaction
  - [ ] retry
  - [ ] message delivery
  - [ ] images
  - [ ] shell
  - [ ] sessions
  - [ ] resources
- [ ] Resource diagnostics panel:
  - [ ] extensions
  - [ ] skills
  - [ ] prompt templates
  - [ ] themes
  - [ ] context files
- [ ] Reload resources action.
- [ ] Hotkeys/help panel.

## TDD-style tests

- [ ] Model selector lists mocked available models.
- [ ] Selecting model sends `set_model` and updates session state.
- [ ] Thinking selector sends `set_thinking_level`.
- [ ] Hide-thinking setting affects timeline rendering.
- [ ] Settings panel displays global/project/effective values.
- [ ] Saving global setting writes through server settings API.
- [ ] Saving project setting overrides global value.
- [ ] Message delivery setting changes steering/follow-up mode.
- [ ] Resource diagnostics display extension load errors.
- [ ] Reload resources action refreshes command/resource lists.
- [ ] Hotkeys panel lists web actions and configured shortcuts.

---

# Phase 9 — session tree, fork, clone, and branching

## Goal

Expose Pi's tree-shaped session model in a visual web interface.

## Todo

- [ ] Add server API for session tree data.
- [ ] Render visual tree.
- [ ] Highlight current leaf.
- [ ] Inspect selected entry.
- [ ] Filter modes:
  - [ ] default
  - [ ] no-tools
  - [ ] user-only
  - [ ] labeled-only
  - [ ] all
- [ ] Fold/unfold branch segments.
- [ ] Search tree entries.
- [ ] Add/edit/clear labels.
- [ ] Show label timestamps.
- [ ] Navigate to selected entry.
- [ ] If selected user entry, restore its text into composer for editing/resubmission.
- [ ] Support branch summary choices:
  - [ ] no summary
  - [ ] default summary
  - [ ] custom summary instructions
- [ ] Implement fork from selected user message.
- [ ] Implement clone current active branch.
- [ ] Show parent session breadcrumb.

## TDD-style tests

- [ ] Tree fixture renders all branch nodes.
- [ ] Current leaf is highlighted.
- [ ] User-only filter hides non-user entries.
- [ ] No-tools filter hides tool result entries.
- [ ] Labeled-only filter shows only labeled entries.
- [ ] Selecting an entry shows details panel.
- [ ] Editing a label persists via server API.
- [ ] Clearing a label removes it from labeled-only view.
- [ ] Navigating to user entry restores message text into composer.
- [ ] Navigating to assistant entry leaves composer empty.
- [ ] Branch summary prompt appears when switching branches.
- [ ] Custom branch summary instructions are sent to server.
- [ ] Fork creates a new session and shows it in dashboard.
- [ ] Clone creates a new session with same active branch.

---

# Phase 10 — compaction, retry, export, and sharing

## Goal

Expose the remaining important TUI lifecycle controls in web-native form.

## Todo

- [ ] Context usage meter.
- [ ] Manual compaction button.
- [ ] Compact with custom instructions.
- [ ] Auto-compaction status.
- [ ] Render compaction summaries.
- [ ] Retry status panel.
- [ ] Abort retry.
- [ ] Enable/disable auto-retry.
- [ ] Copy last assistant message.
- [ ] Export session to HTML.
- [ ] Export session JSONL.
- [ ] Export selected branch.
- [ ] Optional share integration.

## TDD-style tests

- [ ] Context usage meter renders token percentage when available.
- [ ] Manual compact sends compact command.
- [ ] Custom compact sends instructions.
- [ ] Compaction start event shows progress UI.
- [ ] Compaction end event renders summary and clears progress UI.
- [ ] Compaction failure shows error.
- [ ] Retry start event shows attempt/max/delay.
- [ ] Retry end success clears retry UI.
- [ ] Retry end failure shows final error.
- [ ] Abort retry sends command.
- [ ] Copy last assistant copies expected text.
- [ ] Export HTML downloads/opens generated file.
- [ ] Export JSONL downloads original session file.

---

# Phase 11 — file explorer and git/worktree integration

## Goal

Make the web UI better than the TUI for parallel coding by adding project/file/diff/worktree workflows.

## Todo

- [ ] Project file explorer.
- [ ] File search.
- [ ] File viewer with syntax highlighting.
- [ ] Markdown preview.
- [ ] Image preview.
- [ ] Click file paths in tool results to open file.
- [ ] Show files read by session.
- [ ] Show files modified by session.
- [ ] Git status panel.
- [ ] Diff viewer.
- [ ] Stage/unstage files.
- [ ] Commit changes.
- [ ] Optional: create session in new git branch.
- [ ] Optional: create session in new git worktree.
- [ ] Optional: compare session output against base branch.
- [ ] Optional: merge/cherry-pick winning session.

## TDD-style tests

- [ ] File explorer lists mocked project files.
- [ ] Opening file renders highlighted content.
- [ ] Markdown file renders preview.
- [ ] Tool result path click opens correct file.
- [ ] Git status fixture renders changed files.
- [ ] Diff fixture renders added/removed/context lines.
- [ ] Create-worktree flow calls expected server API.
- [ ] Session created in worktree uses worktree cwd.
- [ ] Compare sessions shows distinct diffs.

---

# Phase 12 — remote/mobile polish and deployment

## Goal

Make the app reliable and pleasant over Tailscale from a mobile device.

## Todo

- [ ] App-level auth token.
- [ ] Optional QR pairing flow.
- [ ] Bind/server host configuration for Tailscale.
- [ ] PWA manifest.
- [ ] Mobile home-screen install support.
- [ ] Push notifications:
  - [ ] agent finished
  - [ ] approval needed
  - [ ] error/failure
  - [ ] retry exhausted
- [ ] Reconnect/resume after phone lock.
- [ ] Low-bandwidth mode.
- [ ] Approval inbox across all sessions.
- [ ] Read-only mode.
- [ ] Server admin/status page.
- [ ] Idle session disposal policy.
- [ ] Cost dashboard.

## TDD-style tests

- [ ] Unauthorized requests are rejected.
- [ ] Authorized WebSocket connects successfully.
- [ ] QR/pairing flow creates valid token.
- [ ] Mobile viewport passes critical navigation tests.
- [ ] Simulated disconnect/reconnect restores active session.
- [ ] Push notification is requested when approval arrives.
- [ ] Approval notification opens correct session.
- [ ] Low-bandwidth mode collapses tool output by default.
- [ ] Read-only mode disables prompt/tool-mutating actions.
- [ ] Idle session disposal removes session from hot registry after timeout.
- [ ] Cost dashboard aggregates session usage fixtures.

---

# Open design questions

- [ ] SDK-only, RPC-only, or hybrid backend?
  - Current preference: SDK-first, optional RPC adapter later.
- [ ] How much of Pi extension UI should be supported initially?
  - Current preference: support RPC-compatible primitives early; defer full custom TUI component analog.
- [ ] Should sessions be isolated by git worktree by default?
  - Current preference: optional in early versions, recommended for parallel coding later.
- [ ] Should the server support multiple users or just one trusted tailnet user?
  - Current preference: single-user first, but keep session ownership in data model.
- [ ] Should session files remain in Pi's default directory or app-specific directory?
  - Current preference: Pi default initially for interoperability; allow custom session dir later.
- [ ] Should web-native commands exactly mirror slash commands or expose richer menus?
  - Current preference: both; slash palette plus native buttons/modals.
- [ ] How should cwd selection be secured?
  - Need an allowlist/root directory policy before exposing remotely.

# Non-goals for the first version

- Full terminal/TUI emulation through xterm.js.
- Multi-user cloud service.
- Public internet exposure without Tailscale or equivalent private network.
- Maintaining a fork of Pi.
- Implementing Pi's `ctx.ui.custom()` terminal component API directly in web.
- Perfect parity with every TUI keyboard shortcut on mobile.
