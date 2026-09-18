import { body, mutation } from '../_helpers';
import { getRuntime } from '../../runtime';
export default defineEventHandler(async event => { const wallet = await mutation(event); return (await getRuntime()).app.createEvent(wallet, await body(event) as any); });
