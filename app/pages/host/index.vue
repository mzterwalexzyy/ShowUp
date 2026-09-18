<script setup lang="ts">
import { eventGroup } from '~/utils/flow'
const { me, api } = useShowUp()
const events = ref<any[]>([])
const { loading, clock, refreshError } = useLiveRefresh(async () => {
  events.value = me.value?.organizer ? await api<any[]>('/api/host/events') : []
})
const groups = computed(() => Object.fromEntries(['draft','live','upcoming','closed','completed','cancelled'].map(name => [name, events.value.filter(e => eventGroup(e, clock.value) === name)])))
</script>

<template>
  <div class="shell wide">
    <AppHeader host><WalletButton/></AppHeader>
    <div class="page-head">
      <p>Host workspace</p><h1>Your campaigns.</h1>
      <p>Create fixed event terms, share attendee links, and run venue check-in.</p>
      <NuxtLink class="button" to="/host/new">Create event</NuxtLink>
    </div>
    <StatusNotice v-if="refreshError" tone="error" title="Refresh unavailable" :message="refreshError"/>
    <EmptyState v-if="!me" title="Connect the organizer wallet" message="Host campaigns are private to the approved organizer."><WalletButton/></EmptyState>
    <EmptyState v-else-if="!me.organizer" title="Organizer access required" message="This wallet cannot create or manage ShowUp campaigns."/>
    <div v-else-if="loading" class="skeleton"></div>
    <EmptyState v-else-if="!events.length" image="/images/showup-empty-events.webp" alt="An empty venue entrance with folded event tickets" title="No campaigns yet" message="Create your first fixed-capacity event campaign."><NuxtLink class="button" to="/host/new">Create event</NuxtLink></EmptyState>
    <template v-else>
      <section v-for="(items,name) in groups" :key="name" class="panel">
        <h2 style="text-transform:capitalize">{{ name }} campaigns</h2>
        <div v-if="items.length" class="campaign-grid"><EventCard v-for="event in items" :key="event.id" :event="event"/></div>
        <p v-else>No {{ name }} campaigns.</p>
      </section>
    </template>
  </div>
</template>
