import { getRuntime } from '../runtime';
import { createWorkerTick } from '../worker/tick';
export default defineNitroPlugin(async nitro => {
  const runtime = await getRuntime();
  const tick = createWorkerTick(runtime.app, runtime.worker);
  const timer = setInterval(() => tick().catch(() => { console.error('ShowUp scheduled work failed; retrying on the next tick.'); }), 15000);
  timer.unref();
  nitro.hooks.hook('close', () => clearInterval(timer));
});
