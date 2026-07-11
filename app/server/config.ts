/**
 * Server configuration sourced from environment variables.
 *
 * Getters defer env reads until first access (via {@link getEnv}), so merely
 * importing this module needs no `--allow-env` and works under both Deno and
 * Cloudflare Workers. The R2 bucket is a binding, not an env var — see
 * `lib/bucket.ts`.
 *
 * | Env var                 | Default              | Used by                   |
 * | ----------------------- | -------------------- | ------------------------- |
 * | `IDP_ORIGIN`            | `https://id.kbn.one` | JWKS URL + expected `iss` |
 * | `STORAGE_ORIGIN`        | (request origin)     | admin-login `redirect_uri`|
 * | `SYSTEM_ADMIN_USER_IDS` | (unset → admin closed)| admin gate               |
 */

import { getEnv } from "./env.ts";

export const config = {
  get idpOrigin(): string {
    return getEnv("IDP_ORIGIN") ?? "https://id.kbn.one";
  },
  get jwksUrl(): string {
    return new URL("/.well-known/jwks.json", this.idpOrigin).toString();
  },
  /** Comma-separated list of user ids granted system-admin powers. */
  get systemAdminUserIds(): string[] {
    return (getEnv("SYSTEM_ADMIN_USER_IDS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  },
};

/**
 * This service's own origin, used as the `/authorize` `redirect_uri` for the
 * admin sign-in flow. `STORAGE_ORIGIN` pins it explicitly; otherwise it is
 * derived from the incoming request (fine for local dev / single-origin).
 */
export function storageOrigin(request: Request): string {
  return getEnv("STORAGE_ORIGIN") ?? new URL(request.url).origin;
}
