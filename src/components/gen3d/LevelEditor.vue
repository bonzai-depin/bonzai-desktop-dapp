<template>
  <section class="level-editor" :aria-label="$t('levelEditor.title')">
    <header class="level-editor__bar">
      <div class="level-editor__tools" role="group" :aria-label="$t('levelEditor.title')">
        <button v-for="tool in tools" :key="tool.id" type="button" class="bz-btn bz-btn--ghost" :aria-pressed="mode===tool.id" :disabled="busy" @click="setMode(tool.id)"><span class="material-symbols-outlined" aria-hidden="true">{{tool.icon}}</span>{{$t(`levelEditor.${tool.label}`)}}</button>
        <button type="button" class="bz-btn bz-btn--ghost" :aria-pressed="snap" :disabled="busy" @click="snap=!snap;controller?.setSnap(snap)"><span class="material-symbols-outlined" aria-hidden="true">grid_4x4</span>{{$t('levelEditor.snap')}}</button>
      </div>
      <div class="level-editor__tools">
        <button type="button" class="bz-iconbtn" :title="$t('levelEditor.undo')" :aria-label="$t('levelEditor.undo')" :disabled="busy||!canUndo" @click="$emit('undo')"><span class="material-symbols-outlined">undo</span></button>
        <button type="button" class="bz-iconbtn" :title="$t('levelEditor.redo')" :aria-label="$t('levelEditor.redo')" :disabled="busy||!canRedo" @click="$emit('redo')"><span class="material-symbols-outlined">redo</span></button>
        <button type="button" class="bz-btn bz-btn--primary" :disabled="busy" @click="$emit('save')"><span class="material-symbols-outlined" aria-hidden="true">save</span>{{$t('levelEditor.save')}}</button>
      </div>
    </header>
    <div class="level-editor__body">
      <div class="level-editor__selection">
        <label class="level-editor__label" for="level-object-select">{{$t('levelEditor.objects')}}</label>
        <div class="level-editor__object-choice"><select id="level-object-select" class="bz-field-input" :value="selectedKey" :disabled="busy" @change="controller?.selectByKey($event.target.value)">
          <option value="">{{$t('levelEditor.select')}}</option>
          <option v-for="entry in entries" :key="entry.key" :value="entry.key">{{'· '.repeat(entry.depth)}}{{entry.title}}</option>
        </select></div>
        <div v-if="selected?.instanceCount" class="level-editor__instance">
          <button type="button" class="bz-btn bz-btn--ghost" :disabled="busy" @click="chooseInstance(null)">{{$t('levelEditor.allInstances')}}</button>
          <label>{{$t('levelEditor.instance')}}<input class="bz-field-input" type="number" min="1" :max="selected.instanceCount" :value="selected.target.instanceId==null?'':selected.target.instanceId+1" :disabled="busy" @change="chooseInstance(Number($event.target.value)-1)" /></label>
        </div>
        <div v-if="selected" class="level-editor__transforms">
          <fieldset v-for="field in ['position','rotation','scale']" :key="field" :disabled="busy">
            <legend>{{$t(`levelEditor.${field}`)}}{{field==='rotation'?' · °':''}}</legend>
            <label v-for="axis in ['x','y','z']" :key="axis"><span>{{axis.toUpperCase()}}</span><input type="number" :aria-label="`${$t(`levelEditor.${field}`)} ${axis.toUpperCase()}`" :step="field==='rotation'?15:field==='scale'?.1:.25" v-model.number="draft[field][axis]" @change="commitFields" /></label>
          </fieldset>
        </div>
        <p v-else class="level-editor__hint">{{$t('levelEditor.noSelection')}}</p>
        <slot v-if="selected" name="selection" />
      </div>
      <form class="level-editor__regenerate" @submit.prevent="$emit('regenerate',{selection:selected,prompt:prompt.trim()})">
        <label class="level-editor__label" for="level-replacement-prompt">{{$t('levelEditor.regenerate')}}</label>
        <textarea id="level-replacement-prompt" class="bz-field-input" rows="3" v-model="prompt" :placeholder="$t('levelEditor.prompt')" :disabled="busy||!selected" />
        <p class="level-editor__hint">{{$t('levelEditor.scope')}}</p>
        <button type="submit" class="bz-btn bz-btn--primary" :disabled="busy||!selected||!prompt.trim()||!modelReady"><span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>{{$t(generating?'levelEditor.busy':'levelEditor.regenerate')}}</button>
        <button v-if="generating" type="button" class="bz-btn bz-btn--ghost" @click="$emit('cancel-generation')">{{$t('levelEditor.stop')}}</button>
      </form>
      <div class="level-editor__library">
        <span class="level-editor__label">{{$t('levelEditor.assets')}}</span>
        <div class="level-editor__assets">
          <button v-for="asset in assets" :key="asset.libraryId" type="button" :title="asset.title" :aria-label="asset.title" :aria-pressed="pending===asset.libraryId" :disabled="busy" :draggable="!busy" @dragstart="beginDrag(asset,$event)" @dragend="dragEnd" @click="armAsset(asset)">
            <img v-if="asset.thumbnail" :src="asset.thumbnail" alt="" /><span v-else class="material-symbols-outlined" aria-hidden="true">deployed_code</span><small>{{asset.title}}</small>
          </button>
        </div>
        <p class="level-editor__hint">{{$t(assets.length?'levelEditor.placeHint':'levelEditor.emptyAssets')}}</p>
        <button v-if="pending" type="button" class="bz-btn bz-btn--ghost" @click="armAsset(null)">{{$t('levelEditor.cancel')}}</button>
      </div>
    </div>
    <p v-if="message||error" class="level-editor__status" :class="{'is-error':error}" role="status">{{error||message}}</p>
  </section>
