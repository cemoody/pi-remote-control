# Extension Updates — TDD Harness & Verification Plan

Feature: detect on page load whether each installed extension source is **out of
date**, and offer a one-click **Update** button that re-fetches and reloads it.

This document enumerates the tests, expectations, and verification harnesses to
write **before** implementation. Organized by layer, matching the repo's existing
conventions (`tests/unit`, `tests/integration`, `tests/e2e`, jsdom panel tests,
injectable command runners, `createTempPrcHome`, real-git integration tests).

Legend: 🟢 pure/fast unit · 🟡 integration (real fs/git/npm) · 🔵 e2e (HTTP API) · 🟣 React/jsdom · ⚫ playwright/full-UI

---

## Layer 0 — Domain decomposition (what we're actually testing)

A "source" (npm / git / local) is the unit of update, NOT an individual extension
(one source can contribute many extensions). Each source has:
- `kind`: npm | git | local
- `installedVersion` / `installedSha` (already produced by `serializeExtensionPackages`)
- `latestVersion` / `latestSha` (NEW — must be fetched)
- `pinned`: was the user explicit about a version/ref/sha?
- `updateStatus`: `up-to-date` | `update-available` | `pinned` | `local` | `unknown` | `error`

The four new capabilities each need their own harness:
1. **Pure status logic** — given installed + latest + pin, decide status.
2. **Update detection** — fetch "latest" for each kind (npm registry, git remote).
3. **Update execution** — actually re-fetch + reload (the hard part; git gotcha).
4. **UI surface** — badges + button + states in the settings panel.

---

## Layer 1 — Pure version/status logic 🟢
File: `tests/unit/extension-update-status.test.ts`

The most important layer — fast, deterministic, no I/O. A pure function
`computeUpdateStatus(source, installed, latest)`.

### semver comparison
- [ ] `1.2.3` vs `1.2.4` → update-available
- [ ] `1.2.3` vs `1.2.3` → up-to-date
- [ ] `1.10.0` vs `1.9.0` → up-to-date (numeric, not lexical — guards the classic bug)
- [ ] `2.0.0` vs `1.9.9` → up-to-date (installed ahead of "latest", e.g. prerelease)
- [ ] prerelease ordering: `1.2.3-beta.1` vs `1.2.3` → update-available
- [ ] prerelease vs prerelease: `1.2.3-beta.2` vs `1.2.3-beta.10` → update-available
- [ ] build metadata ignored: `1.2.3+build1` vs `1.2.3+build2` → up-to-date
- [ ] `v`-prefixed tags normalized: `v1.2.3` == `1.2.3`
- [ ] leading-zero / malformed installed version → `unknown` (never throws)
- [ ] missing installed version → `unknown`
- [ ] missing latest version → `unknown`

### git sha comparison
- [ ] same 12-char sha → up-to-date
- [ ] different sha → update-available
- [ ] short vs long sha prefix match (`abc1234` vs `abc1234def0`) → up-to-date
- [ ] empty/garbage sha → `unknown`

### pin semantics (intentional pins should NOT nag)
- [ ] npm `pkg@1.2.3` with newer registry version → `pinned` (not update-available)
- [ ] npm `pkg@latest` / `pkg` (no version) → eligible for update-available
- [ ] npm `pkg@^1.0.0` range → eligible (update within range? decide policy + test it)
- [ ] git `url@<sha>` (40/7-hex) → `pinned`
- [ ] git `url@v1.2.0` (tag) → `pinned`
- [ ] git `url@main` (branch) or no ref → eligible
- [ ] local path source → always `local`, never update-available

### parsePackageSource round-trips (extends existing extension-package-sources.test.ts)
- [ ] classify pinned vs unpinned for every kind
- [ ] extract package name / ref / sha cleanly for the status function

---

## Layer 2 — Update detection / "what's latest?" 🟢🟡
Files: `tests/unit/extension-update-check.test.ts`, `tests/integration/extension-update-check.test.ts`

A service `checkSourceUpdate(entry, { runner })` with an **injectable runner**
(same pattern as `PackageCommandRunner` in `packages.ts`) so unit tests never hit
the network, plus a thin integration layer that does.

### npm detection — unit (mocked runner) 🟢
- [ ] runs `npm view <pkg> version` (or `npm outdated --json`) with correct args + prefix dir
- [ ] parses a clean version string from stdout
- [ ] parses `npm outdated --json` shape (`{ current, wanted, latest }`)
- [ ] scoped package `@scope/name` handled
- [ ] runner non-zero exit → status `error`, message captured, never throws
- [ ] runner stdout garbage → status `unknown`, never throws
- [ ] honors a timeout (runner that hangs → aborts → `unknown`/`error`, not a hang)

