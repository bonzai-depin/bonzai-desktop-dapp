<template>
  <div class="bz-tab-shell jobs">
    <header class="jobs__header">
      <div>
        <p class="bz-eyebrow">{{ i18n.t('views.jobs.eyebrow') }}</p>
        <h1 class="bz-h1">{{ i18n.t('views.jobs.title') }}</h1>
        <p class="jobs__subtitle">{{ i18n.t('views.jobs.subtitle') }}</p>
      </div>
      <button class="bz-btn bz-btn--primary" type="button" @click="showCreate = !showCreate">
        <span class="material-symbols-outlined">add</span>{{ showCreate ? i18n.t('views.jobs.close') : i18n.t('views.jobs.post') }}
      </button>
    </header>

    <form v-if="showCreate" class="jobs__composer" @submit.prevent="postJob">
      <label>{{ i18n.t('views.jobs.outcome') }}<input v-model="draft.title" class="jobs__input" required placeholder="Reconcile June invoices" /></label>
      <label class="jobs__composer-wide">{{ i18n.t('views.jobs.success') }}<textarea v-model="draft.description" class="jobs__input" required placeholder="Describe the process, source systems, approval limits, and final deliverable."></textarea></label>
      <label>{{ i18n.t('views.jobs.budget') }}<input v-model.number="draft.budget" class="jobs__input" min="0" step="1" type="number" /></label>
      <label>{{ i18n.t('views.jobs.skills') }}<input v-model="draft.requirements" class="jobs__input" placeholder="Accounting, Sage, reconciliation" /></label>
      <button class="bz-btn bz-btn--primary" type="submit">{{ i18n.t('views.jobs.publish') }}</button>
    </form>

    <div class="jobs__toolbar" role="tablist" aria-label="Job status">
      <button v-for="item in statuses" :key="item.id" class="jobs__filter" :class="{ 'is-active': status === item.id }" type="button" @click="status = item.id">{{ item.label }}</button>
      <span class="jobs__count bz-mono">{{ jobs.length }} jobs</span>
    </div>

    <div class="jobs__workspace">
      <aside class="jobs__list" aria-label="Jobs">
        <button v-for="job in jobs" :key="job.id" class="jobs__row" :class="{ 'is-active': selected?.id === job.id }" type="button" @click="selectJob(job)">
          <span class="jobs__row-main"><strong>{{ job.title }}</strong><small>{{ job.description }}</small></span>
          <span class="jobs__row-meta"><b>{{ money(job.budgetCents, job.currency) }}</b><i>{{ labelStatus(job.status) }}</i></span>
        </button>
        <div v-if="!jobs.length" class="jobs__empty">{{ i18n.t('views.jobs.noJobs') }}</div>
      </aside>

      <main class="jobs__detail">
        <div v-if="!selected" class="jobs__empty jobs__empty--detail">Select a job to review its scope and candidates.</div>
        <template v-else>
          <header class="jobs__detail-head">
            <div><p class="bz-eyebrow">{{ labelStatus(selected.status) }}</p><h2 class="bz-h2">{{ selected.title }}</h2></div>
            <strong class="jobs__budget bz-mono">{{ money(selected.budgetCents, selected.currency) }}</strong>
          </header>
          <p class="jobs__description">{{ selected.description }}</p>
          <div class="jobs__skills"><span v-for="skill in selected.requirements" :key="skill">{{ skill }}</span></div>

          <section v-if="selected.status === 'open'" class="jobs__section">
            <div class="jobs__section-head"><h3>{{ i18n.t('views.jobs.candidates') }}</h3><span>{{ applications.length }}</span></div>
            <div v-if="applications.length" class="jobs__applications">
              <article v-for="application in applications" :key="application.id" class="jobs__application">
                <div><strong>{{ companionName(application.companionId) }}</strong><p>{{ application.pitch }}</p></div>
                <div class="jobs__application-action"><span class="bz-mono">{{ money(application.proposedCents, selected.currency) }}</span><button class="bz-btn bz-btn--primary bz-btn--sm" type="button" @click="hire(application)">{{ i18n.t('views.jobs.hire') }}</button></div>
              </article>
            </div>
            <div v-else class="jobs__empty">No applications yet. Apply one of your companions below.</div>
          </section>

          <section v-if="contract" class="jobs__section">
            <div class="jobs__section-head"><h3>{{ i18n.t('views.jobs.delivery') }}</h3><span class="bz-mono">{{ shortHash(contract.termsHash) }}</span></div>
            <div class="jobs__milestone-form">
              <input v-model="milestone.title" class="jobs__input" placeholder="Add a milestone" />
              <input v-model.number="milestone.amount" class="jobs__input" type="number" min="0" placeholder="Amount" />
              <button class="bz-btn bz-btn--ghost bz-btn--sm" type="button" :disabled="!milestone.title" @click="createMilestone">Add</button>
            </div>
            <div class="jobs__milestones">
              <article v-for="item in milestones" :key="item.id" class="jobs__milestone">
                <span class="jobs__state" :class="`is-${item.status}`"></span>
                <div><strong>{{ item.title }}</strong><small>{{ item.evidence.length }} evidence item{{ item.evidence.length === 1 ? '' : 's' }}</small></div>
                <span class="bz-mono">{{ money(item.amountCents, selected.currency) }}</span>
                <button v-if="item.status === 'open'" class="bz-btn bz-btn--ghost bz-btn--sm" type="button" @click="addEvidence(item)">{{ i18n.t('views.jobs.evidence') }}</button>
                <button v-if="item.status === 'submitted'" class="bz-btn bz-btn--primary bz-btn--sm" type="button" @click="approve(item)">{{ i18n.t('common.approve') }}</button>
              </article>
            </div>
          </section>

          <section v-if="selected.status === 'open'" class="jobs__section">
            <div class="jobs__section-head"><h3>{{ i18n.t('views.jobs.companions') }}</h3><span>{{ companions.length }}</span></div>
            <div class="jobs__agents">
              <article v-for="companion in companions" :key="companion.id" class="jobs__agent">
                <img v-if="companion.image" :src="companion.image" alt="" />
                <span v-else class="material-symbols-outlined">smart_toy</span>
                <div><strong>{{ companion.name }}</strong><small>{{ companion.shortBio || companion.description || 'Ready to build job-specific expertise.' }}</small></div>
                <button class="bz-btn bz-btn--ghost bz-btn--sm" type="button" @click="apply(companion)">{{ i18n.t('views.jobs.apply') }}</button>
              </article>
            </div>
          </section>
        </template>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import * as jobsService from '../services/jobBoard.service.js'
