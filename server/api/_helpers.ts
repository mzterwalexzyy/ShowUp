import type { H3Event } from 'h3';
import { getRuntime } from '../runtime';

export async function optionalActor(event: H3Event): Promise<string | null> {
  const runtime = await getRuntime();
  const token = getCookie(event, 'showup_session');
  return token ? await runtime.app.sessionWallet(token) : null;
}
export async function actor(event: H3Event): Promise<string> {
  const wallet = await optionalActor(event);
  if (!wallet) throw createError({ statusCode: 401, statusMessage: 'AUTH_REQUIRED' });
  return wallet;
}
export async function mutation(event: H3Event): Promise<string> {
  const runtime = await getRuntime();
  if (getHeader(event, 'origin') !== runtime.app.config.domain) throw createError({ statusCode: 403, statusMessage: 'ORIGIN_REJECTED' });
  return actor(event);
}
export function sessionCookie(event: H3Event, token: string, expiresAt: number) {
  setCookie(event, 'showup_session', token, sessionCookieOptions(process.env.SHOWUP_LOCAL_TESTNET_BOOTSTRAP === '1', process.env.NODE_ENV === 'production', expiresAt));
}
export function sessionCookieOptions(localTestnetBootstrap: boolean, production: boolean, expiresAt: number) {
  return { httpOnly: true, sameSite: 'strict' as const, secure: production && !localTestnetBootstrap, path: '/', expires: new Date(expiresAt) };
}
export function clearSession(event: H3Event) { deleteCookie(event, 'showup_session', { path: '/' }); }
export async function body(event: H3Event): Promise<Record<string, any>> {
  const value = await readBody(event);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw createError({ statusCode: 400, statusMessage: 'INVALID_BODY' });
  return value;
}
