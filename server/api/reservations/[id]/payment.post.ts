import { body, mutation } from '../../_helpers';
import { getRuntime } from '../../../runtime';
export default defineEventHandler(async event => { const runtime = await getRuntime(), input = await body(event); return runtime.app.confirmPayment(await mutation(event), getRouterParam(event, 'id')!, String(input.hash ?? ''), runtime.rpc); });
