import { assertEquals } from "@std/assert";

import { isSystemAdminId } from "./system_admin.ts";

Deno.test("isSystemAdminId matches the allow-list", () => {
  const admins = ["user_a", "user_b"];
  assertEquals(isSystemAdminId("user_a", admins), true);
  assertEquals(isSystemAdminId("user_b", admins), true);
  assertEquals(isSystemAdminId("user_c", admins), false);
});

Deno.test("isSystemAdminId is closed when the allow-list is empty", () => {
  assertEquals(isSystemAdminId("user_a", []), false);
});
