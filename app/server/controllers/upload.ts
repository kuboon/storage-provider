/**
 * Upload / download.
 *
 * `POST /upload?filename=…` — for any authenticated id.kbn.one user. The file
 * is the raw request body; the browser `Origin` host and the user id are
 * recorded in R2 custom metadata (and the origin/date in the object key). The
 * bytes stream straight through the Worker into R2 via the binding — no
 * buffering, so large files (up to the Worker request-body limit) are fine.
 *
 * `GET /download?key=…` — streams a stored object back (authenticated).
 */

import type { RequestContext } from "@remix-run/fetch-router";

import { CurrentUser } from "../middleware/auth.ts";
import { requestOriginHost } from "../lib/origin.ts";
import { buildObjectKey } from "../lib/object_key.ts";
import { getBucket } from "../lib/bucket.ts";
import { putObject } from "../lib/objects.ts";

// Guard rail; the platform enforces its own request-body cap too.
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const MAX_FILENAME = 200;

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const uploadController = {
  async upload(context: RequestContext) {
    const user = context.get(CurrentUser)!;
    const request = context.request;
    if (!request.body) return jsonError(400, "request body is required");

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
      return jsonError(413, "file too large");
    }

    const params = new URL(request.url).searchParams;
    const rawName = params.get("filename");
    const filename = rawName ? rawName.slice(0, MAX_FILENAME) : undefined;
    const contentType = request.headers.get("content-type") ?? undefined;

    const originHost = requestOriginHost(request);
    const key = buildObjectKey({ originHost, filename, at: new Date() });

    const customMetadata: Record<string, string> = { "user-id": user.id };
    if (originHost) customMetadata["upload-origin"] = originHost;

    await putObject(getBucket(), {
      key,
      body: request.body,
      contentType,
      customMetadata,
    });

    return Response.json({ key });
  },

  async download(context: RequestContext) {
    const key = new URL(context.request.url).searchParams.get("key");
    if (!key) return jsonError(400, "key is required");
    const obj = await getBucket().get(key);
    if (!obj) return jsonError(404, "not found");
    return new Response(obj.body, {
      headers: {
        "content-type": obj.httpMetadata?.contentType ??
          "application/octet-stream",
      },
    });
  },
};
