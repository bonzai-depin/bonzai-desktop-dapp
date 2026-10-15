<template>
  <section class="team-exchanges company-screen" data-i18n-skip>
    <header v-if="!procurement && !composeOnly">
      <div>
        <p class="bz-eyebrow">{{ t("teamExchanges.teams") }}</p>
        <h2 class="bz-display">{{ t("teamExchanges.title") }}</h2>
      </div>
      <button class="bz-btn bz-btn--primary" @click="start()">
        {{ t("teamExchanges.newRequest") }}
      </button>
    </header>
    <p v-if="error" role="alert" class="exchange-error">{{ error }}</p>
    <p v-if="loading" role="status">{{ t("common.loading") }}</p>
    <div v-else-if="!procurement && !composeOnly" class="exchange-layout">
      <nav :aria-label="t('teamExchanges.title')">
        <p v-if="!threads.length" class="muted">
          {{ t("teamExchanges.empty") }}
        </p>
        <button
          v-for="thread in threads"
          :key="thread.id"
          :class="{ selected: selected?.id === thread.id }"
          @click="selectedId = thread.id"
        >
          <strong data-i18n-skip>{{ thread.subject }}</strong
          ><span
            >{{ thread.source_team_name }} → {{ thread.target_team_name }}</span
          ><small
            >{{ t("teamExchanges.taskState") }}:
            {{ stateLabel(thread.task_status) }}</small
          >
        </button>
      </nav>
      <section v-if="selected" class="exchange-conversation">
        <header>
          <div>
            <h3>{{ selected.subject }}</h3>
            <p>
              {{ selected.source_team_name }} →
              {{ selected.target_team_name }} ·
              {{ $ui(formatRoleTitle(selected.target_role)) }}
            </p>
          </div>
        </header>
        <ol>
          <li v-for="message in selected.messages" :key="message.id">
            <div class="exchange-byline">
              <strong>{{
                message.author_role === "owner"
                  ? t("teamExchanges.owner")
                  : message.author_name
              }}</strong
              ><span class="team-badge">{{ message.team_name }}</span
              ><span v-if="message.author_role !== 'owner'">{{
                $ui(formatRoleTitle(message.author_role))
              }}</span
              ><time>{{ date(message.created_at) }}</time>
            </div>
            <p class="exchange-body" data-i18n-skip>{{ visibleText(message.body) }}</p>
          </li>
        </ol>
        <p v-if="selected.archived" class="muted">
          {{ t("teamExchanges.archive") }}
        </p>
        <form v-else @submit.prevent="sendReply">
          <label v-if="!companyId"
            >{{ t("teamExchanges.from")
            }}<select v-model="replyTeam">
              <option :value="selected.source_company_id">
                {{ selected.source_team_name }}
              </option>
              <option :value="selected.target_company_id">
                {{ selected.target_team_name }}
              </option>
            </select></label
          ><label
            >{{ t("teamExchanges.reply")
            }}<textarea
              v-model="replyBody"
              required
              maxlength="20000"
              rows="3"
            /></label
          ><button
            class="bz-btn bz-btn--primary"
            :disabled="busy || !replyBody.trim()"
          >
            {{ t("common.send") }}
          </button>
        </form>
      </section>
      <div v-else class="exchange-empty">
        <span class="material-symbols-outlined" aria-hidden="true">forum</span>
        <p>{{ t("teamExchanges.select") }}</p>
      </div>
    </div>
    <GmaoDialog
      v-if="composing"
      :title="t('teamExchanges.newRequest')"
      :busy="busy"
      @close="
        composing = false;
        $emit('close');
      "
    >
      <form class="exchange-form" @submit.prevent="sendRequest">
        <label
          >{{ t("teamExchanges.from")
          }}<select
            v-model="form.source"
            :disabled="Boolean(companyId)"
            required
          >
            <option v-for="team in teams" :key="team.id" :value="team.id">
              {{ team.name }}
            </option>
          </select></label
        >
        <label
          >{{ t("teamExchanges.to")
          }}<select v-model="form.target" required>
            <option value="" disabled>{{ t("common.select") }}</option>
            <option
              v-for="team in teams.filter((t) => t.id !== form.source)"
              :key="team.id"
              :value="team.id"
            >
              {{ team.name }}
            </option>
          </select></label
        >
        <label
          >{{ t("teamExchanges.member")
          }}<select v-model="form.role" required>
            <option value="" disabled>{{ t("common.select") }}</option>
            <option
              v-for="[key, member] in targetRoles"
              :key="key"
              :value="key"
            >
              {{
                member.companionName ||
                member.companion?.name ||
                agentName(member.companion)
              }}
              · {{ $ui(formatRoleTitle(key)) }}
            </option>
          </select></label
        >
        <label
          >{{ t("teamExchanges.subject")
          }}<input v-model="form.subject" required maxlength="200"
        /></label>
        <label
          >{{ t("teamExchanges.message")
          }}<textarea v-model="form.body" required rows="6" maxlength="20000" />
        </label>
        <p class="muted">{{ t("teamExchanges.taskHint") }}</p>
        <p v-if="composeError" role="alert" class="exchange-error">
          {{ composeError }}
        </p>
        <button
          class="bz-btn bz-btn--primary"
          :disabled="busy || !form.role || !form.body.trim()"
        >
          {{ t("teamExchanges.sendRequest") }}
        </button>
      </form>
    </GmaoDialog>
  </section>
