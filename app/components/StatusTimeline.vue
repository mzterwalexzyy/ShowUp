<script setup lang="ts">defineProps<{items:Array<{label:string;detail?:string;done?:boolean;level?:string}>}>()</script>
<template><ol class="timeline"><li v-for="(item,index) in items" :key="index" :class="{done:item.done}"><div><strong>{{ item.label }}</strong><span>{{ item.detail }}<template v-if="item.level"> · {{ item.level }}</template></span></div></li></ol></template>
