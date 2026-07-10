/**
 * Runtime-agnostic environment variable accessor.
 *
 * On Deno, configuration comes from `Deno.env`. On Cloudflare Workers the
 * `env` object is only available inside the `fetch` handler; with the
 * `nodejs_compat` compatibility flag the platform mirrors vars + secrets into
 * `process.env`, so module-level code can read them the same way under both
 * runtimes. No worker wrapper is required — `router.ts` is the entry for both
 * `deno serve` and the Workers module format.
 *
 * Resolution order: `Deno.env` (guarded) → `process.env`.
 */

export function getEnv(key: string): string | undefined {
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
