/**
 * Object operations over a {@link Bucket}: upload, list (for the admin panel),
 * delete, and age-based prune. Pure of HTTP concerns and of the binding
 * singleton (the bucket is passed in) so it is unit-testable with a
 * {@link MemoryBucket}.
 */

import type { Bucket } from "./bucket.ts";

const DAY_MS = 86_400_000;
const DELETE_BATCH = 1000;

/** One object as shown in the admin list. */
export interface ObjectWire {
  key: string;
  size: number;
  uploaded: string;
  uploadOrigin?: string;
  userId?: string;
  /** ISO expiry (`expire-at` metadata); the scheduled prune deletes past it. */
  expireAt?: string;
}

/** customMetadata key holding an object's scheduled-deletion time (ISO 8601). */
export const EXPIRE_AT_KEY = "expire-at";

/** Store an object, recording origin/user in custom metadata. */
export async function putObject(bucket: Bucket, opts: {
  key: string;
  body: ReadableStream | ArrayBuffer | Uint8Array | null;
  contentType?: string;
  customMetadata: Record<string, string>;
}): Promise<void> {
  await bucket.put(opts.key, opts.body, {
    httpMetadata: opts.contentType
      ? { contentType: opts.contentType }
      : undefined,
    customMetadata: opts.customMetadata,
  });
}

/** List every object under `prefix` (following pagination). */
async function listAll(bucket: Bucket, prefix?: string) {
  const objects = [];
  let cursor: string | undefined;
  do {
    const res = await bucket.list({
      prefix,
      cursor,
      limit: 1000,
      include: ["customMetadata"],
    });
    objects.push(...res.objects);
    cursor = res.truncated ? res.cursor : undefined;
  } while (cursor);
  return objects;
}

/**
 * List objects for the admin panel — optionally only those older than
 * `olderThanDays` — newest first.
 */
export async function listObjects(bucket: Bucket, opts: {
  prefix?: string;
  olderThanDays?: number;
} = {}): Promise<ObjectWire[]> {
  const objects = await listAll(bucket, opts.prefix);
  const cutoff = opts.olderThanDays && opts.olderThanDays > 0
    ? Date.now() - opts.olderThanDays * DAY_MS
    : undefined;

  return objects
    .filter((o) => cutoff === undefined || o.uploaded.getTime() < cutoff)
    .sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())
    .map((o) => ({
      key: o.key,
      size: o.size,
      uploaded: o.uploaded.toISOString(),
      uploadOrigin: o.customMetadata?.["upload-origin"],
      userId: o.customMetadata?.["user-id"],
      expireAt: o.customMetadata?.[EXPIRE_AT_KEY],
    }));
}

/** Delete a single object. */
export function deleteObject(bucket: Bucket, key: string): Promise<void> {
  return bucket.delete(key);
}

/** Delete every object older than `olderThanDays`. Returns the deleted keys. */
export async function pruneObjects(bucket: Bucket, opts: {
  olderThanDays: number;
  prefix?: string;
}): Promise<string[]> {
  const cutoff = Date.now() - opts.olderThanDays * DAY_MS;
  const objects = await listAll(bucket, opts.prefix);
  const stale = objects
    .filter((o) => o.uploaded.getTime() < cutoff)
    .map((o) => o.key);

  return await deleteKeys(bucket, stale);
}

/**
 * Delete every object whose `expire-at` metadata is at or before `now`
 * (default: the current time). This is the per-object TTL the scheduled
 * (cron) handler runs; objects without an `expire-at` (e.g. stamps) are never
 * touched. Returns the deleted keys.
 */
export async function pruneExpired(
  bucket: Bucket,
  now: number = Date.now(),
): Promise<string[]> {
  const objects = await listAll(bucket);
  const expired = objects
    .filter((o) => {
      const at = o.customMetadata?.[EXPIRE_AT_KEY];
      if (!at) return false;
      const t = Date.parse(at);
      return Number.isFinite(t) && t <= now;
    })
    .map((o) => o.key);

  return await deleteKeys(bucket, expired);
}

/** Delete keys in batches (R2 caps a bulk delete at 1000). Returns them. */
async function deleteKeys(bucket: Bucket, keys: string[]): Promise<string[]> {
  for (let i = 0; i < keys.length; i += DELETE_BATCH) {
    await bucket.delete(keys.slice(i, i + DELETE_BATCH));
  }
  return keys;
}
