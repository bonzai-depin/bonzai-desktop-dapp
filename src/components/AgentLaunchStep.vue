<template>
  <section class="agent-launch-section agent-next" aria-label="Use your agent">
    <header><span class="agent-stage-label">03 / {{ $ui('Next step') }}</span><h2>{{ $ui('Use your agent') }}</h2></header>
    <ol class="agent-next__steps">
      <li><span class="agent-next__number">1</span><div><h3>{{ $ui('Attach an agent slot') }}</h3>
        <p v-if="attached">{{ network }} · #{{ agent.tokenId }}</p>
        <template v-else>
          <p>{{ $ui('Choose an unissued slot owned by your connected wallet.') }}</p>
          <button v-if="!connected" class="bz-btn bz-btn--secondary" @click="connect">{{ $ui('Connect wallet') }}</button>
          <div v-else class="agent-next__slot"><select v-model="slotId" :disabled="busy || !slots.length" :aria-label="$ui('Agent slot')"><option value="">{{ $ui('Select a slot') }}</option><option v-for="slot in slots" :key="slot.tokenId" :value="slot.tokenId">#{{ slot.tokenId }}{{ slot.name ? ' · ' + slot.name : '' }}</option></select>
          <button class="bz-btn bz-btn--secondary" :disabled="busy || !agent" @click="refresh">{{ $ui('Find my slots') }}</button></div>
          <button v-if="slotId" class="bz-btn bz-btn--primary" :disabled="busy" @click="perform(() => attach(slotId))">{{ $ui('Attach slot') }}</button>
          <p v-if="searched && !slots.length">{{ $ui('No available slots in this wallet. You can still start roleplay.') }}</p>
        </template>
      </div></li>
      <li><span class="agent-next__number">2</span><div><h3>{{ $ui('Update onchain identity') }}</h3><p>{{ $ui('Publish the generated profile and portrait.') }}</p>
        <button class="bz-btn bz-btn--secondary" :disabled="busy || !owned || !!token || launching" @click="publish(agent)">{{ $ui('Update onchain identity') }}</button>
        <small v-if="ready && !token">{{ $ui('Identity published. You can update it before launching the token.') }}</small>
        <small v-if="token">{{ $ui('Identity is locked after token issuance.') }}</small>
      </div></li>
      <li><span class="agent-next__number">3</span><div><h3>{{ $ui('Launch token + pool') }}</h3><p>{{ symbol ? '$' + symbol : $ui('Agent token') }} / NVDA · {{ network }}</p><p>{{ $ui('Uses the reserved 1 ETH. 96% of supply in permanently locked liquidity. Trading fee: 1%, split 40% agent wallet / 40% NFT owner / 10% treasury / 10% rewards.') }}</p>
        <button v-if="pending" class="bz-btn bz-btn--secondary" :disabled="busy || launching" @click="check(agent)">{{ $ui('Check issuance') }}</button>
        <button v-else-if="!token" class="bz-btn bz-btn--primary" :disabled="busy || !owned || !ready || launching" @click="launch(agent)">{{ launching ? $ui('Waiting for confirmation…') : $ui('Launch token + pool') }}</button>
        <p v-else class="agent-next__success">{{ $ui('Token and pool launched') }}</p>
      </div></li>
    </ol>
    <p v-if="error" role="alert" class="agent-next__error">{{ error }}</p>
    <p v-if="!configured" class="agent-next__hint">{{ $ui('Onchain setup is not configured on this network yet.') }}</p>
    <footer><span>{{ $ui('or') }}</span><button class="bz-btn bz-btn--secondary" :disabled="!agent || busy || generating || launching" @click="perform(startRoleplay)"><span class="material-symbols-outlined" aria-hidden="true">chat_bubble</span>{{ $ui('Start roleplay') }}</button><small>{{ $ui('No slot, token or wallet required.') }}</small></footer>
  </section>
</template>
<script setup>
import { ref } from 'vue';
import { companionTokenService } from '../services/companionToken.service.js';
const props = defineProps({agent:Object, network:String,symbol:String, attached:Boolean,owned:Boolean,ready:Boolean,token:String,pending:Boolean,configured:Boolean,launching:Boolean,generating:Boolean,connected:Boolean,connect:Function,attach:Function,publish:Function,launch:Function,check:Function,startRoleplay:Function,loadSlots:{type:Function,default:()=>companionTokenService.getOwnedAgentSlots()}});
const busy=ref(false),error=ref(''),slots=ref([]),slotId=ref(''),searched=ref(false);
async function perform(action){busy.value=true;error.value='';try{await action();}catch(e){error.value=e.message;}finally{busy.value=false;}}
const refresh=()=>perform(async()=>{slots.value=await props.loadSlots();searched.value=true;slotId.value='';});
</script>
<style scoped>
.agent-next{display:flex;flex-direction:column;gap:24px;min-width:0;color:var(--bz-fg)}
.agent-next h2{font-family:var(--bz-font-metric);font-size:28px;margin:8px 0 0}.agent-next h3{font-size:16px;font-weight:600;margin:0 0 8px}
.agent-next__steps{list-style:none;padding:0;margin:0;display:grid;gap:24px}.agent-next__steps li{display:grid;grid-template-columns:28px minmax(0,1fr);gap:12px}.agent-next__number{font-family:var(--bz-font-metric);color:var(--bz-accent);font-size:24px;line-height:1.2}
.agent-next p,.agent-next small{color:var(--bz-muted);font-size:13px;line-height:1.6;margin:0 0 12px;overflow-wrap:anywhere}.agent-next small{display:block;margin:8px 0 0}
.agent-next__slot{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.agent-next select{flex:1;min-width:100px;max-width:100%;padding:10px 32px 10px 12px;border:1px solid var(--bz-border);border-radius:var(--bz-radius-sm,8px);background:var(--bz-panel);color:var(--bz-fg)}
.agent-next .bz-btn{white-space:normal;height:auto;min-height:38px}.agent-next footer{margin-top:auto;border-top:1px solid var(--bz-border);padding-top:20px;display:grid;gap:10px;text-align:center}.agent-next footer>span{color:var(--bz-muted);font-size:13px}.agent-next .agent-next__error{color:var(--bz-danger)}.agent-next .agent-next__success{color:var(--bz-success)}

.agent-next h2 { font: 900 italic 28px/1.2 var(--bz-font-metric); }
.agent-next__number { font-weight:900; font-style:italic; }
.agent-next__steps { gap:28px; }
</style>
