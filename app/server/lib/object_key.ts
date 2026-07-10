/**
 * R2 object-key layout.
 *
 * `<originHost>/<yyyymmdd>/<ulid>[-<safeFilename>]`
 *
 * Putting the upload origin and date at the front of the key means the admin
 * list (S3 `ListObjectsV2`, which returns keys + `LastModified` + size but
 * *not* custom metadata) can show which site an object came from and when,
 * without a per-object `HeadObject`. The `ulid` keeps keys unique and roughly
 * time-sortable; the sanitized original filename is appended for readability.
 */

import { ulid } from "@std/ulid";

/** yyyymmdd in UTC. `at` is passed in so callers stay deterministic/testable. */
export function yyyymmdd(at: Date): string {
  const y = at.getUTCFullYear().toString().padStart(4, "0");
  const m = (at.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = at.getUTCDate().toString().padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * Reduce an arbitrary filename to a short, path-safe slug. Keeps ASCII
 * letters, digits, dot, dash and underscore; collapses everything else to
 * `-`; trims to 80 chars. Returns "" when nothing usable remains.
 */
export function safeFilename(name: string): string {
  return name
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.\-]+|[.\-]+$/g, "")
    .slice(0, 80);
}

/** Host segment: hostname or `unknown` when the origin was not recorded. */
function originSegment(originHost: string | undefined): string {
  const h = (originHost ?? "").trim();
  return h.length > 0 ? h : "unknown";
}

/** Build a fresh object key for an upload. */
export function buildObjectKey(opts: {
  originHost: string | undefined;
  filename?: string;
  at: Date;
  id?: string;
}): string {
  const id = opts.id ?? ulid();
  const slug = opts.filename ? safeFilename(opts.filename) : "";
  const last = slug ? `${id}-${slug}` : id;
  return `${originSegment(opts.originHost)}/${yyyymmdd(opts.at)}/${last}`;
}
