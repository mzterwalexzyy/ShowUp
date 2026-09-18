<script setup lang="ts">
import { dateTime, nim, policyCopy } from '~/utils/presentation'
import { registrationOpen } from '~/utils/flow'

const route = useRoute()
const { me, working, notice, loginChallenge, api, connect, task } = useShowUp()
const event = ref<any>()
const paymentOpen = ref(false)
const policy = computed(() => policyCopy(event.value?.payment_mode))

useHead({ link: [{ rel: 'preload', as: 'image', href: '/images/showup-event-default.webp', type: 'image/webp' }] })
const { loading, clock, refreshError } = useLiveRefresh(async () => {
  event.value = await api(`/api/events/${route.params.eventId}`)
})
const canRegister = computed(() => registrationOpen(event.value, clock.value))

async function begin() {
  try { if (!me.value) await connect(); if (me.value) paymentOpen.value = true } catch { /* Connection notice is shown. */ }
}
async function reserve() {
  try {
    const reservation = await task('Creating reservation', () => api<any>(`/api/events/${event.value.id}/reservations`, { method: 'POST' }))
    paymentOpen.value = false
    await navigateTo(`/r/${reservation.id}`)
  } catch { paymentOpen.value = false }
}
</script>

<template>
  <div class="shell">
    <AppHeader/>
    <div v-if="loading" class="skeleton"></div>
    <EmptyState v-else-if="!event" title="Event unavailable" message="This event link is invalid or no longer available."/>
    <main v-else>
      <article class="ticket">
        <div class="event-cover">
          <img :src="event.cover_url || '/images/showup-event-default.webp'" :alt="event.cover_url ? `${event.title} event cover` : 'Abstract event crowd, stage, tickets, and wristbands'" width="1280" height="720" fetchpriority="high" decoding="async">
        </div>
        <div class="ticket-main">
          <EventPolicyBadge :mode="event.payment_mode"/>
          <h1>{{ event.title }}</h1>
          <p>{{ dateTime(event.starts_at) }}</p>
          <MoneyAmount :luna="event.amount_luna"/>
          <p>{{ policy.summary }}</p>
          <div class="meta">
            <div class="meta-row"><span>Cancellation</span><strong>{{ event.participant_cancellation_policy==='NON_REFUNDABLE'?'Nonrefundable':'Refund before cutoff' }}</strong></div>
            <div class="meta-row"><span>Check-in</span><strong>Wallet signature required</strong></div>
            <div class="meta-row"><span>Cancellation cutoff</span><strong>{{ dateTime(event.cutoff) }}</strong></div>
            <div class="meta-row"><span>Check-in window</span><strong>{{ dateTime(event.check_in_opens_at) }} to {{ dateTime(event.check_in_closes_at) }}</strong></div>
          </div>
          <SeatMeter :available="event.available_seats" :capacity="event.capacity"/>
        </div>
        <div class="ticket-stub"><span>Event reference</span><code class="mono">{{ event.id }}</code></div>
      </article>
      <StatusNotice v-if="notice" :tone="notice.tone" :title="notice.title" :message="notice.message"/>
      <StatusNotice v-if="refreshError" tone="error" title="Refresh unavailable" :message="refreshError"/>
    </main>
    <BottomActionBar v-if="event">
      <button v-if="canRegister" :disabled="!!working" @click="begin">{{ me ? `${policy.cta} with ${nim(event.amount_luna)}` : loginChallenge ? 'Sign in to ShowUp' : 'Connect wallet to continue' }}</button>
      <button v-else disabled>{{ event.state==='OPEN' && clock < event.starts_at && event.available_seats===0 ? 'Sold out' : 'Registration closed' }}</button>
    </BottomActionBar>
    <PaymentConfirmation v-if="paymentOpen" :event="event" :wallet="me?.wallet" @close="paymentOpen=false" @confirm="reserve"/>
  </div>
</template>
