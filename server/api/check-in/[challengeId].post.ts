import { body, mutation } from '../_helpers';
import { getRuntime } from '../../runtime';
export default defineEventHandler(async event => { const input = await body(event); return (await getRuntime()).app.checkIn(await mutation(event), getRouterParam(event, 'challengeId')!, input.proof); });
