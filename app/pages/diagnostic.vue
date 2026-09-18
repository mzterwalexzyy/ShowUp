<script setup lang="ts">
import { init, type NimiqProvider } from '@nimiq/mini-app-sdk'
import QRCode from 'qrcode'
import { checkInAvailability, refundProgress } from '~/utils/flow'

definePageMeta({ ssr: false })

const provider = shallowRef<NimiqProvider>()
const wallet = ref('')
const role = ref<any>()
const health = ref<any>()
const eventId = ref('')
const reservation = ref<any>()
const venueToken = ref('')
const transactionHash = ref('')
const receipt = ref<any>()
const eventInfo = ref<any>()
const clock = ref(Date.now())
const busy = ref('')
const message = ref('Ready')
const log = ref<string[]>([])
const view = ref<'attend' | 'host'>('attend')
const hostEvents = ref<any[]>([])
const hostQr = ref('')
const signedIn = computed(() => Boolean(role.value?.wallet))
const paymentVerified = computed(() => ['RESERVED', 'CONFIRMED', 'CHECKED_IN'].includes(reservation.value?.state))
const recoveryPending = computed(() => reservation.value?.state === 'REFUND_PENDING')
const checkedIn = computed(() => reservation.value?.state === 'CHECKED_IN')
const refund = computed(() => refundProgress(receipt.value))
const checkIn = computed(() => checkInAvailability(reservation.value?.state, eventInfo.value?.starts_at, eventInfo.value?.ends_at, clock.value))
const countdown = computed(() => {
  const seconds = Math.max(0, Math.ceil(checkIn.value.waitMs / 1000)), minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
})
const now = Date.now()
const form = reactive({ title: 'ShowUp event', paymentMode: 'REFUNDABLE_DEPOSIT', amountLuna: 100000, participantCancellationPolicy: 'REFUND_BEFORE_CUTOFF', capacity: 20, startsAt: now + 5 * 60_000, endsAt: now + 35 * 60_000, checkInOpensAt: now + 5 * 60_000, checkInClosesAt: now + 35 * 60_000, cancellationCutoff: now + 4 * 60_000, decisionDeadline: now + 65 * 60_000 })

