/**
 * Client IP as seen by Apache: mod_remoteip takes CF-Connecting-IP only from Cloudflare's ranges,
 * and mod_proxy appends that address as the LAST X-Forwarded-For entry. Earlier entries (and a
 * raw CF-Connecting-IP header) can be forged by the client, so they are ignored.
 */
export function clientIp(headers: Headers | Record<string, string | string[] | undefined>): string {
  const get = (k: string) => (headers instanceof Headers ? headers.get(k) : (headers[k] as string | undefined)) ?? '';
  const xff = String(get('x-forwarded-for'));
  return xff.split(',').map((s) => s.trim()).filter(Boolean).pop() || 'local';
}
