import { init, type NimiqProvider } from '@nimiq/mini-app-sdk'

let provider: NimiqProvider | undefined
export function useShowUp() {
  const me = useState<any>('showup-me', () => null)
  const working = useState<string>('showup-working', () => '')
  const notice = useState<any>('showup-notice', () => null)
  const loginChallenge = useState<any>('showup-login-challenge', () => null)
  async function api<T>(url: string, options: any = {}) { return $fetch<T>(url, { ...options, headers: { ...(options.headers || {}), 'x-showup-client':'product-v1' } }) }
  async function refreshMe() { me.value = await api('/api/me').catch(() => null); return me.value }
  async function connect() {
    if (working.value) return
    working.value = 'Connecting wallet'; notice.value = null
    try {
      provider ||= await init({ timeout:10000 })
      if (!loginChallenge.value) {
        const accounts = await provider.listAccounts(); if (!Array.isArray(accounts) || !accounts.length) throw new Error('Nimiq Pay returned no account')
        loginChallenge.value = await api<any>('/api/auth/challenge', { method:'POST', body:{ wallet:accounts[0] } })
        notice.value={tone:'waiting',title:'Wallet selected',message:'Tap Sign in to ShowUp to approve the sign-in message.'}
        return null
      }
      const challenge = loginChallenge.value
      const proof = await provider.sign(challenge.message); if ('error' in proof) throw new Error(String(proof.error))
      await api('/api/auth/verify', { method:'POST', body:{ challengeId:challenge.id, proof } }); loginChallenge.value=null; await refreshMe(); return me.value
    } catch (error:any) { provider = undefined; loginChallenge.value=null; notice.value={ tone:'error', title:'Wallet connection failed', message:error?.data?.statusMessage || error?.message || 'Open this event inside Nimiq Pay and try again.' }; throw error }
    finally { working.value='' }
  }
  async function pay(intent:any) { provider ||= await init({ timeout:10000 }); const result=await provider.sendBasicTransactionWithData({ recipient:intent.recipient, value:Number(intent.value), data:intent.data }); if(typeof result!=='string') throw new Error((result as any).error || 'Payment was not submitted'); return result }
  async function sign(message:string) { provider ||= await init({ timeout:10000 }); const proof=await provider.sign(message); if('error' in proof) throw new Error(String(proof.error)); return proof }
  async function task<T>(name:string, action:()=>Promise<T>) { if(working.value)throw new Error('An action is already in progress.'); working.value=name; notice.value=null; try{return await action()} catch(error:any){notice.value={tone:'error',title:name,message:error?.data?.statusMessage || error?.message || 'Try again.'}; throw error} finally{working.value=''} }
  async function logout() {
    await task('Signing out', () => api('/api/auth/logout', {method:'POST'}))
    me.value=null; loginChallenge.value=null; provider=undefined
  }
  return { me, working, notice, loginChallenge, api, refreshMe, connect, logout, pay, sign, task }
}
