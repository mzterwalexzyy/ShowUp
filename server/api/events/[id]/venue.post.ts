import { mutation } from '../../_helpers';
import { getRuntime } from '../../../runtime';
export default defineEventHandler(async event => (await getRuntime()).app.venue(await mutation(event), getRouterParam(event, 'id')!));
