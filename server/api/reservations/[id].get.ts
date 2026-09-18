import { actor } from '../_helpers';
import { getRuntime } from '../../runtime';
export default defineEventHandler(async event => (await getRuntime()).app.receipt(await actor(event), getRouterParam(event, 'id')!));