</template>
<script setup>
import "./company-design.css";
import {
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
} from "vue";
import { useI18n } from "../../i18n/index.js";
import GmaoDialog from "./GmaoDialog.vue";
import {
  listTeamConversations,
  requestTeamWork,
  replyToTeam,
  onTeamMessages,
} from "../../services/company/teamCommunication.js";
import { smartAgentCatalog } from "../../services/smartAgentCatalog.js";
import { formatRoleTitle } from "../../services/company/presentation.js";
import { DEFAULT_COMPANIONS } from "../../skills/flagship.js";
import { visibleText } from "../../shared/visibleText.js";
const props = defineProps({
  companyId: { type: String, default: "" },
  teams: { type: Array, default: () => [] },
  procurement: { type: Object, default: null },
  composeOnly: Boolean,
});
const emit = defineEmits(["changed", "close"]);
const { t, date } = useI18n();
const threads = ref([]),
  selectedId = ref(""),
  error = ref(""),
  loading = ref(false),
  busy = ref(false),
  composing = ref(false),
  composeError = ref(""),
  replyBody = ref(""),
  replyTeam = ref("");
const form = reactive({
  source: "",
  target: "",
  role: "",
  subject: "",
  body: "",
  requestKey: "",
});
const selected = computed(() =>
  threads.value.find((t) => t.id === selectedId.value),
);
const targetRoles = computed(() =>
  Object.entries(
    props.teams.find((t) => t.id === form.target)?.roles || {},
  ).filter(([, r]) => r.companion),
);
watch(
  () => form.target,
  () => {
    form.role = targetRoles.value.length === 1 ? targetRoles.value[0][0] : "";
  },
);
watch(
  () => selected.value?.id,
  () => {
    replyTeam.value =
      props.companyId || selected.value?.source_company_id || "";
    replyBody.value = "";
  },
);
const agentName = (id) =>
  smartAgentCatalog.agents.find((a) => a.id === id)?.name ||
  DEFAULT_COMPANIONS.find((a) => a.id === id)?.name ||
  id;
const stateLabel = (value) =>
  t(`teamExchanges.states.${value || "unavailable"}`);
