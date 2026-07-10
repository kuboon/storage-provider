/**
 * Cloudflare R2 access over the S3-compatible API.
 *
 * We never use an R2 binding, so the exact same code runs under Deno (local /
 * tests) and on Cloudflare Workers. Uploads are handled with **presigned PUT
 * URLs**: the browser PUTs straight to R2, and the upload-origin + user id are
 * baked into the URL as *signed* `x-amz-meta-*` headers, so the browser must
 * send those exact values or the signature fails (they cannot be forged).
 *
 * Signing is SigV4 via `aws4fetch` (Web-Crypto based, portable). Listing and
 * deletion are ordinary server-side signed requests.
 */

import { AwsClient } from "aws4fetch";

import { config } from "../config.ts";

/** One object as returned by `ListObjectsV2`. */
export interface R2Object {
  key: string;
  size: number;
  lastModified: string;
}

/** Presigned PUT: the URL plus the headers the browser must replay verbatim. */
export interface PresignedPut {
  url: string;
  headers: Record<string, string>;
}

const DEFAULT_EXPIRES_SECONDS = 300;

function requireR2(): {
  client: AwsClient;
  bucketUrl: string;
} {
  const accessKeyId = config.r2AccessKeyId;
  const secretAccessKey = config.r2SecretAccessKey;
  const bucket = config.r2Bucket;
  if (!accessKeyId || !secretAccessKey || !bucket || !config.r2AccountId) {
    throw new Error(
      "R2 is not configured (need R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)",
    );
  }
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
  });
  return { client, bucketUrl: `${config.r2Endpoint}/${bucket}` };
}

/** Percent-encode a key while preserving `/` path separators. */
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/**
 * Build a presigned PUT for `key`. The returned `headers` (content-type and
 * the `x-amz-meta-*` values) are part of the signature and must be sent by the
 * client on the PUT.
 */
export async function presignPut(opts: {
  key: string;
  contentType?: string;
  metadata: Record<string, string>;
  expiresIn?: number;
}): Promise<PresignedPut> {
  const { client, bucketUrl } = requireR2();
  const headers: Record<string, string> = {};
  if (opts.contentType) headers["content-type"] = opts.contentType;
  for (const [k, v] of Object.entries(opts.metadata)) {
    headers[`x-amz-meta-${k}`] = v;
  }
  const url = new URL(`${bucketUrl}/${encodeKey(opts.key)}`);
  url.searchParams.set(
    "X-Amz-Expires",
    String(opts.expiresIn ?? DEFAULT_EXPIRES_SECONDS),
  );
  const signed = await client.sign(
    new Request(url, { method: "PUT", headers }),
    { aws: { signQuery: true, allHeaders: true } },
  );
  return { url: signed.url, headers };
}

/** Build a short-lived presigned GET for `key`. */
export async function presignGet(opts: {
  key: string;
  expiresIn?: number;
}): Promise<string> {
  const { client, bucketUrl } = requireR2();
  const url = new URL(`${bucketUrl}/${encodeKey(opts.key)}`);
  url.searchParams.set(
    "X-Amz-Expires",
    String(opts.expiresIn ?? DEFAULT_EXPIRES_SECONDS),
  );
  const signed = await client.sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

function xmlTag(block: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
  return m ? m[1] : undefined;
}

/**
 * List objects under `prefix` (all pages). Returns key/size/lastModified;
 * S3 list responses do not include custom metadata (that is why origin/date
 * are encoded into the key — see `object_key.ts`).
 */
export async function listObjects(opts: {
  prefix?: string;
  maxKeys?: number;
} = {}): Promise<R2Object[]> {
  const { client, bucketUrl } = requireR2();
  const out: R2Object[] = [];
  let token: string | undefined;
  const hardCap = opts.maxKeys ?? 10_000;

  do {
    const params = new URLSearchParams({ "list-type": "2" });
    if (opts.prefix) params.set("prefix", opts.prefix);
    if (token) params.set("continuation-token", token);
    params.set("max-keys", "1000");

    const res = await client.fetch(`${bucketUrl}?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`R2 list failed: ${res.status} ${await res.text()}`);
    }
    const xml = await res.text();

    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const block = m[1]!;
      const key = xmlTag(block, "Key");
      if (!key) continue;
      out.push({
        key,
        size: Number(xmlTag(block, "Size") ?? "0"),
        lastModified: xmlTag(block, "LastModified") ?? "",
      });
      if (out.length >= hardCap) return out;
    }

    const truncated = xmlTag(xml, "IsTruncated") === "true";
    token = truncated ? xmlTag(xml, "NextContinuationToken") : undefined;
  } while (token);

  return out;
}

/** Delete a single object. Throws on a non-2xx/404 response. */
export async function deleteObject(key: string): Promise<void> {
  const { client, bucketUrl } = requireR2();
  const res = await client.fetch(`${bucketUrl}/${encodeKey(key)}`, {
    method: "DELETE",
  });
  // S3/R2 delete is idempotent — 204 on success, 404 acceptable.
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 delete failed: ${res.status} ${await res.text()}`);
  }
}
