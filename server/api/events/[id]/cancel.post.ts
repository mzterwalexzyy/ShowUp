import { mutation } from '../../_helpers';
import { getRuntime } from '../../../runtime';
export default defineEventHandler(async event => (await getRuntime()).app.cancelEvent(await mutation(event), getRouterParam(event, 'id')!));
