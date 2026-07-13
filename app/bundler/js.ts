/**
 * Client JS bundling via `Deno.bundle` (unstable).
 *
 * Each client entry is compiled to a same-named `.js` under `app/bundled/`,
 * which the server serves through `staticFiles` (Deno) / `ASSETS` (Workers).
 * `@kuboon/dpop` (jsr) and its deps are inlined by Deno for the browser.
 */

const CLIENT_ENTRIES = [
  "admin.ts",
] as const;

export async function buildJs(
  { minify = false, write = true }: { minify?: boolean; write?: boolean } = {},
) {
  const entrypoints = CLIENT_ENTRIES.map((p) =>
    import.meta.resolve(`../client/${p}`)
  );
  return await Deno.bundle({
    entrypoints,
    outputDir: new URL("../bundled", import.meta.url).pathname,
    platform: "browser",
    sourcemap: "linked",
    minify,
    write,
  });
}
