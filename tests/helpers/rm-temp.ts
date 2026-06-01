import fsp from "node:fs/promises";

/**
 * Robust recursive temp-dir removal for test teardown.
 *
 * Why this exists: several e2e tests spawn a *detached* pi RPC supervisor +
 * child (see PiRpcAdapter). `dispose()` fires a `shutdown` frame and closes
 * our socket, but it deliberately does NOT await the detached process tree
 * exiting (the supervisor is unref'd so it can outlive an API restart). That
 * means when an `afterEach` immediately does `fs.rm(tmpRoot, {recursive})`,
 * a still-draining child can write into the tree *between* rm enumerating a
 * directory and rmdir'ing it — Node then throws `ENOTEMPTY` (or `EBUSY` /
 * transient `ENOENT`) and the test fails as a flake.
 *
 * This was the recurring `tests/e2e/http-api-reload.test.ts` flake that
 * showed up as: `ENOTEMPTY: directory not empty, rmdir '/tmp/...'` under
 * full-suite parallel load (e.g. PR #217). Node's built-in `maxRetries`
 * only retries EBUSY/EMFILE/ENFILE/EPERM — NOT ENOTEMPTY — so we retry it
 * ourselves with a short backoff.
 */
export async function rmrfRetry(target: string, { attempts = 40, delayMs = 10 }: { attempts?: number; delayMs?: number } = {}): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fsp.rm(target, { recursive: true, force: true, maxRetries: 2 });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      const retryable = code === "ENOTEMPTY" || code === "EBUSY" || code === "ENOENT" || code === "EPERM";
      if (!retryable || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