import { useI18n } from '../i18n/index.js'

const i18n = useI18n()

const statuses = computed(() => [{ id: 'all', label: i18n.t('common.all') }, { id: 'open', label: i18n.t('common.open') }, { id: 'in_progress', label: 'In progress' }, { id: 'completed', label: 'Completed' }, { id: 'cancelled', label: 'Cancelled' }])
const status = ref('open')
const jobs = ref([])
const selected = ref(null)
const applications = ref([])
const companions = ref([])
const contract = ref(null)
const milestones = ref([])
const showCreate = ref(false)
const draft = reactive({ title: '', description: '', budget: 500, requirements: '' })
const milestone = reactive({ title: '', amount: 0 })

async function refresh() {
  jobs.value = await jobsService.listJobs(status.value)
  if (selected.value) {
    selected.value = jobs.value.find(job => job.id === selected.value.id) || selected.value
    await selectJob(selected.value)
  }
}
async function selectJob(job) {
  selected.value = job
  applications.value = await jobsService.listApplications(job.id)
  contract.value = await jobsService.getContract(job.id)
  milestones.value = contract.value ? await jobsService.listMilestones(contract.value.id) : []
}
async function postJob() {
  await jobsService.createJob({ title: draft.title, description: draft.description, budgetCents: Math.round(draft.budget * 100), requirements: draft.requirements.split(',').map(x => x.trim()).filter(Boolean) })
  Object.assign(draft, { title: '', description: '', budget: 500, requirements: '' })
  showCreate.value = false
  status.value = 'open'
  await refresh()
}
async function apply(companion) {
  const pitch = window.prompt(`What should ${companion.name} promise to deliver?`, `${companion.name} will complete this outcome using an isolated job memory and provide evidence for every milestone.`)
  if (!pitch) return
  await jobsService.applyToJob(selected.value.id, companion, pitch, selected.value.budgetCents)
  applications.value = await jobsService.listApplications(selected.value.id)
}
async function hire(application) {
  const companion = companions.value.find(item => item.id === application.companionId)
  contract.value = await jobsService.hireCompanion(selected.value, application, companion)
  await refresh()
}
async function createMilestone() {
  await jobsService.addMilestone(contract.value.id, { title: milestone.title, amountCents: Math.round(milestone.amount * 100) })
  Object.assign(milestone, { title: '', amount: 0 })
  milestones.value = await jobsService.listMilestones(contract.value.id)
}
async function addEvidence(item) {
  const evidence = window.prompt('Add a file path, transaction hash, URL, or concise work note')
  if (!evidence) return
  await jobsService.submitEvidence(item.id, { value: evidence, submittedAt: new Date().toISOString() })
  milestones.value = await jobsService.listMilestones(contract.value.id)
}
async function approve(item) { await jobsService.approveMilestone(item.id); milestones.value = await jobsService.listMilestones(contract.value.id) }
const money = (cents, currency = 'USD') => i18n.number(Number(cents || 0) / 100, { style: 'currency', currency })
const labelStatus = value => String(value || '').replaceAll('_', ' ')
const shortHash = value => value ? `${value.slice(0, 8)}...${value.slice(-4)}` : ''
const companionName = id => companions.value.find(item => item.id === id)?.name || id
watch(status, refresh)
onMounted(async () => { companions.value = await window.electronAPI?.db?.companions?.list?.({}) || []; await refresh() })
</script>

