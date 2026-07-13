/**
 * System-admin gate.
 *
 * A "system admin" is any id.kbn.one user whose id is listed in the
 * `SYSTEM_ADMIN_USER_IDS` env var. Only they may list / delete / prune stored
 * objects. Kept a pure function of (userId, allow-list) so it is trivially
 * testable and swappable for a KV-backed role later.
 *
 * When the env var is unset the allow-list is empty, so the admin surface is
 * closed by default (no one is admin) rather than open.
 */

import { config } from "../config.ts";

/** Whether `userId` is a system admin per the given allow-list. */
export function isSystemAdminId(
  userId: string,
  adminIds: readonly string[] = config.systemAdminUserIds,
): boolean {
  return adminIds.includes(userId);
}
