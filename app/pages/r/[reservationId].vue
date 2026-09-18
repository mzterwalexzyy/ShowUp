<script setup lang="ts">
import { policyCopy, dateTime } from '~/utils/presentation'
import { checkInAvailability, refundProgress, paymentAction } from '~/utils/flow'
const route = useRoute()
const { me, working, notice, api, pay, sign, task } = useShowUp()
const data = ref<any>(), hash = ref(''), scanner = ref(false), venueToken = ref('')
const localAttempt = ref(false), confirmCancel = ref(false)
const r = computed(() => data.value?.reservation)
const policy = computed(() => policyCopy(r.value?.payment_mode))
const { clock, loading, refreshError, refresh } = useLiveRefresh(async () => {
  if (!me.value) { data.value = null; return }
  const result = await api<any>(`/api/reservations/${route.params.reservationId}`)
  if (result.reservation.participant_wallet !== me.value?.wallet && !me.value?.operator) return
  data.value = result
  if (!hash.value) hash.value = result.evidence?.payments?.findLast((p: any) => p.transaction_hash)?.transaction_hash || ''
})
const checkOpen = computed(() => checkInAvailability(r.value?.state, r.value?.check_in_opens_at, r.value?.check_in_closes_at, clock.value).open)
const paid = computed(() => data.value?.evidence?.credits?.length > 0)
const settled = computed(() => refundProgress(data.value).settled)
const payment = computed(() => paymentAction(data.value, localAttempt.value, clock.value))
const canCancel = computed(() => ['CONFIRMED','RESERVED'].includes(r.value?.state) && clock.value < r.value.cutoff && (r.value.payment_mode === 'REFUNDABLE_DEPOSIT' || r.value.participant_cancellation_policy === 'REFUND_BEFORE_CUTOFF'))
async function submitPayment() {
  try {
    await task('Submitting payment', async () => {
      const intent = await api<any>(`/api/reservations/${route.params.reservationId}/payment-intent`, { method: 'POST' })
      localAttempt.value = true
      hash.value = await pay(intent)
    })
    await verify()
  } catch { /* task displays the error; the durable attempt prevents another send */ }
  finally { await refresh() }
}
async function verify() {
  try { await task('Verifying payment', () => api(`/api/reservations/${route.params.reservationId}/payment`, { method: 'POST', body: { hash: hash.value } })) }
  catch { /* Keep the hash available for verification retry. */ }
  finally { await refresh() }
}
function scanned(value: string) { venueToken.value = value; scanner.value = false }
async function checkIn() {
  try {
    await task('Signing check-in', async () => {
      const c = await api<any>(`/api/reservations/${route.params.reservationId}/check-in-challenge`, { method: 'POST', body: { venueToken: venueToken.value } })
      const proof = await sign(c.message)
      await api(`/api/check-in/${c.id}`, { method: 'POST', body: { proof } })
    })
  } catch { venueToken.value = '' }
  finally { await refresh() }
}
async function cancel() {
  try {
    await task('Cancelling reservation', () => api(`/api/reservations/${route.params.reservationId}/cancel`, { method: 'POST' }))
    confirmCancel.value = false
  } catch { /* Keep the confirmation and show the server error. */ }
  finally { await refresh() }
}
</script>
<template>
  <div class="shell"><AppHeader/>
    <EmptyState v-if="!me" title="Open your event pass" message="Connect the wallet used for this reservation."><WalletButton/></EmptyState>
    <div v-else-if="loading" class="skeleton"/>
    <EmptyState v-else-if="!data" title="Pass unavailable" message="This reservation is not available to the connected wallet."/>
    <StatusNotice v-if="refreshError" tone="error" title="Refresh unavailable" :message="refreshError"/>
    <main v-if="me && data">
      <ReservationPass :event="r" :reservation="r"/>
      <StatusNotice v-if="notice" :tone="notice.tone" :title="notice.title" :message="notice.message"/>
      <StatusNotice v-if="settled" tone="success" title="Deposit returned" message="Every refund on this pass has been verified."/>
      <StatusNotice v-else-if="r.state==='REFUND_PENDING'" tone="waiting" title="Refund processing" message="Your payment is being returned to the funding wallet."/>
      <StatusNotice v-else-if="r.state==='CHECKED_IN'" tone="success" :title="r.payment_mode==='PAID_ADMISSION'?'Checked in. Your ticket has been used.':'Checked in. Your refund has been created.'"/>
      <section v-if="payment==='recover'" class="panel">
        <h2>Check your payment</h2><p>A payment was started. Check Nimiq Pay activity and paste its transaction hash to verify it. If no transaction appears, contact the operator before trying another payment.</p>
        <label class="field">Transaction hash<input v-model.trim="hash" autocomplete="off" spellcheck="false"></label>
        <button :disabled="!!working || !/^[a-f0-9]{64}$/.test(hash)" @click="verify">Verify payment</button>
      </section>
      <StatusNotice v-if="payment==='expired'" tone="waiting" title="Seat hold expired" message="This hold can no longer accept a new payment. Contact the host for a new reservation."/>
      <section class="panel"><h2>Pass status</h2>
        <StatusTimeline :items="[{label:'Reservation created',done:true,level:'Verified'},{label:'Payment verified',done:paid,level:paid?'Verified':'Unknown'},{label:'Check-in accepted',done:!!r.attendance_at,level:r.attendance_at?'Verified':'Unknown'},{label:r.payment_mode==='PAID_ADMISSION'?'Admission completed':'Refund verified',done:r.payment_mode==='PAID_ADMISSION'?r.settlement_state==='TICKET_CONSUMED':settled,level:(settled||r.settlement_state==='TICKET_CONSUMED')?'Verified':'Unknown'}]"/>
        <p>Check-in {{ dateTime(r.check_in_opens_at) }} to {{ dateTime(r.check_in_closes_at) }}.</p>
        <button class="secondary" :disabled="!!working" @click="refresh">Refresh status</button>
        <NuxtLink class="button secondary" :to="`/receipt/${route.params.reservationId}`">View receipt</NuxtLink>
      </section>
      <section v-if="canCancel" class="panel"><h2>Cancel reservation</h2><p>Cancel before {{ dateTime(r.cutoff) }} for a full-principal refund to the funding wallet.</p><button class="danger" :disabled="!!working" @click="confirmCancel=true">Cancel reservation</button></section>
    </main>
    <BottomActionBar v-if="me && data">
      <button v-if="payment==='pay'" :disabled="!!working" @click="submitPayment">{{ policy.cta }} now</button>
      <template v-else-if="checkOpen"><button v-if="!venueToken" :disabled="!!working" @click="scanner=true">Scan venue QR</button><button v-else :disabled="!!working" @click="checkIn">Sign check-in</button></template>
      <button v-else-if="['CONFIRMED','RESERVED'].includes(r.state)" disabled>Check-in unavailable</button>
      <NuxtLink v-else class="button" :to="`/receipt/${route.params.reservationId}`">View receipt</NuxtLink>
    </BottomActionBar>
    <div v-if="scanner" class="dialog-backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-label="Scan venue QR"><h2>Scan venue QR</h2><CheckInScanner @scanned="scanned"/><button class="secondary" @click="scanner=false">Close scanner</button></section></div>
    <ConfirmDialog :open="confirmCancel" title="Cancel this reservation?" message="Your seat will be released and a full-principal refund will be queued to your funding wallet. Chain verification takes time." confirm-label="Cancel and request refund" @close="confirmCancel=false" @confirm="cancel"/>
  </div>
</template>
