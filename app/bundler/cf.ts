/**
 * Cloudflare Workers build. Produces everything `wrangler deploy` needs:
 *
 * - `dist/worker.js` — the server, bundled from `app/server/router.ts` with
 *   `Deno.bundle`. Deno resolves all jsr/npm/workspace specifiers (which
 *   wrangler/esbuild cannot), inlining them into a single ESM file. Only
 *   `node:*` / `cloudflare:*` builtins are left external; `wrangler.jsonc`
 *   enables `nodejs_compat` for the former.
 * - `dist/public/` — static assets (bundled client JS + `app/static`), served
 *   by the Workers `ASSETS` binding.
 *
 * The router's default export is a Web fetch handler, so it doubles as the
 * Workers module entry — no separate worker wrapper.
 *
 * Run via `deno task build:cf`.
 */

import { buildJs } from "./js.ts";

const DIST = new URL("../../dist/", import.meta.url);
const PUBLIC = new URL("public/", DIST);
const ASSET_SOURCES = ["../bundled/", "../static/"] as const;

async function copyAssets() {
  await Deno.mkdir(PUBLIC, { recursive: true });
  for (const dir of ASSET_SOURCES) {
    const src = new URL(dir, import.meta.url);
    for await (const entry of Deno.readDir(src)) {
      if (!entry.isFile) continue;
      await Deno.copyFile(
        new URL(entry.name, src),
        new URL(entry.name, PUBLIC),
      );
    }
  }
}

async function bundleWorker() {
  await Deno.mkdir(DIST, { recursive: true });
  const result = await Deno.bundle({
    entrypoints: [import.meta.resolve("../server/router.ts")],
    outputDir: new URL(".", DIST).pathname,
    platform: "browser",
    format: "esm",
    minify: true,
    sourcemap: "linked",
    external: ["node:*", "cloudflare:*"],
    write: true,
  });
  if (!result.success) {
    console.error("[build:cf] worker bundle failed", result);
    throw new Error("worker bundle failed");
  }
  // Deno.bundle names the output after the entry (router.js); wrangler expects
  // dist/worker.js.
  await Deno.rename(new URL("router.js", DIST), new URL("worker.js", DIST));
  await Deno.rename(
    new URL("router.js.map", DIST),
    new URL("worker.js.map", DIST),
  ).catch(() => {});
}

if (import.meta.main) {
  await buildJs({ minify: true });
  await Promise.all([copyAssets(), bundleWorker()]);
  console.log("[build:cf] done → dist/worker.js + dist/public/");
}
