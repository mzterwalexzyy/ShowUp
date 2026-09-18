<script setup lang="ts">import{policyCopy}from'~/utils/presentation';const p=defineProps<{mode?:string}>();const policy=computed(()=>policyCopy(p.mode))</script>
<template><span class="policy-badge" :class="mode==='PAID_ADMISSION'?'paid':'refundable'">{{ policy.label }}</span></template>
