import { assertEquals, assertStringIncludes } from "@std/assert";

import { presignGet, presignPut } from "./r2.ts";

const R2_ENV = {
  R2_ACCOUNT_ID: "acct123",
  R2_ACCESS_KEY_ID: "AKIDEXAMPLE",
  R2_SECRET_ACCESS_KEY: "wJalrXUtnFEMI-EXAMPLE-KEY",
  R2_BUCKET: "mybucket",
};

async function withR2Env<T>(fn: () => Promise<T>): Promise<T> {
  for (const [k, v] of Object.entries(R2_ENV)) Deno.env.set(k, v);
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(R2_ENV)) Deno.env.delete(k);
  }
}

Deno.test("presignPut bakes metadata into the signed URL", async () => {
  await withR2Env(async () => {
    const { url, headers } = await presignPut({
      key: "app.example.com/20260710/01ABC-photo.png",
      contentType: "image/png",
      metadata: { "upload-origin": "app.example.com", "user-id": "user_1" },
    });

    assertStringIncludes(url, "acct123.r2.cloudflarestorage.com");
    assertStringIncludes(
      url,
      "/mybucket/app.example.com/20260710/01ABC-photo.png",
    );
    assertStringIncludes(url, "X-Amz-Expires=300");
    assertStringIncludes(url, "X-Amz-Signature=");

    const signed = new URL(url).searchParams.get("X-Amz-SignedHeaders") ?? "";
    // The metadata + content-type must be signed so the browser cannot alter them.
    assertStringIncludes(signed, "x-amz-meta-upload-origin");
    assertStringIncludes(signed, "x-amz-meta-user-id");
    assertStringIncludes(signed, "content-type");

    // Headers the caller must replay verbatim on the PUT.
    assertEquals(headers["x-amz-meta-upload-origin"], "app.example.com");
    assertEquals(headers["x-amz-meta-user-id"], "user_1");
    assertEquals(headers["content-type"], "image/png");
  });
});

Deno.test("presignGet builds a signed URL for a key", async () => {
  await withR2Env(async () => {
    const url = await presignGet({ key: "a/b/c.txt", expiresIn: 120 });
    assertStringIncludes(url, "/mybucket/a/b/c.txt");
    assertStringIncludes(url, "X-Amz-Expires=120");
    assertStringIncludes(url, "X-Amz-Signature=");
  });
});
