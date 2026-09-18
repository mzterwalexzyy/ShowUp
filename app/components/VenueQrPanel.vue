<script setup lang="ts">
const props=defineProps<{src:string;token:string;expiresAt?:number}>()
const now=ref(Date.now());let timer:ReturnType<typeof setInterval>|undefined
const expired=computed(()=>!!props.expiresAt && now.value>=props.expiresAt)
onMounted(()=>{timer=setInterval(()=>now.value=Date.now(),1000)})
onUnmounted(()=>{if(timer)clearInterval(timer)})
</script>
<template><div class="qr-panel"><template v-if="!expired"><img :src="src" alt="Active venue check-in QR"><h2>Venue check-in is active</h2><p v-if="expiresAt">Expires {{ new Date(expiresAt).toLocaleTimeString() }}</p><code class="mono">{{ token }}</code></template><template v-else><h2>Venue code expired</h2><p>Rotate the QR to issue a fresh code.</p></template></div></template>