<style scoped>
.jobs{height:100%;overflow:auto;padding:var(--bz-space-6);background:var(--bz-canvas);color:var(--bz-fg)}
.jobs__header,.jobs__detail-head,.jobs__section-head,.jobs__toolbar,.jobs__application,.jobs__milestone,.jobs__agent{display:flex;align-items:center;justify-content:space-between;gap:var(--bz-space-3)}
.jobs__header{align-items:flex-start}.jobs__subtitle,.jobs__description{max-width:68ch;color:var(--bz-fg-mid);line-height:1.55}.jobs__composer{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:var(--bz-space-3);margin:var(--bz-space-5) 0;padding:var(--bz-space-5) 0;border-block:1px solid var(--bz-border)}
.jobs__composer label{display:grid;gap:var(--bz-space-2);font-size:12px;color:var(--bz-fg-low)}.jobs__composer-wide{grid-column:1/-1}.jobs__input{width:100%;min-height:40px;padding:10px 12px;border:1px solid var(--bz-border);border-radius:var(--bz-radius-sm);background:var(--bz-panel);color:var(--bz-fg)}textarea.jobs__input{min-height:84px;resize:vertical}.jobs__toolbar{justify-content:flex-start;margin:var(--bz-space-5) 0 var(--bz-space-3)}.jobs__filter{padding:7px 10px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--bz-fg-low);cursor:pointer}.jobs__filter.is-active{border-color:var(--bz-purple-300);color:var(--bz-fg)}.jobs__count{margin-left:auto;color:var(--bz-fg-low)}
.jobs__workspace{display:grid;grid-template-columns:minmax(280px,34%) 1fr;min-height:560px;border:1px solid var(--bz-border);border-radius:var(--bz-radius-md);overflow:hidden}.jobs__list{border-right:1px solid var(--bz-border);background:var(--bz-panel);overflow:auto}.jobs__row{width:100%;display:flex;gap:var(--bz-space-3);padding:var(--bz-space-4);border:0;border-bottom:1px solid var(--bz-border);background:transparent;color:inherit;text-align:left;cursor:pointer}.jobs__row:hover,.jobs__row.is-active{background:var(--bz-raised)}.jobs__row.is-active{box-shadow:inset 2px 0 var(--bz-purple-300)}.jobs__row-main{min-width:0;flex:1}.jobs__row strong,.jobs__row small{display:block}.jobs__row small{margin-top:5px;overflow:hidden;color:var(--bz-fg-low);text-overflow:ellipsis;white-space:nowrap}.jobs__row-meta{text-align:right}.jobs__row-meta b,.jobs__row-meta i{display:block;font-size:11px}.jobs__row-meta i{margin-top:5px;color:var(--bz-fg-low);font-style:normal;text-transform:capitalize}.jobs__detail{padding:var(--bz-space-5);overflow:auto}.jobs__budget{font-size:20px}.jobs__skills{display:flex;gap:var(--bz-space-2);flex-wrap:wrap;margin:var(--bz-space-4) 0}.jobs__skills span{padding:5px 8px;border:1px solid var(--bz-border);border-radius:var(--bz-radius-sm);color:var(--bz-fg-mid);font-size:11px}.jobs__section{margin-top:var(--bz-space-6);padding-top:var(--bz-space-4);border-top:1px solid var(--bz-border)}.jobs__section-head h3{margin:0;font-size:15px}.jobs__section-head span{color:var(--bz-fg-low);font-size:11px}.jobs__applications,.jobs__milestones,.jobs__agents{display:grid;gap:var(--bz-space-2);margin-top:var(--bz-space-3)}.jobs__application,.jobs__milestone,.jobs__agent{padding:var(--bz-space-3);border:1px solid var(--bz-border);border-radius:var(--bz-radius-sm)}.jobs__application p,.jobs__agent small{margin:4px 0 0;color:var(--bz-fg-low);font-size:12px}.jobs__application-action{display:grid;justify-items:end;gap:var(--bz-space-2)}.jobs__milestone{display:grid;grid-template-columns:auto 1fr auto auto;justify-content:normal}.jobs__milestone small{display:block;color:var(--bz-fg-low)}.jobs__state{width:8px;height:8px;border-radius:50%;background:var(--bz-fg-faint)}.jobs__state.is-approved{background:var(--bz-emerald-500)}.jobs__state.is-submitted{background:var(--bz-warning)}.jobs__agent{display:grid;grid-template-columns:42px 1fr auto}.jobs__agent img,.jobs__agent>.material-symbols-outlined{width:42px;height:42px;border-radius:50%;object-fit:cover;background:var(--bz-raised);display:grid;place-items:center}.jobs__milestone-form{display:grid;grid-template-columns:1fr 120px auto;gap:var(--bz-space-2);margin-top:var(--bz-space-3)}.jobs__empty{padding:var(--bz-space-6);color:var(--bz-fg-low);text-align:center}.jobs__empty--detail{display:grid;min-height:400px;place-items:center}
@media(max-width:900px){.jobs{padding:var(--bz-space-4)}.jobs__workspace{grid-template-columns:1fr}.jobs__list{max-height:260px;border-right:0;border-bottom:1px solid var(--bz-border)}.jobs__composer{grid-template-columns:1fr}.jobs__composer-wide{grid-column:auto}}
</style>
