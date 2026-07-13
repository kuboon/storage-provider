/**
 * Runtime-agnostic environment variable accessor.
 *
 * On Deno, configuration comes from `Deno.env`. On Cloudflare Workers the
 * `env` object is only available inside the `fetch` handler, so the worker
 * entry ({@link file://./worker.ts}) calls {@link setEnvOverrides} per request
 * to publish the string-valued vars/secrets here. Module-level code (e.g.
 * {@link file://./config.ts}) then reads them lazily via {@link getEnv}.
 *
 * Binding objects (the R2 bucket, etc.) are NOT routed through here — the
 * worker entry wires those to their own singletons (see `lib/bucket.ts`).
 */

let overrides: Record<string, string | undefined> | undefined;

/**
 * Publish the request-scoped Workers `env`. Only string values are retained
 * (vars + secrets); binding objects are ignored. Idempotent and cheap.
 */
export function setEnvOverrides(env: Record<string, unknown>): void {
  const next: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") next[key] = value;
  }
  overrides = next;
}

/**
 * Read an environment variable. Resolution order:
 * 1. Workers overrides published by {@link setEnvOverrides}.
 * 2. `Deno.env` (guarded — returns undefined without `--allow-env`).
 * 3. `process.env` (Node / Workers `nodejs_compat`).
 */
export function getEnv(key: string): string | undefined {
  if (overrides && key in overrides) return overrides[key];

  const deno = (globalThis as {
    Deno?: { env?: { get(k: string): string | undefined } };
  }).Deno;
  if (deno?.env) {
    try {
      const v = deno.env.get(key);
      if (v !== undefined) return v;
    } catch {
      // Running without --allow-env; fall through.
    }
  }

  const proc = (globalThis as {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  return proc?.env?.[key];
}
