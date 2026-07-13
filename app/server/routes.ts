import { del, get, post, route } from "@remix-run/fetch-router/routes";

export const routes = route({
  // Admin page shell (public HTML; the API calls it makes are gated).
  adminPage: get("/admin"),

  // Authenticated user endpoints (any id.kbn.one user).
  uploads: route({
    upload: post("/upload"),
    download: get("/download"),
  }),

  // Object management (system admin only).
  adminObjects: route("admin/objects", {
    list: get("/"),
    remove: del("/"),
    prune: post("/prune"),
  }),
});
