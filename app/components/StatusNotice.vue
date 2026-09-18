<script setup lang="ts">defineProps<{tone?:string;title:string;message?:string}>()</script>
<template><div class="notice" :class="tone" role="status" aria-live="polite"><h3>{{ title }}</h3><p v-if="message">{{ message }}</p></div></template>