let timer: ReturnType<typeof setInterval> | undefined
let receiptTimer: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  timer = setInterval(() => { clock.value = Date.now() }, 1000)
  receiptTimer = setInterval(() => {
    if (reservation.value && (checkedIn.value || recoveryPending.value) && !refund.value.settled && !busy.value) void refreshReceipt(true)
  }, 3000)
  health.value = await $fetch('/api/health').catch(showError); await refreshMe(); if (!role.value?.operator) { await navigateTo('/'); return } await restore(); if (role.value?.organizer) await loadHostEvents()
})
onUnmounted(() => { if (timer) clearInterval(timer); if (receiptTimer) clearInterval(receiptTimer) })
function note(text: string, detail?: unknown) { message.value = text; log.value.unshift(`${new Date().toLocaleTimeString()} ${text}${detail ? ` ${JSON.stringify(detail)}` : ''}`) }
function showError(error: any) { note(error?.data?.statusMessage || error?.message || 'Request failed'); return null }
function providerError(error: any) { return typeof error === 'string' ? error : error?.message || error?.type || 'Nimiq Pay request failed' }
async function run(name: string, action: () => Promise<any>) { busy.value = name; try { const result = await action(); note(`${name} completed`, result); return result } catch (error) { showError(error) } finally { busy.value = '' } }
async function api<T>(url: string, options: any = {}) { return $fetch<T>(url, { ...options, headers: { ...(options.headers || {}), 'x-showup-client': 'diagnostic-v1' } }) }
async function walletProvider() { if (!provider.value) provider.value = await init({ timeout: 10_000 }); return provider.value }
async function connect() {
  await run('Wallet authentication', async () => {
    const p = await walletProvider(), accounts = await p.listAccounts();
    if (!Array.isArray(accounts) || !accounts.length) throw new Error(!Array.isArray(accounts) ? providerError(accounts.error) : 'Nimiq Pay returned no account')
    wallet.value = accounts[0]!
    const challenge = await api<any>('/api/auth/challenge', { method: 'POST', body: { wallet: wallet.value } })
    const proof = await p.sign(challenge.message)
    if ('error' in proof) throw new Error(providerError(proof.error))
    await api('/api/auth/verify', { method: 'POST', body: { challengeId: challenge.id, proof } })
    await refreshMe(); if (role.value?.organizer) await loadHostEvents()
    return { wallet: wallet.value }
  })
}
async function refreshMe() { role.value = await api('/api/me').catch(() => null); if (role.value?.wallet) wallet.value = role.value.wallet }
async function restore() {
  if (!role.value) return
  const saved = await api<any>('/api/me/diagnostic').catch(() => null)
  if (!saved) return
  eventInfo.value = saved.event
  eventId.value = saved.event?.id || ''
  reservation.value = saved.reservation
  transactionHash.value = saved.transactionHash || ''
  if (saved.reservation) await refreshReceipt(true)
  if (saved.reservation) note('Previous test state restored', { reservation: saved.reservation.id, state: saved.reservation.state })
}
async function createEvent() {
  await run('Create and open event', async () => {
    const current = Date.now(); form.startsAt = current + 10 * 60_000; form.endsAt = current + 40 * 60_000; form.checkInOpensAt = form.startsAt; form.checkInClosesAt = form.endsAt; form.cancellationCutoff = current + 9 * 60_000; form.decisionDeadline = current + 70 * 60_000
    const created = await api<any>('/api/events', { method: 'POST', body: { ...form, deposit: form.amountLuna } }); eventId.value = created.id
    const opened = await api(`/api/events/${eventId.value}/open`, { method: 'POST' }); eventInfo.value = { id: eventId.value, starts_at: form.startsAt, ends_at: form.endsAt }; return opened
  }); await loadHostEvents()
}
async function loadHostEvents() { if (role.value?.organizer) hostEvents.value = await api<any[]>('/api/host/events').catch(() => []) }
async function selectHostEvent(id: string) { eventId.value = id; eventInfo.value = await api(`/api/events/${id}`).catch(showError) }
async function loadAttendeeEvent() { if (eventId.value) eventInfo.value = await run('Load event', () => api(`/api/events/${eventId.value}`)) }
async function activateHostVenue() { const result = await run('Activate venue challenge', () => api<any>(`/api/events/${eventId.value}/venue`, { method: 'POST' })); if (result) { venueToken.value = result.token; hostQr.value = await QRCode.toDataURL(result.token, { width: 320, margin: 2 }) } }
async function closeHostVenue() { await run('Close venue challenge', () => api(`/api/events/${eventId.value}/venue/close`, { method: 'POST' })); venueToken.value = ''; hostQr.value = '' }
async function cancelHostEvent() { await run('Cancel event', () => api(`/api/events/${eventId.value}/cancel`, { method: 'POST' })); await loadHostEvents() }
async function reserve() { reservation.value = await run('Create reservation', () => api(`/api/events/${eventId.value}/reservations`, { method: 'POST' })) }
async function pay() {
  if (!reservation.value) return
  await run('Nimiq Pay deposit', async () => {
    const intent = await api<any>(`/api/reservations/${reservation.value.id}/payment-intent`, { method: 'POST' })
    const p = await walletProvider(), result = await p.sendBasicTransactionWithData({ recipient: intent.recipient, value: Number(intent.value), data: intent.data })
    if (typeof result !== 'string') throw new Error((result as any).error || 'Nimiq Pay did not return a transaction hash')
    transactionHash.value = result
    return { hash: result, next: 'Wait for testnet finality, then use Verify deposit.' }
  })
}
async function verifyDeposit() { if (reservation.value && transactionHash.value) { const result = await run('Verify deposit', () => api<any>(`/api/reservations/${reservation.value.id}/payment`, { method: 'POST', body: { hash: transactionHash.value } })); if (result) reservation.value = { ...reservation.value, ...result } } }
async function venue() { const result = await run('Open venue challenge', () => api<any>(`/api/events/${eventId.value}/venue`, { method: 'POST' })); if (result) venueToken.value = result.token }
async function submitCheckIn() {
  if (!reservation.value) return
  const checked = await run('Signed check-in', async () => {
    const challenge = await api<any>(`/api/reservations/${reservation.value.id}/check-in-challenge`, { method: 'POST', body: { venueToken: venueToken.value } })
    const result = await (await walletProvider()).sign(challenge.message)
    if ('error' in result) throw new Error(providerError(result.error))
    return api(`/api/check-in/${challenge.id}`, { method: 'POST', body: { proof: result } })
  })
  if (checked) {
    reservation.value = { ...reservation.value, ...checked }
    venueToken.value = ''
    await refreshReceipt(true)
  }
}
async function refreshReceipt(silent = false) {
  if (!reservation.value) return
  if (silent) receipt.value = await api(`/api/reservations/${reservation.value.id}`).catch(() => receipt.value)
  else receipt.value = await run('Load private receipt', () => api(`/api/reservations/${reservation.value.id}`))
}
async function loadReceipt() { await refreshReceipt(false) }
async function runRefund() { await run('Run refund worker', () => api('/api/operator/refunds/run', { method: 'POST' })); await loadReceipt() }
function resetFlow() { eventId.value = ''; eventInfo.value = null; reservation.value = null; transactionHash.value = ''; venueToken.value = ''; receipt.value = null; note('Ready to create a fresh test event') }
</script>

