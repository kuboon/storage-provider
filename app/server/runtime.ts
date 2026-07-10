/**
 * Runtime detection.
 *
 * The same server graph runs under two runtimes:
 *
 * - **Deno** — local `deno serve` and unit tests (`deno test`). Has the
 *   `Deno` global, a real filesystem, and `Deno.env`.
 * - **Cloudflare Workers** — production and `wrangler dev`. No filesystem and
 *   no `Deno` global; `env` is only available inside the `fetch` handler and
 *   is surfaced to module code via `process.env` (nodejs_compat).
 *
 * Static file serving is the only place that branches: under Deno the router
 * serves `app/bundled` + `app/static` from disk; on Workers the platform
 * `ASSETS` binding serves the merged `dist/public` before the worker runs.
 */

/** True when running under the Deno runtime (local dev / tests). */
export const isDeno: boolean =
  typeof (globalThis as { Deno?: unknown }).Deno !== "undefined";