</template>

<script setup>
import {ref,computed,watch,nextTick,onBeforeUnmount} from 'vue';
import {LevelEditControls} from './levelEditControls.js';
const props=defineProps({viewer:Object,revision:Number,assets:{type:Array,default:()=>[]},busy:Boolean,generating:Boolean,modelReady:{type:Boolean,default:true},canUndo:Boolean,canRedo:Boolean,message:String});
const emit=defineEmits(['selection','transform','regenerate','place','save','undo','redo','cancel-generation']);
const entries=ref([]),selected=ref(null),draft=ref(null),prompt=ref(''),mode=ref('translate'),snap=ref(false),pending=ref(''),error=ref('');
let controller=null,disposed=false;
const selectedKey=computed(()=>entries.value.some(entry=>entry.key===selected.value?.key)?selected.value.key:selected.value?.target.instanceId!=null?`node:${selected.value.target.path}`:selected.value?.key||'');
const tools=[{id:'translate',label:'move',icon:'open_with'},{id:'rotate',label:'rotate',icon:'rotate_right'},{id:'scale',label:'scale',icon:'aspect_ratio'}];
const select=value=>{
  if(value?.key!==selected.value?.key){prompt.value='';error.value='';}
  selected.value=value;draft.value=value?JSON.parse(JSON.stringify(value.transform)):null;
  if(draft.value)for(const axis of ['x','y','z'])draft.value.rotation[axis]=Math.round(draft.value.rotation[axis]*180/Math.PI*100)/100;
  emit('selection',value);
};
function setMode(value){mode.value=value;controller?.setMode(value);}
function commitFields(){
  try{error.value='';const transform=JSON.parse(JSON.stringify(draft.value));for(const axis of ['x','y','z'])transform.rotation[axis]*=Math.PI/180;controller?.transform(transform);}
  catch(e){error.value=e.message;}
}
function chooseInstance(id){
  if(id!=null&&(!Number.isInteger(id)||id<0||id>=selected.value.instanceCount))return;
  const target={...selected.value.target};if(id==null)delete target.instanceId;else target.instanceId=id;
  controller?.selectTarget(target);
}
function armAsset(asset){pending.value=asset?.libraryId||'';if(controller)controller.pendingAsset=asset;}
function beginDrag(asset,event){armAsset(null);event.dataTransfer.setData('application/x-bonzai-asset',asset.libraryId);event.dataTransfer.effectAllowed='copy';}
function dragEnd(){armAsset(null);}
function drop(event){
  event.preventDefault();event.stopPropagation();if(props.busy)return;
  const id=event.dataTransfer.getData('application/x-bonzai-asset'),asset=props.assets.find(item=>item.libraryId===id);
  if(!asset)return;
  try{emit('place',{asset,position:controller.dropPosition(event.clientX,event.clientY)});}catch(e){error.value=e.message;}
}
const dragOver=event=>{if(!props.busy){event.preventDefault();event.dataTransfer.dropEffect='copy';}};
let element;
function detach(){controller?.dispose();controller=null;element?.removeEventListener('drop',drop);element?.removeEventListener('dragover',dragOver);}
async function refresh(){
  const target=selected.value?.target;detach();await nextTick();if(disposed)return;
  const root=props.viewer?.scene?.getObjectByName('GeneratedObject')?.children.find(node=>node.userData.bonzaiLevelId);
  if(!root)return;
  controller=new LevelEditControls({viewer:props.viewer,root,onSelect:select,onTransform:value=>{select(value);emit('transform',value);},onPlace:(asset,position)=>{armAsset(null);emit('place',{asset,position});}});
  entries.value=controller.entries().map(({node,...entry})=>entry);
  controller.setMode(mode.value);controller.setSnap(snap.value);controller.setDisabled(props.busy);
  element=props.viewer.renderer.domElement;element.addEventListener('drop',drop);element.addEventListener('dragover',dragOver);
  if(target)controller.selectTarget(target);
}
watch(()=>props.revision,refresh,{immediate:true});
watch(()=>props.busy,value=>controller?.setDisabled(value));
onBeforeUnmount(()=>{disposed=true;detach();});
defineExpose({detach,refresh,selectTarget:target=>controller?.selectTarget(target),getSelection:()=>selected.value});
</script>

