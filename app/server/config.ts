/**
 * Server configuration sourced from environment variables.
 *
 * Getters defer env reads until first access (via {@link getEnv}), so merely
 * importing this module needs no `--allow-env` and works under both Deno and
 * Cloudflare Workers.
 *
 * | Env var                | Default                    | Used by                       |
 * | ---------------------- | -------------------------- | ----------------------------- |
 * | `IDP_ORIGIN`           | `https://id.kbn.one`       | JWKS URL + expected `iss`     |
 * | `STORAGE_ORIGIN`       | (request origin)           | admin-login `redirect_uri`    |
 * | `SYSTEM_ADMIN_USER_IDS`| (unset → admin closed)     | admin gate                    |
 * | `R2_ACCOUNT_ID`        | (required for R2)          | S3 endpoint host              |
 * | `R2_ACCESS_KEY_ID`     | (required for R2)          | SigV4 signing                 |
 * | `R2_SECRET_ACCESS_KEY` | (required for R2)          | SigV4 signing                 |
 * | `R2_BUCKET`            | (required for R2)          | object path                   |
 * | `R2_S3_ENDPOINT`       | `https://<acct>.r2.cloudflarestorage.com` | override endpoint |
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
  get r2AccountId(): string | undefined {
    return getEnv("R2_ACCOUNT_ID");
  },
  get r2AccessKeyId(): string | undefined {
    return getEnv("R2_ACCESS_KEY_ID");
  },
  get r2SecretAccessKey(): string | undefined {
    return getEnv("R2_SECRET_ACCESS_KEY");
  },
  get r2Bucket(): string | undefined {
    return getEnv("R2_BUCKET");
  },
  /**
   * R2 S3-compatible endpoint. Defaults to the account-scoped host; override
   * (e.g. for a jurisdiction-specific endpoint) with `R2_S3_ENDPOINT`.
   */
  get r2Endpoint(): string {
    const explicit = getEnv("R2_S3_ENDPOINT");
    if (explicit) return explicit.replace(/\/+$/, "");
    return `https://${this.r2AccountId}.r2.cloudflarestorage.com`;
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
