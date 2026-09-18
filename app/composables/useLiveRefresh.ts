// Refresh reads only. Never prompt a wallet or submit a payment on a timer.
export function useLiveRefresh(read: () => Promise<void>, interval = 10000) {
  const { me, refreshMe } = useShowUp()
  const loading = ref(true)
  const refreshError = ref('')
  const clock = ref(Date.now())
  let active = false, pending = false, rerun = false
  let timer: ReturnType<typeof setInterval> | undefined
  async function refresh() {
    if (!active) return
    if (pending) { rerun = true; return }
    pending = true
    try { await read(); refreshError.value = '' }
    catch { refreshError.value = 'Could not refresh. Check your connection and retry.' }
    finally {
      pending = false; loading.value = false
      if (rerun && active) { rerun = false; void refresh() }
    }
  }
  watch(() => me.value?.wallet, () => { void refresh() })
  onMounted(async () => {
    active = true
    await refreshMe()
    if (!active) return
    await refresh()
    if (!active) return
    timer = setInterval(() => {
      clock.value = Date.now()
      if (!document.hidden) void refresh()
    }, interval)
  })
  onUnmounted(() => { active = false; if (timer) clearInterval(timer) })
  return { loading, refreshError, clock, refresh }
}
