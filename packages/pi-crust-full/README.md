# pi-crust-full

The "batteries-included" entry point for [pi-crust](https://github.com/cemoody/pi-crust).

```bash
npx pi-crust-full
```

That's it. This package depends on `pi-crust` (and, in the future, every official extension), so a single `npx` invocation gets you the whole experience without needing to remember a longer install command.

## What this is

`pi-crust-full` is a meta-package. It contains no runtime code of its own — its `bin` simply re-execs the `pi-crust` CLI from the `pi-crust` package it pulled in. The official extensions live in their own packages and are listed as `dependencies` of this one, so a single `npx pi-crust-full` invocation gets you the complete experience:

- [`pi-crust`](https://www.npmjs.com/package/pi-crust) — core
- [`@cemoody/pi-crust-ext-artifacts`](https://www.npmjs.com/package/@cemoody/pi-crust-ext-artifacts) — `show_artifact`
- [`@cemoody/pi-crust-ext-presentations`](https://www.npmjs.com/package/@cemoody/pi-crust-ext-presentations) — `show_presentation`, `list_presentation_templates`
- [`@cemoody/pi-crust-ext-pr-story`](https://github.com/cemoody/pi-crust-ext-pr-story) — `show_pr_story`
- [`@cemoody/pi-crust-ext-branching`](https://www.npmjs.com/package/@cemoody/pi-crust-ext-branching) — `/fork`, `/clone`
- [`@cemoody/pi-crust-ext-schedule`](https://www.npmjs.com/package/@cemoody/pi-crust-ext-schedule) — cron-scheduled prompts

It also enables full-distribution-only features that the base `pi-crust` ships dormant:

- **Browser Terminal** — a PTY-backed shell (wterm) available from the sidebar, scoped to a session's working directory. Enabled here via `PI_CRUST_ENABLE_TERMINAL=1`; the base `npx pi-crust` does not show it.

## When to install `pi-crust` directly instead

If you want a lean install with only the core (and you'll add extensions yourself), use:

```bash
npx pi-crust
```

The base distribution omits the optional features above. To turn on just the
Terminal without the full meta-package, set the flag yourself:

```bash
PI_CRUST_ENABLE_TERMINAL=1 npx pi-crust
```

## License

MIT.