<template>
  <main>
    <header><p class="eyebrow">Internal diagnostic · Nimiq testnet</p><h1>ShowUp</h1><p>Operator tools for end-to-end verification. Ordinary attendee and host journeys use the product routes.</p></header>
    <nav><button :class="{active:view==='attend'}" @click="view='attend'">Attend an event</button><button :class="{active:view==='host'}" @click="view='host'">Host events</button></nav>
    <section><h2>System</h2><dl><div><dt>Network</dt><dd>{{ health?.network || 'Loading' }}</dd></div><div><dt>Treasury</dt><dd>{{ health?.treasury || 'Loading' }}</dd></div><div><dt>Status</dt><dd>{{ message }}</dd></div></dl></section>
    <section :class="{done:signedIn}"><h2>Wallet <span>{{ signedIn ? 'Connected' : 'Required' }}</span></h2><p>Approve one Nimiq Pay signature to continue.</p><button :disabled="!!busy || signedIn" @click="connect">{{ signedIn ? 'Signed in' : 'Connect and sign in' }}</button><p class="mono">{{ wallet || 'No authenticated wallet' }}</p></section>

    <template v-if="view==='host'">
      <section v-if="!role?.organizer"><h2>Host access</h2><p>This wallet is not an approved event organizer.</p></section>
      <template v-else>
        <section><h2>Create event campaign <span>Host</span></h2><p>Payment, capacity, dates, check-in and cancellation terms become permanent when registration opens.</p><div class="grid"><label>Event title<input v-model="form.title"></label><label>Payment mode<select v-model="form.paymentMode"><option value="REFUNDABLE_DEPOSIT">Refundable deposit</option><option value="PAID_ADMISSION">Paid admission</option></select></label><label>{{ form.paymentMode==='PAID_ADMISSION' ? 'Ticket price' : 'Deposit' }}, Luna<input v-model.number="form.amountLuna" type="number" min="1" max="1000000"></label><label>Seat capacity<input v-model.number="form.capacity" type="number" min="1" max="20"></label><label v-if="form.paymentMode==='PAID_ADMISSION'">Participant cancellation<select v-model="form.participantCancellationPolicy"><option value="REFUND_BEFORE_CUTOFF">Refund before cutoff</option><option value="NON_REFUNDABLE">Nonrefundable</option></select></label></div><button :disabled="!!busy" @click="createEvent">Create and open registration</button></section>
        <section><h2>Campaign control <span>{{ hostEvents.length }} campaigns</span></h2><label>Event campaign<select :value="eventId" @change="selectHostEvent(($event.target as HTMLSelectElement).value)"><option value="">Choose an event</option><option v-for="event in hostEvents" :key="event.id" :value="event.id">{{ event.title }} · {{ event.state }} · {{ event.available_seats }} seats left</option></select></label><div class="actions"><button :disabled="!!busy || !eventId" @click="activateHostVenue">Activate or rotate venue QR</button><button :disabled="!!busy || !venueToken" @click="closeHostVenue">Close venue challenge</button><button class="danger" :disabled="!!busy || !eventId" @click="cancelHostEvent">Cancel event</button><button class="quiet" :disabled="!!busy" @click="loadHostEvents">Refresh campaigns</button></div><div v-if="hostQr" class="venue"><img :src="hostQr" alt="Active venue check-in QR"><div><h3>Active check-in QR</h3><p>Attendees scan this first, then sign their reservation-specific challenge in Nimiq Pay.</p><code>{{ venueToken }}</code></div></div><p v-else class="hint">The venue QR can be activated during the selected event’s check-in window.</p></section>
      </template>
    </template>

    <template v-else>
    <section><h2>Find event <span>Attendee</span></h2><p>Enter the event ID shared by the host.</p><label>Event ID<input v-model.trim="eventId" placeholder="Paste event ID"></label><button :disabled="!!busy || !signedIn || !eventId" @click="loadAttendeeEvent">Load event</button><div v-if="eventInfo" class="summary"><strong>{{ eventInfo.title || 'Event loaded' }}</strong><span v-if="eventInfo.available_seats !== undefined">{{ eventInfo.available_seats }} of {{ eventInfo.capacity }} seats available</span></div></section>
    <section :class="{done:paymentVerified}"><h2>3. Deposit <span>{{ paymentVerified ? 'Verified' : transactionHash ? 'Payment sent' : 'After event' }}</span></h2><p>The page generates the reservation and exact payment details. You do not need to enter an event ID.</p><button :disabled="!!busy || !signedIn || !eventId || !!reservation" @click="reserve">{{ reservation ? 'Seat reserved' : 'Reserve seat' }}</button><button :disabled="!!busy || !reservation || !!transactionHash" @click="pay">Pay with Nimiq Pay</button><label>Transaction hash<input v-model="transactionHash" placeholder="Filled automatically after payment"></label><button :disabled="!!busy || !reservation || !transactionHash || paymentVerified || recoveryPending" @click="verifyDeposit">{{ paymentVerified ? 'Deposit verified' : recoveryPending ? 'Late payment queued for refund' : 'Verify deposit after finality' }}</button><p class="hint">PENDING_FINALITY means the payment is safe but needs another testnet macro block. Wait briefly and retry.</p><p v-if="recoveryPending" class="hint">This deposit arrived after the first event hold expired. Run the refund worker below. Then start a fresh event to test check-in.</p><pre v-if="reservation">{{ reservation }}</pre></section>
    <section :class="{done:checkedIn}"><h2>4. Check-in <span>{{ checkedIn ? 'Confirmed' : checkIn.open ? 'Open now' : paymentVerified ? `Opens in ${countdown}` : 'Payment must verify' }}</span></h2><p v-if="checkedIn">Your wallet-signed check-in was confirmed.</p><p v-else>Scan the host’s venue QR, paste its challenge if needed, then sign with the reservation wallet.</p><label v-if="!checkedIn">Venue challenge<input v-model="venueToken" placeholder="Scanned from host QR"></label><button v-if="!checkedIn" :disabled="!!busy || !checkIn.open || !venueToken" @click="submitCheckIn">Sign check-in</button></section>
    <section :class="{done:refund.settled}"><h2>5. Refund and receipt <span>{{ refund.settled ? 'Refund received' : refund.exists ? 'Refund processing' : 'After check-in or recovery' }}</span></h2><p v-if="refund.settled">Your verified principal has been returned to the funding wallet.</p><p v-else>The worker returns the verified principal to the funding wallet with a zero-fee testnet transaction. This page checks the refund status automatically.</p><button :disabled="!!busy || refund.settled || !role?.operator || (!paymentVerified && !recoveryPending)" @click="runRefund">{{ refund.settled ? 'Refund received' : 'Run refund worker' }}</button><button :disabled="!!busy || refund.settled || !reservation" @click="loadReceipt">{{ refund.settled ? 'Receipt up to date' : 'Refresh receipt' }}</button><pre v-if="receipt">{{ receipt }}</pre></section>
    </template>
    <section><h2>Activity</h2><ol><li v-for="entry in log" :key="entry">{{ entry }}</li></ol></section>
  </main>
