/**
 * Single source of truth for the rich-artifact wire format lives in the
 * `@cemoody/pi-artifact` package under `packages/pi-artifact/`. This file
 * is a thin re-export so the host web client can keep importing from
 * `../../shared/artifact.js` without knowing about the extraction.
 *
 * Once `@cemoody/pi-artifact` is published to npm, this can become:
 *   export * from "@cemoody/pi-artifact/types";
 *
 * For now (in-repo, pre-publish), it imports the package via a relative path.
 */
export * from "../../packages/pi-artifact/src/artifact-types.js";
