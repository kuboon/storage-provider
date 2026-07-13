/**
 * R2 bucket access via the Workers binding (`env.BUCKET`).
 *
 * A minimal structural interface over the subset of the R2 API we use, so we
 * don't need `@cloudflare/workers-types`. On Cloudflare the worker entry
 * publishes the real binding via {@link setBucket}; under plain Deno (local
 * `deno serve` / tests) {@link getBucket} falls back to an in-memory bucket so
 * the app still runs without wrangler.
 */

import { isDeno } from "../runtime.ts";
import { MemoryBucket } from "./memory_bucket.ts";

export interface BucketObject {
  key: string;
  size: number;
  uploaded: Date;
  customMetadata?: Record<string, string>;
}

export interface BucketObjectBody {
  body: ReadableStream;
  size: number;
  httpMetadata?: { contentType?: string };
}

export interface BucketListResult {
  objects: BucketObject[];
  truncated: boolean;
  cursor?: string;
}

export interface BucketPutOptions {
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

export interface BucketListOptions {
  prefix?: string;
  cursor?: string;
  limit?: number;
  include?: ("customMetadata" | "httpMetadata")[];
}

/** The subset of the R2 binding this service uses. */
export interface Bucket {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | Uint8Array | null,
    options?: BucketPutOptions,
  ): Promise<unknown>;
  get(key: string): Promise<BucketObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: BucketListOptions): Promise<BucketListResult>;
}

let bucket: Bucket | undefined;

/** Publish the request-scoped R2 binding (called by the worker entry). */
export function setBucket(b: Bucket): void {
  bucket = b;
}

/**
 * The active bucket. Uses the published binding when present; otherwise (plain
 * Deno) an in-memory bucket for local dev / tests. On Workers with no binding
 * this throws — a misconfiguration.
 */
export function getBucket(): Bucket {
  if (bucket) return bucket;
  if (isDeno) {
    bucket = new MemoryBucket();
    return bucket;
  }
  throw new Error("R2 bucket binding (BUCKET) is not configured");
}
