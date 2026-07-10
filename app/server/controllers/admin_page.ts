/**
 * `GET /admin` — the object-management page shell (public HTML). The API calls
 * the page makes are gated by `authenticate` + `requireSystemAdmin`, so a
 * non-admin can load the page but every action returns 401/403.
 */

import type { RequestContext } from "@remix-run/fetch-router";

import { config, storageOrigin } from "../config.ts";
import { renderAdminPage } from "../ui/admin_page.ts";

export const adminPageAction = {
  handler(context: RequestContext): Response {
    const html = renderAdminPage({
      idpOrigin: config.idpOrigin,
      storageOrigin: storageOrigin(context.request),
    });
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
