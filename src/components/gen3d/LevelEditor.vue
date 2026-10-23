<template>
  <section class="level-editor" :aria-label="$t('levelEditor.title')">
    <header class="level-editor__bar">
      <div class="level-editor__tools" role="group" :aria-label="$t('levelEditor.title')">
        <button v-for="tool in tools" :key="tool.id" type="button" class="bz-btn bz-btn--ghost" :aria-pressed="mode===tool.id" :disabled="busy" @click="setMode(tool.id)">
          <span class="material-symbols-outlined" aria-hidden="true">{{tool.icon}}</span>{{$t(`levelEditor.${tool.label}`)}}
        </button>
        <span class="level-editor__divider" aria-hidden="true"></span>
        <button type="button" class="bz-btn bz-btn--ghost" :aria-pressed="snap" :disabled="busy" @click="snap=!snap;controller?.setSnap(snap)"><span class="material-symbols-outlined" aria-hidden="true">grid_4x4</span>{{$t('levelEditor.snap')}}</button>
      </div>
      <div class="level-editor__tools">
        <button type="button" class="bz-btn bz-btn--ghost" :aria-pressed="panelOpen && panel==='build'" @click="showPanel('build')"><span class="material-symbols-outlined" aria-hidden="true">deployed_code</span>{{$t('levelEditor.objects')}}</button>
        <button type="button" class="bz-btn bz-btn--ghost" :aria-pressed="panelOpen && panel==='rules'" @click="showPanel('rules')"><span class="material-symbols-outlined" aria-hidden="true">flag</span>{{$t('levelEditor.rules')}}</button>
        <button type="button" class="bz-iconbtn" :title="$t('levelEditor.undo')" :aria-label="$t('levelEditor.undo')" :disabled="busy||!canUndo" @click="$emit('undo')"><span class="material-symbols-outlined">undo</span></button>
        <button type="button" class="bz-iconbtn" :title="$t('levelEditor.redo')" :aria-label="$t('levelEditor.redo')" :disabled="busy||!canRedo" @click="$emit('redo')"><span class="material-symbols-outlined">redo</span></button>
        <button type="button" class="bz-btn bz-btn--ghost" :disabled="busy" @click="$emit('save')"><span class="material-symbols-outlined" aria-hidden="true">save</span>{{$t('levelEditor.save')}}</button>
      </div>
    </header>

    <aside v-show="panelOpen" class="level-editor__inspector" :aria-label="$t('levelEditor.inspector')">
      <nav class="level-editor__tabs" :aria-label="$t('levelEditor.inspector')">
        <button type="button" :aria-pressed="panel==='build'" @click="$emit('update:panel','build')"><span class="material-symbols-outlined" aria-hidden="true">deployed_code</span>{{$t('levelEditor.objects')}}</button>
        <button type="button" :aria-pressed="panel==='rules'" @click="$emit('update:panel','rules')"><span class="material-symbols-outlined" aria-hidden="true">flag</span>{{$t('levelEditor.rules')}}</button>
        <button type="button" class="level-editor__close" :aria-label="$t('levelEditor.closePanel')" @click="panelOpen=false"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
      </nav>
      <div class="level-editor__inspector-scroll">
        <slot v-if="panel==='rules'" name="rules" />
        <template v-else>
          <div class="level-editor__selection-heading">
            <div><span class="level-editor__eyebrow">{{$t(selected?'levelEditor.selectedObject':'levelEditor.scene')}}</span><h3>{{selectedTitle || $t('levelEditor.pickObject')}}</h3></div>
            <button v-if="selected" type="button" class="bz-iconbtn" :aria-label="$t('levelEditor.deselect')" @click="controller?.selectByKey('')"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
          </div>
          <button v-if="selected" type="button" class="level-editor__browse" :aria-expanded="objectListOpen" @click="objectListOpen=!objectListOpen"><span class="material-symbols-outlined" aria-hidden="true">account_tree</span>{{$t('levelEditor.browseObjects')}}<span class="material-symbols-outlined" aria-hidden="true">{{objectListOpen?'expand_less':'expand_more'}}</span></button>
          <div v-if="!selected || objectListOpen" class="level-editor__object-browser">
            <label class="level-editor__search"><span class="material-symbols-outlined" aria-hidden="true">search</span><input v-model="objectSearch" type="search" :aria-label="$t('levelEditor.findObject')" :placeholder="$t('levelEditor.findObject')" /></label>
            <div class="level-editor__object-list" :aria-label="$t('levelEditor.objects')">
              <button v-for="entry in filteredEntries" :key="entry.key" type="button" :data-object-key="entry.key" :aria-pressed="selectedKey===entry.key" :disabled="busy" :style="{'--depth':Math.min(entry.depth,4)}" @click="chooseObject(entry.key)"><span class="material-symbols-outlined" aria-hidden="true">{{entry.instanceCount?'view_module':entry.depth?'deployed_code':'deployed_code_account'}}</span><span>{{entry.title}}</span><small v-if="entry.instanceCount">{{entry.instanceCount}}</small></button>
              <p v-if="!filteredEntries.length" class="level-editor__hint">{{$t('levelEditor.noMatches')}}</p>
            </div>
          </div>
          <template v-if="selected">
            <div v-if="selected.instanceCount" class="level-editor__instance">
              <button type="button" class="bz-btn bz-btn--ghost" :disabled="busy" @click="chooseInstance(null)">{{$t('levelEditor.allInstances')}}</button>
              <label>{{$t('levelEditor.instance')}}<input class="bz-field-input" type="number" min="1" :max="selected.instanceCount" :value="selected.target.instanceId==null?'':selected.target.instanceId+1" :disabled="busy" @change="chooseInstance(Number($event.target.value)-1)" /></label>
            </div>
            <div class="level-editor__transforms">
              <fieldset v-for="field in ['position','rotation','scale']" :key="field" :disabled="busy">
                <legend>{{$t(`levelEditor.${field}`)}}{{field==='rotation'?' · °':''}}</legend>
                <label v-for="axis in ['x','y','z']" :key="axis"><span>{{axis.toUpperCase()}}</span><input type="number" :aria-label="`${$t(`levelEditor.${field}`)} ${axis.toUpperCase()}`" :step="field==='rotation'?15:field==='scale'?.1:.25" v-model.number="draft[field][axis]" @change="commitFields" /></label>
              </fieldset>
            </div>
            <div class="level-editor__object-actions"><slot name="selection" /></div>
            <details class="level-editor__regeneration">
              <summary><span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>{{$t('levelEditor.redesign')}}</summary>
              <form class="level-editor__regenerate" @submit.prevent="$emit('regenerate',{selection:selected,prompt:prompt.trim()})">
                <label class="level-editor__label" for="level-replacement-prompt">{{$t('levelEditor.regenerate')}}</label>
                <textarea id="level-replacement-prompt" class="bz-field-input" rows="3" v-model="prompt" :placeholder="$t('levelEditor.prompt')" :disabled="busy" />
                <p class="level-editor__hint">{{$t('levelEditor.scope')}}</p>
                <button type="submit" class="bz-btn bz-btn--ghost" :disabled="busy||!prompt.trim()||!modelReady"><span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>{{$t(generating?'levelEditor.busy':'levelEditor.regenerate')}}</button>
                <button v-if="generating" type="button" class="bz-btn bz-btn--ghost" @click="$emit('cancel-generation')">{{$t('levelEditor.stop')}}</button>
              </form>
            </details>
          </template>
          <p v-else class="level-editor__hint level-editor__selection-hint"><span class="material-symbols-outlined" aria-hidden="true">ads_click</span>{{$t('levelEditor.clickObject')}}</p>
        </template>
      </div>
    </aside>

    <section class="level-editor__library" :aria-label="$t('levelEditor.assets')">
      <header class="level-editor__library-heading"><h3>{{$t('levelEditor.assets')}} <span>{{assets.length}}</span></h3><span class="level-editor__shelf-hint">{{$t(pending?'levelEditor.clickToPlace':'levelEditor.dragToPlace')}}</span><button v-if="pending" type="button" class="bz-btn bz-btn--ghost" @click="armAsset(null)">{{$t('levelEditor.cancel')}}</button><label v-else-if="assets.length>6" class="level-editor__search"><span class="material-symbols-outlined" aria-hidden="true">search</span><input v-model="assetSearch" type="search" :aria-label="$t('levelEditor.findAsset')" :placeholder="$t('levelEditor.findAsset')" /></label></header>
      <div class="level-editor__assets">
        <button v-for="asset in filteredAssets" :key="asset.libraryId" type="button" :title="asset.title" :aria-label="asset.title" :aria-pressed="pending===asset.libraryId" :disabled="busy" :draggable="!busy" @dragstart="beginDrag(asset,$event)" @dragend="dragEnd" @click="armAsset(pending===asset.libraryId?null:asset)">
          <span class="level-editor__asset-art"><img v-if="asset.thumbnail" :src="asset.thumbnail" alt="" draggable="false"/><span v-else class="material-symbols-outlined" aria-hidden="true">deployed_code</span><span class="level-editor__asset-add material-symbols-outlined" aria-hidden="true">{{pending===asset.libraryId?'check':'add'}}</span></span><small>{{asset.title}}</small>
        </button>
        <p v-if="!assets.length" class="level-editor__hint">{{$t('levelEditor.emptyAssets')}}</p>
        <p v-else-if="!filteredAssets.length" class="level-editor__hint">{{$t('levelEditor.noMatches')}}</p>
      </div>
    </section>
    <p v-if="message||error" class="level-editor__status" :class="{'is-error':error}" role="status"><span class="material-symbols-outlined" aria-hidden="true">{{error?'error_outline':'check_circle'}}</span>{{error||message}}</p>
  </section>
