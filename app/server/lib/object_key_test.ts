import { assertEquals, assertMatch } from "@std/assert";

import { buildObjectKey, safeFilename, yyyymmdd } from "./object_key.ts";

Deno.test("yyyymmdd formats a UTC date", () => {
  assertEquals(yyyymmdd(new Date("2026-07-10T23:59:00Z")), "20260710");
  assertEquals(yyyymmdd(new Date("2026-01-02T00:00:00Z")), "20260102");
});

Deno.test("safeFilename keeps safe chars and trims", () => {
  assertEquals(safeFilename("My Photo (1).PNG"), "My-Photo-1-.PNG");
  assertEquals(safeFilename("../../etc/passwd"), "etc-passwd");
  assertEquals(safeFilename("     "), "");
});

Deno.test("buildObjectKey prefixes origin host and date", () => {
  const key = buildObjectKey({
    originHost: "app.example.com",
    filename: "report.pdf",
    at: new Date("2026-07-10T12:00:00Z"),
    id: "01ABC",
  });
  assertEquals(key, "app.example.com/20260710/01ABC-report.pdf");
});

Deno.test("buildObjectKey falls back to 'unknown' origin and omits filename", () => {
  const key = buildObjectKey({
    originHost: undefined,
    at: new Date("2026-07-10T12:00:00Z"),
    id: "01XYZ",
  });
  assertEquals(key, "unknown/20260710/01XYZ");
});

Deno.test("buildObjectKey generates a ulid when no id given", () => {
  const key = buildObjectKey({
    originHost: "x.test",
    at: new Date("2026-07-10T12:00:00Z"),
  });
  assertMatch(key, /^x\.test\/20260710\/[0-9A-HJKMNP-TV-Z]{26}$/);
});
