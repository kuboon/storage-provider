import { assertEquals, assertRejects } from "@std/assert";
import { generateKeyPair, SignJWT } from "jose";
import { init, InMemoryKeyRepository } from "@kuboon/dpop";

import { AuthError, verifyRequestUser } from "./verify_user.ts";

const TARGET = "https://storage.test/upload-url";

async function setup() {
  // IdP signing key (what the JWKS would publish).
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const keys = () => publicKey; // stand-in for the remote JWKS resolver

  // Client DPoP key, driven through @kuboon/dpop with a capturing fetch so we
  // can grab the exact Request (DPoP header + Authorization) the browser sends.
  let captured: Request | undefined;
  const captureFetch =
    ((input: Request | string | URL, reqInit?: RequestInit) => {
      captured = new Request(input, reqInit);
      return Promise.resolve(new Response(null));
    }) as typeof fetch;

  const { fetchDpop, thumbprint } = await init({
    keyStore: new InMemoryKeyRepository(),
    fetch: captureFetch,
  });

  async function requestWith(jws: string): Promise<Request> {
    captured = undefined;
    await fetchDpop(TARGET, {
      method: "POST",
      headers: { authorization: `Bearer ${jws}` },
    });
    return captured!;
  }

  function signToken(
    claims: Record<string, unknown>,
    iss = "https://id.kbn.one",
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", typ: "JWT" })
      .setSubject(String(claims.sub ?? "user_123"))
      .setIssuer(iss)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
  }

  return { thumbprint, keys, requestWith, signToken };
}

Deno.test("accepts a valid DPoP-bound token", async () => {
  const { thumbprint, keys, requestWith, signToken } = await setup();
  const jws = await signToken({ sub: "user_123", cnf: { jkt: thumbprint } });
  const { userId } = await verifyRequestUser(await requestWith(jws), { keys });
  assertEquals(userId, "user_123");
});

Deno.test("rejects a missing Authorization header", async () => {
  const { keys } = await setup();
  await assertRejects(
    () => verifyRequestUser(new Request(TARGET, { method: "POST" }), { keys }),
    AuthError,
    "missing access token",
  );
});

Deno.test("rejects a token bound to a different DPoP key", async () => {
  const { keys, requestWith, signToken } = await setup();
  const jws = await signToken({ sub: "user_123", cnf: { jkt: "not-our-key" } });
  const req = await requestWith(jws);
  await assertRejects(
    () => verifyRequestUser(req, { keys }),
    AuthError,
    "not bound",
  );
});

Deno.test("rejects a tampered token", async () => {
  const { thumbprint, keys, requestWith, signToken } = await setup();
  const jws = await signToken({ sub: "user_123", cnf: { jkt: thumbprint } });
  const req = await requestWith(jws.slice(0, -4) + "AAAA");
  await assertRejects(
    () => verifyRequestUser(req, { keys }),
    AuthError,
    "invalid access token",
  );
});

Deno.test("rejects when the DPoP proof is for a different URL", async () => {
  const { thumbprint, keys, requestWith, signToken } = await setup();
  const jws = await signToken({ sub: "user_123", cnf: { jkt: thumbprint } });
  const original = await requestWith(jws);
  // Same DPoP header, different request URL → htu mismatch.
  const moved = new Request("https://storage.test/other", {
    method: "POST",
    headers: original.headers,
  });
  await assertRejects(
    () => verifyRequestUser(moved, { keys }),
    AuthError,
    "invalid DPoP proof",
  );
});
