/**
 * Object management API (system admin only — gated by `requireSystemAdmin`).
 *
 * `GET  /admin/objects?prefix=&olderThanDays=` — list stored objects.
 * `DELETE /admin/objects?key=`                 — delete one object.
 * `POST /admin/objects/prune` `{olderThanDays, prefix?}` — bulk-delete old data.
 */

import type { RequestContext } from "@remix-run/fetch-router";

import { getBucket } from "../lib/bucket.ts";
import { deleteObject, listObjects, pruneObjects } from "../lib/objects.ts";

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const adminObjectsController = {
  async list(context: RequestContext) {
    const params = new URL(context.request.url).searchParams;
    const prefix = params.get("prefix") ?? undefined;
    const olderThanDaysRaw = Number(params.get("olderThanDays"));
    const olderThanDays = Number.isFinite(olderThanDaysRaw)
      ? olderThanDaysRaw
      : undefined;

    const objects = await listObjects(getBucket(), { prefix, olderThanDays });
    return Response.json({ objects });
  },

  async remove(context: RequestContext) {
    const key = new URL(context.request.url).searchParams.get("key");
    if (!key) return jsonError(400, "key is required");
    await deleteObject(getBucket(), key);
    return Response.json({ ok: true, key });
  },

  async prune(context: RequestContext) {
    const body = await context.request.json().catch(() => null) as
      | { olderThanDays?: unknown; prefix?: unknown }
      | null;
    const days = Number(body?.olderThanDays);
    if (!Number.isFinite(days) || days <= 0) {
      return jsonError(400, "olderThanDays must be a positive number");
    }
    const prefix = typeof body?.prefix === "string" ? body.prefix : undefined;

    const deleted = await pruneObjects(getBucket(), {
      olderThanDays: days,
      prefix,
    });
    return Response.json({ deleted: deleted.length, keys: deleted });
  },
};
