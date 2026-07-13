import { assertEquals } from "@std/assert";

import { requestOriginHost } from "./origin.ts";

function req(origin?: string): Request {
  const headers = new Headers();
  if (origin !== undefined) headers.set("origin", origin);
  return new Request("https://storage.test/upload-url", {
    method: "POST",
    headers,
  });
}

Deno.test("requestOriginHost extracts the hostname", () => {
  assertEquals(
    requestOriginHost(req("https://app.example.com")),
    "app.example.com",
  );
  assertEquals(
    requestOriginHost(req("https://sub.example.com:8443")),
    "sub.example.com",
  );
});

Deno.test("requestOriginHost returns undefined for missing/invalid origin", () => {
  assertEquals(requestOriginHost(req(undefined)), undefined);
  assertEquals(requestOriginHost(req("not a url")), undefined);
});
