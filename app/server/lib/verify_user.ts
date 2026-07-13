/**
 * Authenticate a request as an id.kbn.one user.
 *
 * id.kbn.one issues a DPoP-bound ES256 access token (`jws`, from
 * `GET /session`) and publishes its verification keys at
 * `/.well-known/jwks.json`. A resource server therefore needs no shared
 * secret and no introspection call — it verifies the token offline and
 * confirms the caller holds the bound DPoP key:
 *
 * 1. `jwtVerify(jws, JWKS, { issuer: IDP_ORIGIN })` → `sub` (userId) + `cnf.jkt`.
 * 2. Verify the RFC 9449 `DPoP` proof on this request (signature, `htm`/`htu`,
 *    `iat` window) via `@kuboon/dpop`.
 * 3. Confirm the proof's JWK thumbprint equals the token's `cnf.jkt` — i.e.
 *    the caller signing this request owns the key the token is bound to.
 *
 * The proof produced by `@kuboon/dpop` on the client carries no `ath`, so the
 * binding is enforced here by the thumbprint match (step 3) rather than by
 * `verifyDpopProof`'s optional access-token option.
 */

import {
  createRemoteJWKSet,
  type JWTPayload,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import { verifyDpopProofFromRequest } from "@kuboon/dpop/server.ts";
import { computeThumbprint } from "@kuboon/dpop/common.ts";

import { config } from "../config.ts";

export interface VerifiedUser {
  userId: string;
}

/** Thrown on any authentication failure; carries the HTTP status to return. */
export class AuthError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

let cachedUrl: string | undefined;
let cachedJwks: JWTVerifyGetKey | undefined;

/** Lazily build (and cache) the remote JWKS resolver for the IdP. */
function idpJwks(): JWTVerifyGetKey {
  const url = config.jwksUrl;
  if (url !== cachedUrl || !cachedJwks) {
    cachedUrl = url;
    cachedJwks = createRemoteJWKSet(new URL(url));
  }
  return cachedJwks;
}

const BEARER_RE = /^(?:Bearer|DPoP)\s+(.+)$/i;

export interface VerifyUserOptions {
  /** Override the JWKS key resolver (tests inject a local key getter). */
  keys?: JWTVerifyGetKey;
}

/**
 * Verify the calling id.kbn.one user. Throws {@link AuthError} on any failure.
 */
export async function verifyRequestUser(
  request: Request,
  opts: VerifyUserOptions = {},
): Promise<VerifiedUser> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = BEARER_RE.exec(authorization);
  if (!match) throw new AuthError(401, "missing access token");
  const token = match[1]!.trim();

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, opts.keys ?? idpJwks(), {
      issuer: config.idpOrigin,
    }));
  } catch {
    throw new AuthError(401, "invalid access token");
  }

  const userId = typeof payload.sub === "string" ? payload.sub : "";
  const jkt = (payload.cnf as { jkt?: string } | undefined)?.jkt;
  if (!userId) throw new AuthError(401, "token has no subject");
  if (typeof jkt !== "string" || !jkt) {
    throw new AuthError(401, "token is not DPoP-bound");
  }

  const proof = await verifyDpopProofFromRequest(request);
  if (!proof.valid) {
    throw new AuthError(401, `invalid DPoP proof: ${proof.error}`);
  }

  const proofJkt = await computeThumbprint(proof.jwk);
  if (proofJkt !== jkt) {
    throw new AuthError(401, "DPoP key is not bound to this token");
  }

  return { userId };
}
