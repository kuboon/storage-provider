/**
 * Auth middleware.
 *
 * - {@link authenticate} verifies the id.kbn.one DPoP-bound access token on
 *   the request (see `lib/verify_user.ts`) and exposes the user as
 *   `context.get(CurrentUser)`, or short-circuits with a 401.
 * - {@link requireSystemAdmin} composes *after* it and 403s unless the user is
 *   in `SYSTEM_ADMIN_USER_IDS`.
 */

import { createContextKey, type Middleware } from "@remix-run/fetch-router";

import { AuthError, verifyRequestUser } from "../lib/verify_user.ts";
import { isSystemAdminId } from "../lib/system_admin.ts";

/** Context key — `context.get(CurrentUser)` is the authenticated `{ id }`. */
export const CurrentUser = createContextKey<{ id: string }>();

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const authenticate: Middleware = async (context, next) => {
  try {
    const { userId } = await verifyRequestUser(context.request);
    context.set(CurrentUser, { id: userId });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 401;
    const message = error instanceof Error ? error.message : "unauthorized";
    return jsonError(status, message);
  }
  return await next();
};

export const requireSystemAdmin: Middleware = (context, next) => {
  const user = context.get(CurrentUser);
  if (!user || !isSystemAdminId(user.id)) {
    return Promise.resolve(jsonError(403, "forbidden"));
  }
  return next();
};