### git detection — unit (mocked runner) 🟢
- [ ] runs `git ls-remote <url> <ref-or-HEAD>` with correct args
- [ ] parses the sha from `<sha>\t<ref>` output
- [ ] ref resolves to default branch when none specified
- [ ] missing ref on remote → `error`/`unknown`
- [ ] auth failure / network error from runner → `error`, message captured

### local detection — unit 🟢
- [ ] local source → short-circuits to `local`, never invokes runner

### batch checker 🟢
- [ ] `checkAllSources(settings)` returns one result per source, order stable
- [ ] runs concurrently but bounded (e.g. max N in flight) — assert via runner call log
- [ ] one source erroring does NOT fail the whole batch (isolation)
- [ ] dedups identical sources

### caching / freshness 🟢
- [ ] second call within TTL uses cache (runner not invoked again)
- [ ] call after TTL re-invokes runner
- [ ] `force: true` bypasses cache
- [ ] cache keyed per-source (different sources don't collide)

### integration — real tools 🟡 (gated like existing real-git test)
- [ ] real `git ls-remote` against a local bare repo created in temp home → real sha
- [ ] after a new commit + (optionally) push, re-check reports update-available
- [ ] real `npm view` against a local registry/tarball OR a fixture package
      (or skip-if-offline guard consistent with repo norms)

---

## Layer 3 — Update execution / "actually upgrade it" 🟡
File: `tests/integration/extension-update-apply.test.ts`

This is where the real risk lives (see the git-remove gotcha). Real fs + real git,
`createTempPrcHome`, `writeLocalExtensionPackage`, real git runner like the
existing install test.

### npm update
- [ ] `updateSource(npmSource)` runs `npm install <pkg>@latest --prefix <dir>`
- [ ] installed `package.json` version bumps from old → new after update
- [ ] settings.json entry preserved/normalized (no duplicate, kind stays `npm`)
- [ ] reload picks up the new code (command from updated pkg returns new behavior)

### git update (the gotcha layer — guard explicitly)
- [ ] **regression test**: confirm `removeExtensionPackage` does NOT delete files,
      and a naive remove+install does NOT update a git checkout
      (lock the current behavior so we know why we need a real update path)
- [ ] `updateSource(gitSource)` performs fetch + checkout/reset to remote ref
- [ ] local HEAD sha advances to the new remote sha after update
- [ ] dirty working tree in the checkout → defined behavior (reset hard? error? — pick + test)
- [ ] pinned git sha → update is a no-op / refused (don't move a deliberate pin)
- [ ] update then reload → activated extension reflects new commit's code

### local source
- [ ] `updateSource(localSource)` is a no-op (or clear "nothing to update" result)

### idempotency / safety
- [ ] updating an already-up-to-date source is a harmless no-op
- [ ] failed update (runner throws mid-way) leaves settings.json unchanged (atomicity)
- [ ] failed update does not corrupt the existing installed copy (still loadable)
- [ ] concurrent update requests for the same source are serialized / safe

---

## Layer 4 — HTTP API contract 🔵
Files: `tests/e2e/http-api-extension-updates.test.ts`, extend `tests/e2e/http-api-route-contract-matrix.test.ts`

New endpoints (names TBD, mirror existing `/api/extensions/packages` style):
`GET /api/extensions/updates` (check) and `POST /api/extensions/packages/update` (apply).

### check endpoint
- [ ] returns per-source status array with installed/latest/status/pinned fields
- [ ] uses injected runner in test → deterministic statuses
- [ ] never blocks indefinitely (timeout honored, returns partial with `error` entries)
- [ ] requires extension runtime (404/clear error when runtime absent, like siblings)
- [ ] auth: respects the same auth guard as other extension endpoints
- [ ] shape is stable + documented in the route contract matrix

### update endpoint
- [ ] `POST` with `{ source }` triggers update + reload, returns reload result + new `extensions`
- [ ] missing `source` → 400 `"source is required"` (parity with install/remove)
- [ ] unknown source → 400/404 with clear message
- [ ] local source → 400/clear "not updatable" (or 200 no-op — pick + lock it)
- [ ] response includes refreshed serialized extensions + updated settings
- [ ] failure path → non-200 + message, settings untouched (mirrors mutateExtensionSettings)

### contract matrix
- [ ] both new routes appear in the route-contract-matrix with method/path/auth/mount

---

## Layer 5 — Client API plumbing 🟢🟣
Files: `tests/unit/http-session-api-*.test.ts`, `session-api` type tests

- [ ] `SessionDashboardApi` gains optional `checkExtensionUpdates?()` and `updateExtensionPackage?(source)`
- [ ] `HttpSessionApi` calls the right URLs/methods/body and parses responses
- [ ] feature-detect: when host doesn't implement them, panel hides update UI (optional-method pattern, like onInstall/onRemove today)
- [ ] error responses surface as thrown Errors with server message

---

## Layer 6 — Settings panel UI 🟣
File: `tests/unit/extension-management-panel.test.tsx` (extend) + maybe new file

Version info is NOT currently passed into `ExtensionManagementPanel` — it goes to
the help dialog. So first plumb status into the panel props, then test rendering.

### rendering states (per source row, in "Sources"/"Loaded extensions")
- [ ] up-to-date → no badge / subtle "up to date", no Update button
- [ ] update-available → badge showing `installed → latest`, **Update** button enabled
- [ ] pinned → "pinned" indicator, no Update button (or disabled w/ tooltip)
- [ ] local → no update affordance
- [ ] unknown/error → muted "couldn't check" indicator, no crash
- [ ] checking-in-progress → spinner/skeleton, button disabled

### interaction
- [ ] clicking **Update** calls `onUpdate(source)` exactly once with correct source
- [ ] button shows busy state + disables siblings while one update runs (matches existing `busy` pattern)
- [ ] success → onNotice fired ("Updated X and reloaded."), list re-renders with new version
- [ ] failure → error surfaced in the existing `dialog-error` region, button re-enabled
- [ ] update of a source that contributes multiple extensions updates the *source row*, not per-extension

### page-load behavior
- [ ] on mount, panel kicks off the background update check (calls `checkExtensionUpdates` once)
- [ ] panel renders immediately without waiting for the check (no blocking)
- [ ] badges light up asynchronously when the check resolves
- [ ] check failure does not break the rest of the panel
- [ ] a global "Check for updates" / refresh affordance re-runs the check

### accessibility / a11y
- [ ] badges have accessible text (not color-only)
- [ ] buttons have aria-labels including the source name
- [ ] busy state announced (aria-busy / role=status), parity with existing rows

---

## Layer 7 — Full-stack integration 🔵🟡
File: `tests/integration/extension-update-lifecycle.test.ts`

End-to-end through the real services (no browser): install → mutate upstream →
check reports update-available → update → reload → new behavior verified.

- [ ] npm: install v1 fixture, point "latest" at v2, check → available, update → v2 active
- [ ] git: install from local repo, add upstream commit, check → available, update → new commit active
- [ ] mixed set (npm + git + local) checked in one batch returns correct per-source statuses
- [ ] update of one source does not disturb the others (settings + loaded set intact)

---

## Layer 8 — Optional browser E2E ⚫
File: `tests/playwright/extension-updates.spec.ts` (only if we want UI coverage)

- [ ] open Settings → Extensions, badges appear after load
- [ ] click Update, button shows progress, badge clears, success notice shown
- [ ] check-failure path shows muted state, page still usable

---

## Layer 9 — Edge cases, regressions & non-functional guards

### correctness
- [ ] offline / DNS failure → all remote sources `unknown`/`error`, panel still renders, no hang
- [ ] npm registry rate-limit (429) → `error` with message, no retry storm
- [ ] private/auth-gated git remote → `error`, no credential leak in messages/logs
- [ ] source contributing 0 valid extensions still gets a status row (no silent drop)
- [ ] monorepo / scoped names parse correctly end-to-end

### performance / SLO (extend http-api-performance-slo.test.ts)
- [ ] check endpoint returns within budget even with many sources (concurrency cap works)
- [ ] page-load check is non-blocking (panel TTI unaffected) — assert async, not awaited
- [ ] cache prevents redundant network calls across rapid re-renders

### safety / regressions
- [ ] git-remove-doesn't-delete-files behavior is pinned by a test BEFORE we add update,
      so the implementation can't silently regress on the assumption it relies on
- [ ] failed update is atomic: settings.json never left half-written (reuse mutateExtensionSettings guarantees)
- [ ] no `process.chdir` introduced (existing no-process-chdir.test.ts already guards repo-wide)
- [ ] no orphan runtime files / temp dirs left by checks or updates (no-orphan-runtime-files.test.ts)
- [ ] injected runners used everywhere — no test performs uncontrolled network/git by default

---

## Suggested build order (red → green per layer)
1. Layer 1 (status logic) — pure, fastest feedback, defines the data model.
2. Layer 2 unit (detection w/ mocked runner) — locks the runner contract.
3. Layer 3 integration incl. the git-remove regression guard — proves update is real.
4. Layer 4 e2e endpoints — wire detection+execution to HTTP.
5. Layers 5–6 — client api + panel UI.
6. Layers 7–8 — full lifecycle + optional browser.
7. Layer 9 woven throughout.

## Open decisions to resolve while writing tests (each becomes a locked test)
- Do we honor npm semver ranges (`^1.0.0`) for "update within range", or only flag `latest`/unpinned?
- Git dirty-checkout policy on update: hard reset vs refuse?
- Local sources on the update endpoint: 400 vs 200-noop?
- Cache TTL value + whether check auto-runs on every panel mount or is throttled.
- Endpoint names/shapes (freeze in the route-contract-matrix).
