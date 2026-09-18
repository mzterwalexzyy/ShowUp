export const stateCopy: Record<string,{label:string,tone:'neutral'|'waiting'|'success'|'danger';action?:string}> = {
  HOLD_CREATED:{label:'Awaiting payment',tone:'waiting',action:'Pay now'}, HELD:{label:'Awaiting payment',tone:'waiting',action:'Pay now'},
  PAYMENT_SUBMITTED:{label:'Payment submitted',tone:'waiting',action:'Verify payment'}, CONFIRMED:{label:'Confirmed seat',tone:'success'}, RESERVED:{label:'Confirmed seat',tone:'success'},
  CHECKED_IN:{label:'Checked in',tone:'success'}, REFUND_PENDING:{label:'Refund processing',tone:'waiting'}, NO_SHOW_PENDING:{label:'Needs review',tone:'danger'},
  HOLD_EXPIRED:{label:'Reservation expired',tone:'danger'}, MANUAL_REVIEW:{label:'Manual review',tone:'danger'}, COMPLETED:{label:'Completed',tone:'success'}, CANCELLED:{label:'Cancelled',tone:'danger'}
}
export const copyForState=(state?:string)=>stateCopy[state||''] || {label:state?.replaceAll('_',' ').toLowerCase() || 'Not started',tone:'neutral' as const}
export const shortWallet=(value?:string)=>value ? `${value.slice(0,9)}…${value.slice(-5)}` : 'Not connected'
export const nim=(luna?:number|string)=>`${(Number(luna||0)/100000).toLocaleString(undefined,{maximumFractionDigits:5})} NIM`
export const dateTime=(value?:number)=>value ? new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(value) : 'To be announced'
export const policyCopy=(mode?:string)=>mode==='PAID_ADMISSION' ? {label:'Paid admission',summary:'Your payment purchases one seat.',cta:'Buy ticket'} : {label:'Refundable deposit',summary:'Check in at the event and your deposit is returned.',cta:'Reserve'}
