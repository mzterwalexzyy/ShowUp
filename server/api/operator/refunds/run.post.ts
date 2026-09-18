import { mutation } from '../../_helpers';
import { getRuntime } from '../../../runtime';
export default defineEventHandler(async event => { const runtime = await getRuntime(); if (await mutation(event) !== runtime.app.config.operator) throw createError({ statusCode: 403, statusMessage: 'FORBIDDEN' }); if (!runtime.worker) throw createError({ statusCode: 503, statusMessage: 'SIGNER_UNAVAILABLE' }); await runtime.worker.recover(); await runtime.worker.runOne(); return { processed: true }; });