let revision = 0;
async function load() {
  const rev = ++revision;
  loading.value = true;
  error.value = "";
  try {
    const ids = props.companyId
      ? [props.companyId]
      : props.teams.map((t) => t.id);
    const results = await Promise.all(ids.map(listTeamConversations));
    if (rev !== revision) return;
    threads.value = [
      ...new Map(results.flat().map((t) => [t.id, t])).values(),
    ].sort(
      (a, b) =>
        (b.messages.at(-1)?.created_at || b.created_at) -
        (a.messages.at(-1)?.created_at || a.created_at),
    );
    if (!threads.value.some((t) => t.id === selectedId.value))
      selectedId.value = threads.value[0]?.id || "";
  } catch (e) {
    if (rev === revision) error.value = e.message;
  } finally {
    if (rev === revision) loading.value = false;
  }
}
function start() {
  composeError.value = "";
  Object.assign(form, {
    source: props.companyId || props.teams[0]?.id || "",
    target: "",
    role: "",
    subject: props.procurement?.description || "",
    body: props.procurement?.description || "",
    requestKey: crypto.randomUUID(),
  });
  composing.value = true;
}
async function sendRequest() {
  busy.value = true;
  composeError.value = "";
  try {
    const result = await requestTeamWork(form.source, {
      targetTeamId: form.target,
      targetRole: form.role,
      subject: form.subject,
      body: form.body,
      requestKey: form.requestKey,
      procurementId: props.procurement?.id,
    });
    selectedId.value = result.id;
    composing.value = false;
    await load();
    emit("changed");
    if (props.procurement) emit("close");
  } catch (e) {
    composeError.value = e.message;
  } finally {
    busy.value = false;
  }
}
let replyKey = crypto.randomUUID();
watch(replyBody, () => (replyKey = crypto.randomUUID()));
async function sendReply() {
  busy.value = true;
  error.value = "";
  try {
    await replyToTeam(props.companyId || replyTeam.value, {
      conversationId: selectedId.value,
      body: replyBody.value,
      requestKey: replyKey,
    });
    replyBody.value = "";
    await load();
    emit("changed");
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
let unsubscribe = () => {};
onMounted(() => {
  if (!props.composeOnly) { load(); unsubscribe = onTeamMessages(load); }
  if (props.procurement) start();
});
onBeforeUnmount(() => {
  revision++;
  unsubscribe();
});
watch(() => props.companyId, () => { if (!props.composeOnly) load(); });
watch(() => props.teams.map((t) => t.id).join(","), () => { if (!props.composeOnly) load(); });
defineExpose({ start });
</script>
<style scoped>
.team-exchanges {
  color: var(--bz-text);
  min-width: 0;
}
.team-exchanges > header,
.exchange-conversation > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-4);
  padding: var(--bz-space-5) 0;
  border-bottom: 1px solid var(--bz-border);
}
h2,
h3,
p {
  margin: 0;
}
h2 {
  font: italic 900 var(--bz-size-h2)/1.3 var(--bz-font-metric);
}
.bz-eyebrow {
  margin-bottom: 8px;
}
.exchange-layout {
  display: grid;
  grid-template-columns: minmax(260px, 32%) minmax(0, 1fr);
  min-height: 420px;
}
.exchange-layout > nav {
  border-right: 1px solid var(--bz-border);
  padding: var(--bz-space-5) var(--bz-space-5) var(--bz-space-5) 0;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
}
.exchange-layout > nav button {
  display: grid;
  gap: var(--bz-space-2);
  text-align: left;
  padding: var(--bz-space-4);
  border: 1px solid transparent;
  border-radius: var(--bz-radius-md);
  background: transparent;
  color: var(--bz-text);
  overflow-wrap: anywhere;
}
.exchange-layout > nav button.selected {
  background: var(--bz-accent-soft);
  border-color: var(--bz-accent);
}
.exchange-layout > nav span,
.exchange-layout > nav small,
.muted,
time,
.exchange-conversation > header p {
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  line-height: 1.5;
}
.exchange-conversation {
  padding: 0 0 var(--bz-space-5) var(--bz-space-6);
  min-width: 0;
}
.exchange-conversation ol {
  list-style: none;
  padding: 0;
  max-height: 55vh;
  overflow: auto;
}
.exchange-conversation li {
  padding: var(--bz-space-5) 0;
  border-bottom: 1px solid var(--bz-border);
}
.exchange-byline {
  display: flex;
  gap: var(--bz-space-2);
  flex-wrap: wrap;
  align-items: center;
  font-size: var(--bz-size-meta);
  line-height: 1.5;
}
.team-badge {
  border: 1px solid var(--bz-border);
  padding: 2px var(--bz-space-2);
  border-radius: var(--bz-radius-sm);
  color: var(--bz-fg-mid);
}
.exchange-body {
  margin-top: var(--bz-space-3);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: var(--bz-size-body);
  line-height: 1.75;
}
.exchange-form,
.exchange-conversation form {
  display: grid;
  gap: var(--bz-space-5);
}
.exchange-form label,
.exchange-conversation label {
  display: grid;
  gap: var(--bz-space-2);
}
.exchange-form input,
.exchange-form select,
.exchange-form textarea,
.exchange-conversation textarea,
.exchange-conversation select {
  width: 100%;
  box-sizing: border-box;
  background: var(--bz-panel);
  color: var(--bz-text);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r);
  padding: var(--bz-space-3) var(--bz-space-4);
  font: inherit;
}
.exchange-conversation button,
.exchange-form button {
  justify-self: end;
}
.exchange-empty {
  align-self: center;
  text-align: center;
  color: var(--bz-fg-mid);
  padding: var(--bz-space-6);
}
.exchange-empty span {
  font-size: 32px;
}
.exchange-error {
  color: var(--bz-danger);
  padding: var(--bz-space-3) 0;
}
@media (max-width: 700px) {
  .exchange-layout {
    grid-template-columns: 1fr;
  }
  .exchange-layout > nav {
    border-right: 0;
    border-bottom: 1px solid var(--bz-border);
    max-height: 220px;
    overflow: auto;
    padding-right: 0;
  }
  .exchange-conversation {
    padding-left: 0;
  }
  .team-exchanges > header {
    align-items: flex-start;
    flex-wrap: wrap;
  }
}

