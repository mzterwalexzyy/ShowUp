import { getRuntime } from '../runtime';
export default defineEventHandler(async () => {
  const runtime = await getRuntime();
  return { ok: true, network: 'Nimiq Testnet', networkId: 5, custody: 'ShowUp operator controls participant funds during this capped pilot.', treasury: runtime.app.config.treasury, signerReady: Boolean(runtime.signer) };
});