</template>

<script setup>
import {ref,computed,watch,nextTick,onBeforeUnmount} from 'vue';
import {LevelEditControls} from './levelEditControls.js';
const props=defineProps({viewer:Object,revision:Number,assets:{type:Array,default:()=>[]},busy:Boolean,generating:Boolean,modelReady:{type:Boolean,default:true},canUndo:Boolean,canRedo:Boolean,message:String,panel:{type:String,default:'build'}});
const emit=defineEmits(['selection','transform','regenerate','place','save','undo','redo','cancel-generation','update:panel']);
const entries=ref([]),selected=ref(null),draft=ref(null),prompt=ref(''),mode=ref('translate'),snap=ref(false),pending=ref(''),error=ref('');
const panelOpen=ref(false);
function showPanel(value){panelOpen.value=!(panelOpen.value && props.panel===value);emit('update:panel',value);}
const objectSearch=ref(''),assetSearch=ref(''),objectListOpen=ref(false);
const filteredEntries=computed(()=>entries.value.filter(item=>item.title.toLowerCase().includes(objectSearch.value.toLowerCase())));
const filteredAssets=computed(()=>props.assets.filter(item=>item.title.toLowerCase().includes(assetSearch.value.toLowerCase())));
const selectedTitle=computed(()=>selected.value?.title || '');
function chooseObject(key){controller?.selectByKey(key);objectListOpen.value=false;}
let controller=null,disposed=false;
const selectedKey=computed(()=>entries.value.some(entry=>entry.key===selected.value?.key)?selected.value.key:selected.value?.target.instanceId!=null?`node:${selected.value.target.path}`:selected.value?.key||'');
const tools=[{id:'translate',label:'move',icon:'open_with'},{id:'rotate',label:'rotate',icon:'rotate_right'},{id:'scale',label:'scale',icon:'aspect_ratio'}];
const select=value=>{
  if(value?.key!==selected.value?.key){prompt.value='';error.value='';}
  if(value && value.key!==selected.value?.key){panelOpen.value=true;emit('update:panel','build');}
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
defineExpose({detach,refresh,getMarkerPosition:()=>controller?.markerPosition(),selectTarget:target=>controller?.selectTarget(target),getSelection:()=>selected.value});
</script>

<style scoped>
/* The parent owns the grid so the WebGL canvas stays mounted in every mode. */
.level-editor { display: contents; color: var(--bz-fg); }
.level-editor * { box-sizing: border-box; }
.level-editor__bar { grid-area: tools; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--bz-border); background: var(--bz-panel); }
.level-editor__tools { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.level-editor__tools .bz-btn { min-height: 36px; padding: 7px 12px; font-size: 13px; }
.level-editor__tools .bz-iconbtn { width: 36px; height: 36px; }
.level-editor__tools [aria-pressed="true"] { color: var(--bz-accent); background: var(--bz-accent-soft); border-color: var(--bz-accent); }
.level-editor__divider { height: 22px; border-left: 1px solid var(--bz-border); margin: 0 4px; }
.level-editor__inspector { grid-area: viewport; z-index: 5; justify-self: end; align-self: stretch; width: min(480px, calc(100% - 24px)); margin: 12px; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--bz-panel); border: 1px solid var(--bz-border); border-radius: 12px; overflow: hidden; box-shadow: 0 8px 24px #0003; }
.level-editor__tabs { display: flex; flex: none; border-bottom: 1px solid var(--bz-border); padding: 0 16px; gap: 16px; }
.level-editor__tabs button { display: flex; align-items: center; gap: 6px; min-height: 48px; padding: 10px 0; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--bz-fg-mid); font: inherit; font-size: 13px; cursor: pointer; }
.level-editor__tabs .level-editor__close { margin-left: auto; padding-inline: 6px; }
.level-editor__tabs [aria-pressed="true"] { border-bottom-color: var(--bz-accent); color: var(--bz-fg); }
.level-editor .material-symbols-outlined { font-size: 18px; font-variation-settings: 'wght' 200; }
.level-editor__inspector-scroll { padding: 16px 20px; overflow: auto; scrollbar-width: thin; scrollbar-gutter: stable; min-height: 0; overscroll-behavior: contain; }
.level-editor__selection-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 16px; }
.level-editor__eyebrow { font-size: 10px; color: var(--bz-fg-mid); text-transform: uppercase; letter-spacing: .08em; }
.level-editor h3 { font-family: var(--bz-font-metric); font-size: 24px; font-weight: 900; font-style: italic; line-height: 1.2; margin: 5px 0 0; overflow-wrap: anywhere; }
.level-editor__browse { width: 100%; display: flex; align-items: center; gap: 8px; padding: 10px 0; border: 0; border-block: 1px solid var(--bz-border); background: transparent; color: var(--bz-fg-mid); font: inherit; font-size: 12px; cursor: pointer; }
.level-editor__browse span:last-child { margin-left: auto; }
.level-editor__search { display: flex; align-items: center; gap: 8px; border: 1px solid var(--bz-border); border-radius: 6px; padding: 8px 10px; background: var(--bz-bg); color: var(--bz-fg-mid); min-width: 0; }
.level-editor__search input { width: 100%; min-width: 0; padding: 0; border: 0; outline: 0; background: transparent; color: var(--bz-fg); font: inherit; font-size: 12px; }
.level-editor__search:focus-within { border-color: var(--bz-accent); }
.level-editor__object-browser { margin-top: 12px; }
.level-editor__object-list { max-height: 260px; overflow: auto; margin-top: 10px; }
.level-editor__object-list button { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 8px 9px calc(8px + var(--depth) * 12px); border: 0; border-radius: 5px; color: var(--bz-fg); background: transparent; font: inherit; text-align: left; font-size: 13px; cursor: pointer; }
.level-editor__object-list button:hover, .level-editor__object-list [aria-pressed="true"] { background: var(--bz-accent-soft); color: var(--bz-accent); }
.level-editor__object-list button>span:nth-child(2) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.level-editor__object-list small { margin-left: auto; color: var(--bz-fg-mid); }
.level-editor__hint { font-size: 12px; line-height: 1.5; color: var(--bz-fg-mid); margin: 12px 0; }
.level-editor__selection-hint { display: flex; align-items: start; gap: 8px; padding-top: 12px; border-top: 1px solid var(--bz-border); }
.level-editor__transforms fieldset { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 6px; border: 0; padding: 0; margin: 12px 0 0; }
.level-editor__transforms legend { font-size: 12px; color: var(--bz-fg-mid); margin-bottom: 8px; }
.level-editor__transforms label { display: flex; align-items: center; gap: 6px; border: 1px solid var(--bz-border); border-radius: 6px; padding: 8px; background: var(--bz-bg); }
.level-editor__transforms label:focus-within { border-color: var(--bz-accent); }
.level-editor__transforms label span { font-size: 10px; color: var(--bz-fg-mid); }
.level-editor__transforms input { min-width: 0; width: 100%; border: 0!important; box-shadow: none!important; outline: none!important; background: transparent; padding: 0; color: var(--bz-fg); font-size: 12px; }
.level-editor__object-actions:empty { display: none; }
.level-editor__object-actions { display: grid; gap: 10px; margin-top: 20px; }
.level-editor__regeneration { margin-top: 20px; border-top: 1px solid var(--bz-border); }
.level-editor__regeneration summary { padding: 16px 0; cursor: pointer; font-size: 13px; color: var(--bz-fg); }
.level-editor__regeneration summary span { vertical-align: middle; margin: 0 6px; }
.level-editor__label { display: block; font-size: 12px; margin-bottom: 8px; }
.level-editor__regenerate textarea { width: 100%; padding: 12px; min-height: 180px; border: 1px solid var(--bz-border); border-radius: 8px; background: var(--bz-bg); color: var(--bz-fg); resize: vertical; font: inherit; font-size: 13px; }
.level-editor__regenerate .bz-btn { width: 100%; margin-bottom: 8px; }
.level-editor__instance { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; align-items: center; }
.level-editor__instance label { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.level-editor__instance input { width: 60px; }
.level-editor__library { grid-area: assets; padding: 14px 16px; background: var(--bz-panel); border-top: 1px solid var(--bz-border); min-width: 0; }
.level-editor__library-heading { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; min-height: 30px; }
.level-editor__library-heading h3 { font-family: inherit; font-size: 13px; font-weight: 600; font-style: normal; margin: 0; white-space: nowrap; }
.level-editor__library-heading h3 span { color: var(--bz-fg-mid); font-weight: 400; margin-left: 6px; }
.level-editor__shelf-hint { flex: 1; color: var(--bz-fg-mid); font-size: 12px; }
.level-editor__library-heading .level-editor__search { width: 170px; }
.level-editor__library-heading .bz-btn { font-size: 12px; padding: 6px 10px; min-height: 30px; }
.level-editor__assets { display: flex; gap: 12px; overflow-x: auto; padding: 2px 2px 4px; scrollbar-width: thin; }
.level-editor__assets>button { flex: 0 0 172px; width: 172px; display: grid; grid-template-columns: 64px minmax(0,1fr); align-items: center; gap: 10px; padding: 6px; border: 1px solid var(--bz-border); border-radius: 8px; background: var(--bz-bg); color: var(--bz-fg); cursor: grab; text-align: left; }
.level-editor__asset-art { position: relative; display: grid; place-items: center; height: 64px; overflow: hidden; border: 1px solid var(--bz-border); border-radius: 8px; background: var(--bz-bg); }
.level-editor__asset-art img { width: 100%; height: 100%; object-fit: cover; }
.level-editor__asset-art>.material-symbols-outlined:first-child { font-size: 28px; color: var(--bz-fg-mid); }
.level-editor__asset-add { position: absolute; bottom: 4px; right: 4px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 5px; background: var(--bz-panel); color: var(--bz-fg); }
.level-editor__assets>button:hover .level-editor__asset-art, .level-editor__assets>button[aria-pressed="true"] .level-editor__asset-art { border-color: var(--bz-accent); }
.level-editor__assets>button[aria-pressed="true"] .level-editor__asset-add { background: var(--bz-accent); color: var(--bz-bg); }
.level-editor__assets small { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.3; max-height: 42px; margin: 0; font-size: 11px; -webkit-line-clamp: 3; }
.level-editor__status { grid-area: status; display: flex; align-items: center; gap: 8px; margin: 0; padding: 8px 16px; background: var(--bz-panel); border-top: 1px solid var(--bz-border); color: var(--bz-fg-mid); font-size: 11px; }
.level-editor__status.is-error { color: var(--bz-danger); }
.level-editor button:focus-visible, .level-editor summary:focus-visible { outline: 2px solid var(--bz-accent); outline-offset: 2px; }
@media(max-width:760px) {
  .level-editor__bar { flex-wrap: wrap; padding: 10px; gap: 8px; }
  .level-editor__tools .bz-btn { padding: 7px 9px; font-size: 12px; }
  .level-editor__inspector { margin: 8px; width: calc(100% - 16px); }
  .level-editor__library-heading { flex-wrap: wrap; gap: 8px; }
  .level-editor__shelf-hint { flex-basis: 50%; }
}
</style>
