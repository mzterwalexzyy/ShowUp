<script setup lang="ts">
import { dateTime, nim } from '~/utils/presentation'
defineProps<{ event: any }>()
</script>
<template>
  <NuxtLink class="event-card" :to="`/host/e/${event.id}`">
    <img class="event-card-cover" :src="event.cover_url || '/images/showup-host-default.webp'" alt="" width="1280" height="720" loading="lazy" decoding="async">
    <EventPolicyBadge :mode="event.payment_mode"/>
    <h2>{{ event.title }}</h2><p>{{ dateTime(event.starts_at) }}</p>
    <div class="event-card-foot"><span>{{ nim(event.amount_luna) }}</span><span>{{ event.occupied_seats || 0 }}/{{ event.capacity }} confirmed</span></div>
  </NuxtLink>
</template>
