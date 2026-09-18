<script setup lang="ts">
import { shortWallet } from '~/utils/presentation'
const {me,working,notice,loginChallenge,connect,logout,refreshMe}=useShowUp(); onMounted(refreshMe)
async function login(){try{if(me.value)await logout();else await connect()}catch{}}
</script>
<template><div><button class="secondary" :disabled="!!working" :title="me ? shortWallet(me.wallet) : undefined" @click="login">{{ working || (me ? 'Sign out' : loginChallenge ? 'Sign in to ShowUp' : 'Connect wallet') }}</button><p v-if="!me && notice" role="status">{{ notice.message }}</p></div></template>
