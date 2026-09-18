import { body, mutation, sessionCookie } from '../_helpers';
import { getRuntime } from '../../runtime';
export default defineEventHandler(async event => {
  await mutation(event).catch(error => { if (error.statusCode !== 401) throw error; });
  const input = await body(event), session = await (await getRuntime()).app.login(String(input.challengeId ?? ''), input.proof);
  sessionCookie(event, session.token, session.expiresAt);
  return { authenticated: true, expiresAt: session.expiresAt };
});
