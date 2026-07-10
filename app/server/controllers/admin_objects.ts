/**
 * Object management API (system admin only — gated by `requireSystemAdmin`).
 *
 * `GET  /admin/objects?prefix=&olderThanDays=` — list stored objects.
 * `DELETE /admin/objects?key=`                 — delete one object.
 * `POST /admin/objects/prune` `{olderThanDays, prefix?}` — bulk-delete old data.
 */

import type { RequestContext } from "@remix-run/fetch-router";

import { deleteObject, listObjects, type R2Object } from "../lib/r2.ts";

const DAY_MS = 86_400_000;

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function newestFirst(a: R2Object, b: R2Object): number {
  return Date.parse(b.lastModified) - Date.parse(a.lastModified);
}

export const adminObjectsController = {
  async list(context: RequestContext) {
    const params = new URL(context.request.url).searchParams;
    const prefix = params.get("prefix") ?? undefined;
    const olderThanDays = Number(params.get("olderThanDays"));

    let objects = await listObjects({ prefix });
    if (Number.isFinite(olderThanDays) && olderThanDays > 0) {
      const cutoff = Date.now() - olderThanDays * DAY_MS;
      objects = objects.filter((o) => Date.parse(o.lastModified) < cutoff);
    }
    objects.sort(newestFirst);
    return Response.json({ objects });
  },

  async remove(context: RequestContext) {
    const key = new URL(context.request.url).searchParams.get("key");
    if (!key) return jsonError(400, "key is required");
    await deleteObject(key);
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

    const cutoff = Date.now() - days * DAY_MS;
    const objects = await listObjects({ prefix });
    const stale = objects.filter((o) => Date.parse(o.lastModified) < cutoff);

    const deleted: string[] = [];
    for (const o of stale) {
      await deleteObject(o.key);
      deleted.push(o.key);
    }
    return Response.json({ deleted: deleted.length, keys: deleted });
  },
};
