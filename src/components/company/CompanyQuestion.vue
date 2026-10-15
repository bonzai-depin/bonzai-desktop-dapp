<template>
  <form class="company-question company-screen" :class="{'is-inline': inline}" @submit.prevent="send" data-i18n-skip>
    <header><span class="material-symbols-outlined" aria-hidden="true">chat_bubble</span><span>{{ $ui('Your answer is needed') }}</span><small>{{ teamName }}</small></header>
    <strong v-if="!inline">{{ visibleText(issue.title) }}</strong>
    <label :for="`answer-${issue.id}`">{{ visibleText(issue.execution.agent.wait.question) }}</label>
    <textarea :id="`answer-${issue.id}`" v-model="answer" :placeholder="$ui('Write your answer…')" rows="2" maxlength="10000" required :disabled="busy" />
    <footer><span v-if="error" role="alert">{{ error }}</span><button class="bz-btn bz-btn--primary" :disabled="busy || !answer.trim()">{{ busy ? $ui('Saving…') : $ui('Send answer') }}</button></footer>
  </form>
</template>
<script setup>
import "./company-design.css";
import { visibleText } from '../../shared/visibleText.js';
import { ref, getCurrentInstance } from 'vue';
const ui = getCurrentInstance().appContext.config.globalProperties.$ui;
const props = defineProps({ issue: { type: Object, required: true }, companyId: { type: String, required: true }, teamName: String, inline: Boolean });
const emit = defineEmits(['answered']);
const answer = ref(''), busy = ref(false), error = ref('');
async function send() {
  busy.value = true; error.value = '';
  try {
    const api = window.electronAPI?.db?.issues?.answerQuestion;
    if (!api) throw new Error(ui('Restart BonzAI to answer this question.'));
    await api(props.companyId, props.issue.id, answer.value);
    answer.value = ''; emit('answered');
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}
</script>
<style scoped>
.company-question { display: grid; gap: var(--bz-space-3); margin: var(--bz-space-5) 0; padding: var(--bz-space-5); border: 1px solid var(--bz-border-brand); border-left: 3px solid var(--bz-accent); border-radius: var(--bz-r-lg); background: var(--bz-panel); color: var(--bz-fg); min-width: 0; }
.company-question.is-inline { padding: 20px 0 0; margin: 0; border: 0; border-top: 1px solid var(--bz-border); border-radius: 0; background: transparent; }
header { display: flex; align-items: center; flex-wrap: wrap; gap: var(--bz-space-2); font-size: var(--bz-size-meta); color: var(--bz-fg-mid); }
header > .material-symbols-outlined { color: var(--bz-accent); font-size: 20px; }
header small { margin-left: auto; color: var(--bz-fg-mid); font-size: var(--bz-size-meta); padding: var(--bz-space-1) var(--bz-space-2); border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); }
strong, label { overflow-wrap: anywhere; line-height: 1.6; }
strong { font-weight: 500; font-size: var(--bz-size-h3); margin-top: var(--bz-space-1); }
label { color: var(--bz-fg-mid); font-size: var(--bz-size-body); }
textarea { width: 100%; box-sizing: border-box; min-height: 100px; padding: var(--bz-space-4); resize: vertical; border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r); background: var(--bz-canvas); color: var(--bz-fg); font: 400 var(--bz-size-body)/1.65 var(--bz-font-body); transition: border-color var(--bz-dur-fast); }
textarea::placeholder { color: var(--bz-fg-low); }
textarea:focus-visible { outline: 2px solid var(--bz-border-brand); outline-offset: 3px; border-color: var(--bz-accent); }
footer { display: flex; justify-content: flex-end; align-items: center; gap: var(--bz-space-3); flex-wrap: wrap; padding-top: var(--bz-space-1); }
footer span { color: var(--bz-danger); font-size: var(--bz-size-meta); margin-right: auto; overflow-wrap: anywhere; }
@media (max-width: 600px) { .company-question { padding: var(--bz-space-4); } header small { margin-left: 0; } }
@media (prefers-reduced-motion: reduce) { textarea { transition: none; } }
</style>
