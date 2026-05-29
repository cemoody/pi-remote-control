# Generic Pi Slash Commands: TDD Plan

Status: planned / TDD-first implementation branch `tdd/generic-pi-slash-commands`.

## Goal

pi-crust should keep web-native handling for known built-in commands such as `/login`, `/logout`, `/model`, `/settings`, `/reload`, `/compact`, and `/new`, while generically discovering and executing Pi extension commands, skills, and prompt templates through Pi RPC.

The motivating command is `/litellm-refresh`, which is registered by `pi-provider-litellm` with `pi.registerCommand("litellm-refresh", ...)`. It should not require custom pi-crust slash-command code.

## Desired routing contract

When a user submits text beginning with `/`:

1. **pi-crust built-in web command wins**
   - Examples: `/login`, `/logout`, `/model`, `/models`, `/settings`, `/reload`, `/compact`, `/new`, `/clear`, `/name`, `/session`, `/help`.
2. **pi-crust web extension slash command wins next**
   - Existing host-side commands from `extensions.commands[].slashName`, e.g. branching `/fork`, `/clone`.
3. **Pi dynamic command wins next**
   - Returned by Pi RPC `get_commands`.
   - Sources: `extension`, `prompt`, `skill`.
4. **Unknown command**
   - Must not be sent to the model by default.
   - Show a clear unknown-command notice.

Built-ins intentionally win over dynamic commands to preserve web-native UI for TUI-only commands.

## Generic command execution contract

If `/litellm-refresh` or any other dynamic command appears in `get_commands`, pi-crust should:

- include it in autocomplete and help;
- send the original slash text to Pi RPC `prompt`;
- not require custom pi-crust command logic;
- not wait forever for `agent_end`, because many extension commands are handled immediately and emit only extension UI events;
- surface `ctx.ui.notify`, `select`, `input`, `confirm`, and `editor` through `ExtensionUiHost`.

## Implementation shape

### Types

Add a shared command metadata shape, for example:

```ts
interface PiDynamicCommandInfo {
  readonly name: string;
  readonly description?: string;
  readonly source: "extension" | "prompt" | "skill";
  readonly location?: "user" | "project" | "path";
  readonly path?: string;
}
```

### Server / adapter

Add to `PiSessionHandle`:

```ts
getCommands?(): Promise<readonly PiDynamicCommandInfo[]>;
runPiSlashCommand?(text: string): Promise<void>;
```

`PiRpcSessionHandle.getCommands()` should call:

```ts
this.rpc.request("get_commands")
```

`PiRpcSessionHandle.runPiSlashCommand(text)` should call:

```ts
this.rpc.request("prompt", { message: text })
```

and return on RPC response acceptance, not on `agent_end`.

### HTTP API

Expose:

```http
GET /api/sessions/:sessionId/commands
POST /api/sessions/:sessionId/pi-command
{ "text": "/litellm-refresh" }
```

The POST endpoint should reject non-slash text.

### Web API

Add:

```ts
getPiCommands?(sessionId: string): Promise<readonly PiDynamicCommandInfo[]>;
runPiSlashCommand?(sessionId: string, text: string): Promise<void>;
```

### Web UI

SessionDashboard should:

- fetch dynamic commands for the active session;
- merge command names into `PromptComposer.commandSuggestions`;
- refresh dynamic commands after `/reload` and session switch;
- route submit according to precedence: built-in → pi-crust extension → Pi dynamic → unknown.

## Test matrix

### 1. Pure parser tests

File: `tests/unit/slash-command-parser.test.ts`

- Parses `/litellm-refresh` as `{ name: "litellm-refresh", argv: "" }`.
- Parses `/litellm-refresh now` as `{ name: "litellm-refresh", argv: "now" }`.
- Parses `/skill:brave-search query` as `{ name: "skill:brave-search", argv: "query" }`.
- Preserves the original text, including repeated spaces after the command.
- Does not treat `Please run /litellm-refresh` as a slash command.
- Does not treat leading-whitespace ` /litellm-refresh` as a command unless explicitly changed later.
- Treats `/` and `/ model` as invalid/incomplete commands.

### 2. Pure routing tests

File: `tests/unit/slash-command-routing.test.ts`

- Built-in wins over Pi dynamic command with same name.
- Built-in wins over pi-crust extension command with same name.
- pi-crust extension command wins over Pi dynamic command with same name.
- Dynamic extension command routes generically.
- Dynamic skill command routes generically.
- Dynamic prompt-template command routes generically.
- Unknown command remains unknown.
- Case sensitivity is explicit and tested.
- Unsafe/malformed dynamic names are ignored.

### 3. Pi RPC adapter tests

File: `tests/unit/pirpc-pi-adapter.test.ts`