.exchange-layout > nav button { font: 400 var(--bz-size-body)/1.5 var(--bz-font-body); cursor: pointer; transition: background var(--bz-dur-fast), border-color var(--bz-dur-fast); }
.exchange-layout > nav button:hover { background: var(--bz-raised); }
.exchange-layout > nav button.selected { background: var(--bz-purple-soft); border-color: var(--bz-border-brand); }
.exchange-layout > nav strong { font-weight: 500; }
.exchange-conversation > header h3 { color: var(--bz-fg); font: 400 var(--bz-size-h3)/1.5 var(--bz-font-body); overflow-wrap: anywhere; }
.exchange-conversation > header p { margin-top: var(--bz-space-2); overflow-wrap: anywhere; }
.exchange-conversation ol { margin: 0 0 var(--bz-space-5); padding-right: var(--bz-space-3); scrollbar-width: thin; scrollbar-color: var(--bz-border-strong) transparent; }
.exchange-byline strong { font-size: var(--bz-size-body); font-weight: 500; }
.exchange-byline time { margin-left: auto; color: var(--bz-fg-low); }
.exchange-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.exchange-form > label:nth-of-type(5), .exchange-form > p { grid-column: 1 / -1; }
.exchange-form > button { grid-column: 1 / -1; }
.exchange-form label, .exchange-conversation label { color: var(--bz-fg-mid); font-size: var(--bz-size-meta); line-height: 1.5; }
.exchange-form :is(input, select, textarea), .exchange-conversation :is(select, textarea) { font: 400 var(--bz-size-body)/1.65 var(--bz-font-body); min-width: 0; transition: border-color var(--bz-dur-fast), background var(--bz-dur-fast); }
.exchange-form textarea, .exchange-conversation textarea { resize: vertical; }
.team-exchanges :is(button, input, select, textarea):focus-visible, .exchange-form :is(button, input, select, textarea):focus-visible { outline: 2px solid var(--bz-border-brand); outline-offset: 3px; }
@media (max-width: 700px) { .exchange-layout > nav { padding: var(--bz-space-4) 0; } .exchange-conversation { padding-left: 0; } }
@media (max-width: 600px) { .exchange-form { grid-template-columns: minmax(0, 1fr); gap: var(--bz-space-4); } .exchange-byline time { margin-left: 0; } }
@media (prefers-reduced-motion: reduce) { .exchange-layout > nav button, .exchange-form :is(input, select, textarea), .exchange-conversation :is(select, textarea) { transition: none; } }
</style>