<style scoped>
.level-editor{color:var(--bz-fg);background:var(--bz-panel);border:1px solid var(--bz-border);border-radius:var(--bz-radius-lg,12px);overflow:hidden;min-width:0}
.level-editor,.level-editor *{box-sizing:border-box}
.level-editor__object-choice{position:relative}.level-editor__object-choice select{appearance:none;padding-right:38px}.level-editor__object-choice::after{content:'';position:absolute;right:16px;top:calc(50% - 5px);width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);pointer-events:none}
.level-editor__bar,.level-editor__tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.level-editor__bar{justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--bz-border)}
.level-editor__tools [aria-pressed="true"]{color:var(--bz-accent);background:var(--bz-accent-soft);border-color:var(--bz-accent)}
.level-editor__body{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr)}.level-editor__body>div,.level-editor__body>form{padding:20px;min-width:0}.level-editor__body>*+*{border-left:1px solid var(--bz-border)}
.level-editor__label{display:block;font-weight:600;font-size:14px;margin-bottom:12px}.level-editor__hint,.level-editor__status{font-size:13px;line-height:1.5;color:var(--bz-fg-mid);margin:12px 0}
.level-editor__body select,.level-editor__body textarea{width:100%;min-width:0}.level-editor__body textarea{resize:vertical;min-height:100px}
.level-editor__transforms fieldset{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;border:0;padding:0;margin:12px 0 0}.level-editor__transforms legend{font-size:12px;color:var(--bz-fg-mid);margin-bottom:6px}
.level-editor__transforms label{display:flex;align-items:center;gap:6px;border:1px solid var(--bz-border);border-radius:6px;padding:6px 8px;background:var(--bz-bg)}.level-editor__transforms label:focus-within{border-color:var(--bz-accent)}
.level-editor__transforms label span{font-size:11px;color:var(--bz-fg-mid)}.level-editor__transforms input{min-width:0;width:100%;border:0!important;box-shadow:none!important;outline:none!important;background:transparent;padding:0;color:var(--bz-fg);font-size:13px}
.level-editor__assets{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px;max-height:220px;overflow:auto;padding:2px}.level-editor__assets button{padding:6px;min-width:0;border:1px solid var(--bz-border);border-radius:8px;background:var(--bz-bg);color:var(--bz-fg);cursor:grab}.level-editor__assets button:hover,.level-editor__assets [aria-pressed="true"]{border-color:var(--bz-accent)}
.level-editor__assets img{width:100%;height:64px;object-fit:cover;border-radius:4px}.level-editor__assets .material-symbols-outlined{display:grid;place-items:center;height:64px}.level-editor__assets small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:5px;font-size:11px}
.level-editor__status{margin:0;padding:12px 20px;border-top:1px solid var(--bz-border)}.level-editor__status.is-error{color:var(--bz-danger)}.level-editor__instance{display:flex;gap:12px;margin-top:8px;align-items:center}.level-editor__instance label{display:flex;align-items:center;gap:8px;font-size:12px}.level-editor__instance input{width:70px}
@media(max-width:950px){.level-editor__body{grid-template-columns:1fr 1fr}.level-editor__library{grid-column:1/-1;border-left:0!important;border-top:1px solid var(--bz-border)}}
@media(max-width:600px){.level-editor__body{display:block}.level-editor__body>*+*{border-left:0;border-top:1px solid var(--bz-border)}.level-editor__body>div,.level-editor__body>form{padding:16px}.level-editor__bar{padding:12px}.level-editor__tools .bz-btn{padding:8px;font-size:12px}}
</style>
