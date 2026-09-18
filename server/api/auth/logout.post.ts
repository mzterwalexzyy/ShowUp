import { actor, clearSession, mutation } from '../_helpers';
import { getRuntime } from '../../runtime';
export default defineEventHandler(async event => { await actor(event); await mutation(event); const token = getCookie(event, 'showup_session')!; await (await getRuntime()).app.logout(token); clearSession(event); return { authenticated: false }; });
