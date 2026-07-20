/**
 * Cloudflare Workers entry point.
 *
 * `deno serve ./router.ts` is the Deno entry; this is its Workers counterpart.
 * The Remix fetch-router already speaks the Web `Request`/`Response` contract,
 * so this module is just wiring: it publishes the request-scoped `env` (string
 * vars/secrets) and the R2 bucket binding to the runtime-agnostic singletons,
 * then delegates to the router.
 *
 * The R2 binding is why this entry exists at all — binding objects are only on
 * the `env` argument, never in `process.env`. Static assets (`dist/public`)
 * are served by the platform `ASSETS` binding before this handler runs.
 */

import { setEnvOverrides } from "./env.ts";
import { type Bucket, getBucket, setBucket } from "./lib/bucket.ts";
import { pruneExpired } from "./lib/objects.ts";
import router from "./router.ts";

interface Env {
  BUCKET: Bucket;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  [key: string]: unknown;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/** Cloudflare cron-trigger event (only the fields we read). */
interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

export default {
  fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    setEnvOverrides(env);
    setBucket(env.BUCKET);
    return router.fetch(request);
  },

  /**
   * Cron trigger (see `wrangler.jsonc` → `triggers.crons`): sweep out objects
   * whose `expire-at` TTL has passed. Objects without an `expire-at` (stamps,
   * and anything uploaded without `?expireDays`) are never touched.
   */
  scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): void {
    setEnvOverrides(env);
    setBucket(env.BUCKET);
    ctx.waitUntil(pruneExpired(getBucket()));
  },
};
