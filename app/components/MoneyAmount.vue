<script setup lang="ts">import{nim}from'~/utils/presentation';defineProps<{luna?:number|string}>()</script>
<template><span class="amount">{{ nim(luna) }}</span></template>
