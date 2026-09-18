<script setup lang="ts">
import { copyForState, dateTime, shortWallet } from '~/utils/presentation'
const p = defineProps<{ event: any; reservation: any }>()
const status = computed(() => copyForState(p.reservation?.state))
</script>
<template>
  <article class="ticket">
    <img v-if="reservation?.state==='CHECKED_IN'" class="success-art" src="/images/showup-checkin-success.webp" alt="Verified ticket and venue wristband" width="640" height="640" loading="lazy" decoding="async">
    <div class="ticket-main">
      <div style="display:flex;justify-content:space-between;gap:12px"><EventPolicyBadge :mode="event?.payment_mode || reservation?.payment_mode"/><span class="status-mark">{{ status.label }}</span></div>
      <h1>{{ event?.title || 'Your event pass' }}</h1>
      <div class="meta">
        <div class="meta-row"><span>Date</span><strong>{{ dateTime(event?.starts_at) }}</strong></div>
        <div class="meta-row"><span>Wallet</span><strong class="mono">{{ shortWallet(reservation?.participant_wallet) }}</strong></div>
        <div class="meta-row"><span>Seat</span><strong>{{ ['CONFIRMED','RESERVED','CHECKED_IN'].includes(reservation?.state) ? 'Confirmed' : 'Held' }}</strong></div>
        <div class="meta-row"><span>Check-in</span><strong>{{ dateTime(event?.check_in_opens_at || event?.starts_at) }}</strong></div>
      </div>
    </div>
    <div class="ticket-stub"><span>Reservation</span><code class="mono">{{ reservation?.id }}</code></div>
  </article>
</template>
