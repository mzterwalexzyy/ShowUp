<script setup lang="ts">defineProps<{title:string;message:string;image?:string;alt?:string}>()</script>
<template><div class="empty"><img v-if="image" class="empty-art" :src="image" :alt="alt||''" width="960" height="640" loading="lazy" decoding="async"><h2>{{ title }}</h2><p>{{ message }}</p><slot/></div></template>
