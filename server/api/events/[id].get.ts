import { getRuntime } from '../../runtime';
export default defineEventHandler(async event => (await getRuntime()).app.publicEvent(getRouterParam(event, 'id')!));
