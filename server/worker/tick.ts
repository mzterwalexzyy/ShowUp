export function createWorkerTick(
  app: { advanceDeadlines(): Promise<unknown> },
  worker?: { recover(): Promise<void>; runOne(): Promise<void> },
) {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      await app.advanceDeadlines();
      if (worker) { await worker.recover(); await worker.runOne(); }
    } finally { running = false; }
  };
}
