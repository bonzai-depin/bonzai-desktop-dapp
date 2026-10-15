<template>
  <section class="example-library" aria-label="3D example library">
    <header><div><h2 class="bz-h2">Example library</h2><p>Build a world, one asset at a time. Browse compatible kits or search for a specific piece.</p></div><span class="bz-metric">{{ assetCount }} assets · {{ ASSET_KITS.length }} kits</span></header>
    <div class="example-library__filters">
      <label>Search<input v-model="query" type="search" placeholder="Try castle walls, a royal crown, or a vehicle…" /></label>
      <label>Creation type<select v-model="kind" aria-label="Creation type"><option value="all">All types</option><option v-for="type in EXAMPLE_KINDS" :key="type.id" :value="type.id">{{ type.label }}</option></select></label>
      <label>Game genre<select v-model="genre" aria-label="Game genre"><option value="all">All genres</option><option v-for="item in GAME_GENRES" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
      <label v-if="kind === 'object' || kind === 'all'">Asset kit<select v-model="kit" aria-label="Asset kit"><option value="all">All kits</option><option v-for="item in ASSET_KITS" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
    </div>
    <p v-if="selectedKit" class="example-library__kit-note">{{ selectedKit.label }} · {{ kitCount }} individual assets with shared materials and dimensions. Generate each piece separately, then assemble them in Build.</p>
    <p role="status">Showing {{ visible.length }} of {{ filtered.length }} examples · Editable generation briefs.</p>
    <div class="example-library__grid">
      <button v-for="example in visible" :key="example.id" type="button" class="example-library__card" @click="$emit('select', example)">
        <span class="example-library__category"><span class="material-symbols-outlined" aria-hidden="true">{{ example.icon }}</span>{{ example.kitLabel || genreLabel(example.genre) }} · {{ kindLabel(example.kind) }}</span>
        <strong>{{ example.title }}</strong><span class="example-library__description">{{ example.description }}</span><span class="example-library__cta">Use brief <span aria-hidden="true">↗</span></span>
      </button>
    </div>
    <div v-if="!filtered.length" class="example-library__empty"><p>No examples match these filters.</p><button type="button" @click="reset">Reset filters</button></div>
    <button v-if="visible.length < filtered.length" type="button" class="example-library__more" @click="limit += 24">Show more examples ({{ filtered.length - visible.length }} remaining)</button>
  </section>
</template>
<script setup>
import {ref,computed,watch} from 'vue';
import {EXAMPLE_LIBRARY,EXAMPLE_KINDS,GAME_GENRES,ASSET_KITS,filterExamples} from './exampleLibrary.js';
const props=defineProps({initialKind:{type:String,default:'object'}});
defineEmits(['select']);
const query=ref(''),genre=ref('all'),kind=ref(props.initialKind),kit=ref('all'),limit=ref(24);
watch(()=>props.initialKind,value=>{kind.value=value;});
watch(kind,value=>{if(value !== 'object' && value !== 'all') kit.value='all';});
watch([query,genre,kind,kit],()=>{limit.value=24;});
const assetCount=EXAMPLE_LIBRARY.filter(item=>item.kind==='object').length;
const selectedKit=computed(()=>ASSET_KITS.find(item=>item.id===kit.value));
const kitCount=computed(()=>EXAMPLE_LIBRARY.filter(item=>item.kit===kit.value).length);
const filtered=computed(()=>filterExamples({kind:kind.value,genre:genre.value,query:query.value,kit:kit.value}));
const visible=computed(()=>filtered.value.slice(0,limit.value));
const genreLabel=id=>GAME_GENRES.find(g=>g.id===id)?.label;
const kindLabel=id=>EXAMPLE_KINDS.find(k=>k.id===id)?.label;
function reset(){query.value='';genre.value='all';kind.value='all';kit.value='all';}
</script>
<style scoped>
.example-library{padding:var(--bz-space-4);color:var(--bz-fg);min-width:0}
header{display:flex;align-items:start;justify-content:space-between;gap:var(--bz-space-4);margin-bottom:var(--bz-space-4)}
header p,.example-library>p{color:var(--bz-muted);margin:.5rem 0 1rem;line-height:1.5}
header>.bz-metric{white-space:normal;text-align:right}
.example-library__kit-note{padding:1rem;border-left:3px solid var(--bz-accent);background:var(--bz-card);border-radius:var(--bz-r)}
.example-library__filters{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:var(--bz-space-3)}
label{display:flex;flex-direction:column;gap:.5rem;font-size:.875rem;min-width:0}
input,select{width:100%;min-width:0;box-sizing:border-box;padding:.75rem;background:var(--bz-card);color:var(--bz-fg);border:1px solid var(--bz-border);border-radius:var(--bz-r);font:inherit}
.example-library__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:var(--bz-space-3)}
.example-library__card{display:flex;flex-direction:column;text-align:left;gap:.75rem;padding:var(--bz-space-4);color:var(--bz-fg);background:var(--bz-card);border:1px solid var(--bz-border);border-radius:var(--bz-r);cursor:pointer;font:inherit;min-width:0;overflow-wrap:anywhere}
.example-library__card:hover{background:var(--bz-raised);border-color:var(--bz-accent)}
.example-library__category{display:flex;gap:.5rem;align-items:center;font-size:.75rem;color:var(--bz-muted)}
.example-library__category .material-symbols-outlined{font-size:20px}
.example-library__card strong{color:var(--bz-fg);font-size:1.1rem;font-weight:600}
.example-library__description{font-size:.875rem;line-height:1.6;color:var(--bz-muted)}
.example-library__cta{margin-top:auto;padding-top:.5rem;font-size:.8rem;color:var(--bz-fg)}
.example-library__more,.example-library__empty button{padding:.75rem 1rem;color:var(--bz-fg);background:var(--bz-card);border:1px solid var(--bz-border);border-radius:var(--bz-r);cursor:pointer;font:inherit;margin-top:1rem}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--bz-accent);outline-offset:3px}
@media(max-width:650px){.example-library__filters{grid-template-columns:1fr}header{flex-direction:column}.example-library{padding:var(--bz-space-3)}}
</style>
