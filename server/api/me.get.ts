import { optionalActor } from './_helpers';
import { getRuntime } from '../runtime';
export default defineEventHandler(async event => { const wallet = await optionalActor(event), runtime = await getRuntime(); return wallet ? { wallet, operator: wallet === runtime.app.config.operator, organizer: wallet === runtime.app.config.organizer } : null; });
