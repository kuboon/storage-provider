/**
 * Upload-origin extraction.
 *
 * The `Origin` request header is set by the browser and cannot be forged by
 * page JavaScript cross-origin, so it reliably identifies which site an upload
 * came from. We only *record* it — the allow-listing of which origins may
 * obtain a token is already enforced by id.kbn.one at `/authorize`, so there
 * is nothing to re-check here.
 */

/** The hostname of the request's `Origin` header, or `undefined`. */
export function requestOriginHost(request: Request): string | undefined {
  const raw = request.headers.get("origin");
  if (!raw) return undefined;
  try {
    return new URL(raw).hostname || undefined;
  } catch {
    return undefined;
  }
}
