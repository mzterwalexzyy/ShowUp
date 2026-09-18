import { body } from '../_helpers';
import { getRuntime } from '../../runtime';
export default defineEventHandler(async event => (await getRuntime()).app.loginChallenge(String((await body(event)).wallet ?? '')));
