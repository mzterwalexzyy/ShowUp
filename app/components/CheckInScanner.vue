<script setup lang="ts">
const emit=defineEmits<{scanned:[value:string]}>()
const manual=ref(''),video=ref<HTMLVideoElement>(),denied=ref(false),active=ref(false),starting=ref(false)
let stream:MediaStream|undefined,raf=0,generation=0
async function start(){
  if(starting.value||active.value)return
  const current=++generation
  denied.value=false;starting.value=true
  try{
    const Detector=(window as any).BarcodeDetector
    if(!Detector || !navigator.mediaDevices?.getUserMedia)throw new Error('Camera or QR decoder unavailable')
    const detector=new Detector({formats:['qr_code']})
    const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}})
    if(current!==generation){acquired.getTracks().forEach(t=>t.stop());return}
    stream=acquired;active.value=true;await nextTick()
    if(video.value){video.value.srcObject=stream;await video.value.play()}
    const tick=async()=>{
      if(current!==generation||!active.value||!video.value)return
      try{const codes=await detector.detect(video.value);if(current!==generation)return;if(codes[0]?.rawValue){submit(codes[0].rawValue);return}}catch{}
      if(current===generation)raf=requestAnimationFrame(tick)
    }
    void tick()
  }catch{if(current===generation){stop();denied.value=true}}
  finally{starting.value=false}
}
function stop(){generation++;active.value=false;if(raf)cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());stream=undefined}
function submit(value:string){stop();emit('scanned',value)}
onUnmounted(stop)
</script>
<template><div><div class="scanner"><video v-if="active" ref="video" autoplay playsinline muted></video><div v-else class="scanner-frame" aria-hidden="true"></div></div><StatusNotice v-if="denied" tone="waiting" title="Camera unavailable" message="This browser may need HTTPS, camera permission, or QR support. You can paste the host's venue code below."/><p v-else>Point the camera at the active host QR. You will review the event and wallet before signing.</p><button v-if="!active" class="secondary" :disabled="starting" @click="start">{{ starting?'Opening camera':'Open camera' }}</button><button v-else class="secondary" @click="stop">Close camera</button><label class="field">Venue code<input v-model.trim="manual" autocomplete="off" placeholder="Paste venue code"></label><button :disabled="!manual" @click="submit(manual)">Continue with code</button></div></template>
