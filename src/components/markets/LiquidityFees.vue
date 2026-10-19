<template>
  <section class="liquidity-fees" aria-label="Trading fees">
    <div class="liquidity-fees__heading"><div><p class="bz-eyebrow">Locked Liquidity</p><h3>Trading fees</h3></div><button class="bz-btn bz-btn--ghost" :disabled="busy || loading" aria-label="Refresh fee balances" @click="refresh">Refresh</button></div>
    <p v-if="loading" role="status">Loading fee balances…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <template v-if="info">
      <p>1% trading fee · {{ kind === 'companion' ? '40% agent wallet / 40% NFT owner / 10% treasury / 10% rewards' : '80% creator / 10% treasury / 10% rewards' }}</p>
      <button class="bz-btn bz-btn--primary" :disabled="busy" @click="act('collect')">{{ busy ? 'Confirming transaction…' : 'Collect pool fees' }}</button>
      <p>Anyone can collect. Principal stays locked; fees are credited to their beneficiaries.</p>
      <div v-for="currency in info.currencies" :key="currency.address" class="liquidity-fees__currency">
        <strong>{{ currency.symbol }}</strong><span>{{ wallet ? `${currency.amount} claimable in this vault` : 'Connect your wallet to see your share' }}</span>
        <button class="bz-btn bz-btn--ghost" :disabled="busy || !wallet || currency.claimable === 0n" @click="act('claim',currency.address)">Claim my fees</button>
        <span>{{ currency.rewardAmount }} pending rewards</span><button class="bz-btn bz-btn--ghost" :disabled="busy || currency.rewards === 0n" @click="act('rewards',currency.address)">Deposit rewards</button>
      </div>
      <button v-if="!wallet" class="bz-btn bz-btn--ghost" :disabled="busy" @click="connect">Connect wallet</button>
      <p v-if="transaction" role="status">Transaction confirmed: {{ transaction }}</p>
    </template>
    <p v-else-if="!loading && !error">No registered liquidity position.</p>
  </section>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import {web3Service} from '../../services/web3.service.js';
import {getLiquidityVault,transactLiquidityFees} from '../../services/liquidityVault.service.js';
const props=defineProps({token:{type:String,required:true},kind:{type:String,required:true}});
const wallet=computed(()=>web3Service.state.walletAddress),info=ref(null),error=ref(''),busy=ref(false),loading=ref(false),transaction=ref('');let revision=0;
async function refresh(){const current=++revision;loading.value=true;error.value='';try{const result=await getLiquidityVault(props.token,props.kind,wallet.value);if(current===revision)info.value=result;}catch(e){if(current===revision)error.value=e.shortMessage||e.message;}finally{if(current===revision)loading.value=false;}}
async function act(action,currency){busy.value=true;error.value='';try{transaction.value=await transactLiquidityFees({token:props.token,kind:props.kind,action,currency});await refresh();}catch(e){error.value=e.shortMessage||e.message;}finally{busy.value=false;}}
async function connect(){try{await web3Service.connectWallet();}catch(e){error.value=e.message;}}
watch(()=>[props.token,props.kind,wallet.value],()=>{info.value=null;transaction.value='';refresh();},{immediate:true});
</script>
<style scoped>
.liquidity-fees{grid-column:1/-1;border-top:1px solid var(--bz-border);padding:24px 0;min-width:0;overflow-wrap:anywhere}.liquidity-fees__heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.liquidity-fees h3{margin:4px 0 16px}.liquidity-fees p{margin:12px 0}.liquidity-fees__currency{display:flex;align-items:center;flex-wrap:wrap;gap:16px;padding:16px 0}
</style>
