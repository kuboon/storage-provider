/**
 * storage-provider — Remix v3 fetch-router.
 *
 * This module's default export is the entry for **both** runtimes:
 *   - Deno:    `deno serve -P ./router.ts`
 *   - Workers: `main: dist/worker.js` (bundled from this file). The router is
 *     a standard Web fetch handler, so no separate worker wrapper is needed;
 *     vars/secrets are read from `process.env` under `nodejs_compat`.
 *
 * Static assets (`app/bundled` + `app/static`) are served from disk only under
 * Deno; on Workers the platform `ASSETS` binding serves the merged
 * `dist/public` before the worker runs (see `wrangler.jsonc`).
 */

import {
  createMiddleware,
  createRouter,
  type Middleware,
} from "@remix-run/fetch-router";
import { cors } from "@remix-run/cors-middleware";
import { staticFiles } from "@remix-run/static-middleware";

import { isDeno } from "./runtime.ts";
import { authenticate, requireSystemAdmin } from "./middleware/auth.ts";
import { adminObjectsController } from "./controllers/admin_objects.ts";
import { adminPageAction } from "./controllers/admin_page.ts";
import { uploadController } from "./controllers/upload.ts";
import { routes } from "./routes.ts";

// Token-authenticated (not cookie) → CORS can safely reflect any origin.
const corsMiddleware = cors({
  origin: (origin) => origin ?? "*",
  allowedHeaders: ["content-type", "authorization", "dpop"],
});

const globalMiddleware: Middleware[] = [corsMiddleware];
if (isDeno) {
  globalMiddleware.push(
    staticFiles(new URL("../bundled", import.meta.url).pathname),
    staticFiles(new URL("../static", import.meta.url).pathname),
  );
}

const router = createRouter({ middleware: globalMiddleware });

router.get(routes.adminPage, adminPageAction);

router.map(routes.uploads, {
  middleware: createMiddleware(authenticate),
  actions: uploadController,
});

router.map(routes.adminObjects, {
  middleware: createMiddleware(authenticate, requireSystemAdmin),
  actions: adminObjectsController,
});

export default router;
