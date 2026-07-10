/**
 * Upload / download URL issuance.
 *
 * `POST /upload-url` — for any authenticated id.kbn.one user. Records the
 * browser `Origin` host into the object key and as a *signed* `x-amz-meta-*`
 * header, then returns a short-lived presigned PUT the browser sends the file
 * to directly.
 *
 * `GET /download-url?key=…` — a short-lived presigned GET for a stored object.
 */

import type { RequestContext } from "@remix-run/fetch-router";

import { CurrentUser } from "../middleware/auth.ts";
import { requestOriginHost } from "../lib/origin.ts";
import { buildObjectKey } from "../lib/object_key.ts";
import { presignGet, presignPut } from "../lib/r2.ts";

const MAX_FILENAME = 200;

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const uploadController = {
  async uploadUrl(context: RequestContext) {
    const user = context.get(CurrentUser)!;
    const body = await context.request.json().catch(() => null) as
      | { filename?: unknown; contentType?: unknown }
      | null;

    const filename = typeof body?.filename === "string"
      ? body.filename.slice(0, MAX_FILENAME)
      : undefined;
    const contentType = typeof body?.contentType === "string"
      ? body.contentType
      : undefined;

    const originHost = requestOriginHost(context.request);
    const key = buildObjectKey({ originHost, filename, at: new Date() });

    const metadata: Record<string, string> = { "user-id": user.id };
    if (originHost) metadata["upload-origin"] = originHost;

    const { url, headers } = await presignPut({ key, contentType, metadata });
    return Response.json({ key, url, method: "PUT", headers });
  },

  async downloadUrl(context: RequestContext) {
    const key = new URL(context.request.url).searchParams.get("key");
    if (!key) return jsonError(400, "key is required");
    const url = await presignGet({ key });
    return Response.json({ url });
  },
};
