/**
 * Local build entrypoint — bundles client JS into `app/bundled/`.
 */

import { buildJs } from "./js.ts";

export { buildJs };

if (import.meta.main) {
  const js = await buildJs();
  console.log("[bundler] js complete", js);
}
