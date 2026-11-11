/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Fail closed when unset. */
export function cronAuthorized(request: Request, secret = process.env.CRON_SECRET?.trim()): boolean {
  if (!secret) return false;
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}
