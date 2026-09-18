import { actor } from '../_helpers';
import { getRuntime } from '../../runtime';
export default defineEventHandler(async event => (await getRuntime()).app.organizerEvents(await actor(event)));
