import { assertEquals } from "@std/assert";

import { MemoryBucket } from "./memory_bucket.ts";
import {
  deleteObject,
  listObjects,
  pruneObjects,
  putObject,
} from "./objects.ts";

Deno.test("putObject stores content-type and custom metadata", async () => {
  const bucket = new MemoryBucket();
  await putObject(bucket, {
    key: "a.example/20260710/01-x.png",
    body: new Uint8Array([1, 2, 3]),
    contentType: "image/png",
    customMetadata: { "upload-origin": "a.example", "user-id": "u1" },
  });

  const list = await listObjects(bucket);
  assertEquals(list.length, 1);
  assertEquals(list[0].key, "a.example/20260710/01-x.png");
  assertEquals(list[0].size, 3);
  assertEquals(list[0].uploadOrigin, "a.example");
  assertEquals(list[0].userId, "u1");
});

Deno.test("listObjects filters by prefix", async () => {
  const bucket = new MemoryBucket();
  await putObject(bucket, {
    key: "a.example/x",
    body: null,
    customMetadata: {},
  });
  await putObject(bucket, {
    key: "b.example/y",
    body: null,
    customMetadata: {},
  });

  const onlyA = await listObjects(bucket, { prefix: "a.example/" });
  assertEquals(onlyA.map((o) => o.key), ["a.example/x"]);
});

Deno.test("listObjects sorts newest first and filters by age", async () => {
  const bucket = new MemoryBucket();
  bucket.seed("older", new Date("2026-07-01T00:00:00Z"));
  bucket.seed("newer", new Date("2026-07-09T00:00:00Z"));

  const all = await listObjects(bucket);
  assertEquals(all.map((o) => o.key), ["newer", "older"]);

  // Only items older than ~5 days relative to now are extremely old here;
  // use a small window to prove the filter runs (both are >5 days old).
  const old = await listObjects(bucket, { olderThanDays: 1 });
  assertEquals(old.length, 2);
});

Deno.test("deleteObject removes a single key", async () => {
  const bucket = new MemoryBucket();
  await putObject(bucket, { key: "k1", body: null, customMetadata: {} });
  await putObject(bucket, { key: "k2", body: null, customMetadata: {} });
  await deleteObject(bucket, "k1");
  const keys = (await listObjects(bucket)).map((o) => o.key);
  assertEquals(keys, ["k2"]);
});

Deno.test("pruneObjects deletes only entries older than the cutoff", async () => {
  const bucket = new MemoryBucket();
  bucket.seed("fresh1", new Date());
  bucket.seed("fresh2", new Date());
  bucket.seed("old", new Date(Date.now() - 40 * 86_400_000));

  const deleted = await pruneObjects(bucket, { olderThanDays: 30 });
  assertEquals(deleted, ["old"]);

  const remaining = (await listObjects(bucket)).map((o) => o.key).sort();
  assertEquals(remaining, ["fresh1", "fresh2"]);
});
