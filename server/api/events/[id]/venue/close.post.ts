import { getRuntime } from '../../../../runtime';
import { mutation } from '../../../_helpers';
export default defineEventHandler(async event => (await getRuntime()).app.closeVenue(await mutation(event), getRouterParam(event, 'id')!));
