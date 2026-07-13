/**
 * In-memory {@link Bucket} for local `deno serve` and unit tests. Not for
 * production — it buffers each object in memory and does not persist. Good
 * enough for small dev files; real deployments use the R2 binding.
 */

import type {
  Bucket,
  BucketListOptions,
  BucketListResult,
  BucketObjectBody,
  BucketPutOptions,
} from "./bucket.ts";

interface Entry {
  data: Uint8Array;
  uploaded: Date;
  contentType?: string;
  customMetadata?: Record<string, string>;
}

async function toBytes(
  value: ReadableStream | ArrayBuffer | Uint8Array | null,
): Promise<Uint8Array> {
  if (value === null) return new Uint8Array();
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(await new Response(value).arrayBuffer());
}

export class MemoryBucket implements Bucket {
  #store = new Map<string, Entry>();

  /** Test helper: insert an object with an explicit `uploaded` time. */
  seed(
    key: string,
    uploaded: Date,
    customMetadata?: Record<string, string>,
  ): void {
    this.#store.set(key, { data: new Uint8Array(), uploaded, customMetadata });
  }

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | Uint8Array | null,
    options?: BucketPutOptions,
  ): Promise<unknown> {
    this.#store.set(key, {
      data: await toBytes(value),
      uploaded: new Date(),
      contentType: options?.httpMetadata?.contentType,
      customMetadata: options?.customMetadata,
    });
    return {};
  }

  get(key: string): Promise<BucketObjectBody | null> {
    const e = this.#store.get(key);
    if (!e) return Promise.resolve(null);
    return Promise.resolve({
      body: new Blob([e.data as unknown as BlobPart]).stream(),
      size: e.data.byteLength,
      httpMetadata: { contentType: e.contentType },
    });
  }

  delete(keys: string | string[]): Promise<void> {
    for (const k of Array.isArray(keys) ? keys : [keys]) this.#store.delete(k);
    return Promise.resolve();
  }

  list(options?: BucketListOptions): Promise<BucketListResult> {
    const prefix = options?.prefix;
    const objects = [...this.#store.entries()]
      .filter(([k]) => !prefix || k.startsWith(prefix))
      .map(([key, e]) => ({
        key,
        size: e.data.byteLength,
        uploaded: e.uploaded,
        customMetadata: e.customMetadata,
      }));
    return Promise.resolve({ objects, truncated: false });
  }
}
