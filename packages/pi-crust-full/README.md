# pi-crust-full

The "batteries-included" entry point for [pi-crust](https://github.com/cemoody/pi-crust).

```bash
npx pi-crust-full
```

That's it. This package depends on `pi-crust` (and, in the future, every official extension), so a single `npx` invocation gets you the whole experience without needing to remember a longer install command.

## What this is

`pi-crust-full` is a meta-package. It contains no runtime code of its own — its `bin` simply re-execs the `pi-crust` CLI from the `pi-crust` package it pulled in. Today the four built-in extensions still live inside `pi-crust` itself; as they are extracted into separate packages they will be added to this meta-package's `dependencies` so the one-liner above keeps working unchanged.

## When to install `pi-crust` directly instead

If you want a lean install with only the core (and you'll add extensions yourself), use:

```bash
npx pi-crust
```

## License

MIT.
