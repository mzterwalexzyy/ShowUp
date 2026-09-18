<script setup lang="ts">defineProps<{title?:string;evidence?:unknown}>()</script>
<template><details class="details"><summary>{{ title || 'View evidence' }}</summary><pre>{{ evidence }}</pre></details></template>