- `getCommands()` forwards to RPC `get_commands` and parses extension/prompt/skill commands.
- Malformed command entries are filtered without crashing.
- `runPiSlashCommand("/litellm-refresh")` sends RPC `prompt` and resolves without waiting for `agent_end`.
- Generic command notifications emitted as `extension_ui_request` are forwarded to subscribers.
- RPC failure from `prompt` is surfaced as an error.
- Generic commands that do produce agent events still stream those events asynchronously.

### 4. SessionRegistry tests

File: `tests/unit/session-registry.test.ts`

- Registry delegates `getCommands(sessionId)` to the handle.
- Registry delegates `runPiSlashCommand(sessionId, text)` to the handle.
- Adapter lacking support produces clear errors.
- Non-slash text is rejected before reaching Pi.

### 5. HTTP API tests

File: `tests/e2e/http-api-pi-commands.test.ts` and route matrix.

- `GET /api/sessions/:id/commands` returns dynamic commands.
- Unknown session returns 404.
- Empty command list returns `{ commands: [] }`.
- Malformed Pi data is sanitized.
- `POST /api/sessions/:id/pi-command` accepts valid slash command.
- POST rejects missing text, empty text, non-slash text, and too-long text.
- POST propagates Pi RPC failure with a useful error.

### 6. Web API client tests

- URL encodes session IDs.
- Calls `/api/sessions/:id/commands`.
- Calls `/api/sessions/:id/pi-command`.
- Sends exact original slash text.
- Propagates API error messages.

### 7. PromptComposer tests

File: `tests/unit/prompt-composer.test.tsx`

- Dynamic extension command appears in autocomplete.
- Skill command with colon appears and completes correctly.
- Prompt-template command appears and completes correctly.
- Duplicate suggestions are de-duped.
- Builtin and dynamic duplicate displays once.
- Hyphen and colon matching work.

### 8. SessionDashboard tests

File: `tests/unit/session-dashboard.test.tsx`

- Fetches dynamic commands for active session.
- Dynamic commands appear in autocomplete.
- Running `/litellm-refresh` calls generic Pi command, not normal prompt.
- Original command text and arguments are preserved.
- Builtin `/model` still opens model picker even if dynamic `/model` exists.
- Builtin `/login` still opens login flow even if dynamic `/login` exists.
- Builtin `/reload` still reloads session even if dynamic `/reload` exists.
- pi-crust extension `/fork` wins over Pi dynamic `/fork`.
- Unknown command does not call prompt or generic command.
- Command discovery failure does not break builtins.
- Command discovery failure falls back safely for unknown slash.
- Dynamic commands refresh after `/reload`.
- Session switch refreshes dynamic commands and prevents stale command leakage.
- No-active-session slash command shows a notice.
- Generic command `notify`, `confirm`, `select`, `input`, and `editor` events work through `ExtensionUiHost`.
- Draft clearing/error behavior is explicit: success clears draft; failure keeps or reports clearly.

### 9. Extension UI host / reducer tests

- Notify request displays without requiring response.
- Select/input/editor/confirm requests send correct responses.
- Cancel sends `{ cancelled: true }`.
- Duplicate request IDs do not duplicate dialogs.
- `setStatus`, `setWidget`, `setTitle`, and `set_editor_text` are safe.

### 10. Browser tests

File: `tests/playwright/session-chat.spec.ts`

- `/litellm-refresh` dynamic command calls generic endpoint, not prompt endpoint.
- `/lite` autocomplete shows `litellm-refresh`.
- Dynamic collision `/model` still opens model picker.
- `/skill:brave-search` routes generically.
- LiteLLM success/failure notifications appear.
- Mobile viewport autocomplete remains usable.

### 11. Real-ish Pi extension smoke test

Optional but valuable:

- Create a temporary Pi extension that registers `/generic-smoke` and calls `ctx.ui.notify`.
- Launch real Pi RPC with `--extension` and `--no-session`.
- Assert `get_commands` includes `generic-smoke`.
- Assert prompt `/generic-smoke hello` emits notification.
- No model API key should be required.

### 12. Security and race tests

- Malicious command names are ignored or safely displayed, never interpreted as routes.
- HTML in descriptions is escaped.
- Command metadata paths do not become routing authority.
- Generic command endpoint requires a session.
- Attachments with slash commands are rejected or explicitly ignored.
- Prompt length limits apply.
- Active-session command fetch races do not leak commands between sessions.
- Stale commands are removed after reload.

## Definition of done

- `/litellm-refresh` appears in autocomplete if Pi returns it from `get_commands`.
- `/litellm-refresh` executes through Pi RPC without custom pi-crust code.
- Extension UI notifications are visible in pi-crust.
- Skills and prompt templates route generically.
- Builtins retain web-native behavior.
- Unknown slash commands are not sent to the model.
- Generic commands do not hang waiting for `agent_end`.
- Dynamic command lists refresh on session switch and reload.
- Collisions, malformed metadata, failures, and races are covered by tests.