</template>

<style scoped>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#17231d;background:#eef2e9;color-scheme:light}*{box-sizing:border-box}body{margin:0}main{width:min(900px,calc(100% - 28px));margin:0 auto;padding:32px 0 80px}header{padding:36px;border:1px solid #17231d;background:#d9f94f;box-shadow:8px 8px 0 #17231d}h1{font-size:clamp(3rem,10vw,6rem);letter-spacing:-.07em;line-height:.85;margin:.2em 0}h2{font-size:1.2rem;margin:0 0 10px;display:flex;justify-content:space-between;gap:12px}h2 span{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;background:#e9ece7;padding:5px 8px}.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:.75rem;font-weight:800}nav{display:flex;gap:8px;margin-top:22px;padding:8px;border:1px solid #829087;background:#fff}nav button{flex:1;margin:0;background:#fff;color:#17231d}nav button.active{background:#17231d;color:#fff}section{margin-top:22px;padding:24px;border:1px solid #829087;background:#fff}.done{border-color:#557000;box-shadow:inset 5px 0 #d9f94f}.done h2 span{background:#d9f94f}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px}label{display:grid;gap:6px;margin:12px 0;font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em}input,select{font:inherit;font-size:1rem;text-transform:none;letter-spacing:0;padding:11px;border:1px solid #829087;width:100%;background:#fff}input:disabled{background:#eceeea}button{font:inherit;font-weight:800;border:1px solid #17231d;background:#17231d;color:white;padding:11px 16px;margin:4px 8px 4px 0;cursor:pointer}button:disabled{opacity:.35;cursor:not-allowed}.quiet{background:#fff;color:#17231d}.danger{background:#8c322b;border-color:#8c322b}.actions{display:flex;flex-wrap:wrap}.venue{display:grid;grid-template-columns:220px 1fr;gap:22px;align-items:center;margin-top:18px;padding:18px;background:#eef1ed}.venue img{width:100%;display:block}.venue code{display:block;padding:10px;background:#fff;overflow-wrap:anywhere}.summary{display:flex;justify-content:space-between;gap:15px;margin-top:16px;padding:15px;background:#eef1ed}.hint{font-size:.85rem;color:#5b655f;border-left:3px solid #d9f94f;padding-left:10px}dl{display:grid;gap:10px}dl div{display:grid;grid-template-columns:110px 1fr;gap:12px}dt{font-weight:800}dd{margin:0;overflow-wrap:anywhere}.mono,pre{font:12px ui-monospace,monospace;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#eef1ed;padding:10px}ol{padding-left:20px}li{margin:8px 0}@media(max-width:560px){header,section{padding:20px}.grid,.venue{grid-template-columns:1fr}.venue img{width:min(100%,280px);margin:auto}.summary{display:grid}dl div{display:block}dd{margin-top:4px}}
</style>
