<script setup>
import {ref,watch,onBeforeUnmount} from 'vue';
import ThreeViewer from './ThreeViewer.vue';
const props=defineProps({code:{type:String,required:true}});
const emit=defineEmits(['ready','error']);
const viewer=ref(null);
let revision=0;
watch([viewer,()=>props.code],async([instance,code])=>{
 const request=++revision;
 if(!instance)return;
 try {
  const deadline=Date.now()+60000;
  while(!instance.isReady){
   if(request!==revision)return;
   if(Date.now()>deadline)throw new Error('The 3D preview could not start.');
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  if(request!==revision)return;
  await instance.applyModuleCode(code,'replace');
  if(request===revision)emit('ready');
 }catch(error){if(request===revision)emit('error',error);}
});
onBeforeUnmount(()=>revision++);
</script>
<template><ThreeViewer ref="viewer" :enable-physics="false" :hideUI="true" presentation="studio" /></template>
