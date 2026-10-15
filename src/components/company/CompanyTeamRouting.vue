<template>
  <form class="team-routing company-screen" data-i18n-skip @submit.prevent="save">
    <div class="team-routing__heading">
      <h3>{{ ui("Purchasing handoff") }}</h3>
      <p>
        {{ ui("Send new parts requests to the selected team and member.") }}
      </p>
    </div>
    <div class="team-routing__fields">
    <label
      >{{ ui("Purchasing team")
      }}<select v-model="teamId" :disabled="busy" @change="role = ''">
        <option value="">{{ ui("Assign requests manually") }}</option>
        <option v-for="team in teams" :key="team.id" :value="team.id">
          {{ team.name }}
        </option>
      </select></label
    >
    <label v-if="teamId"
      >{{ ui("Responsible member")
      }}<select v-model="role" required :disabled="busy">
        <option value="">{{ ui("Choose a member") }}</option>
        <option v-for="key in roles" :key="key" :value="key">
          {{ formatRoleTitle(key) }}
        </option>
      </select></label
    >
    <button
      class="bz-btn bz-btn--secondary"
      :disabled="busy || (!!teamId && !role)"
    >
      {{ ui(busy ? "Saving…" : "Save routing") }}
    </button>
    </div>
    <p v-if="error" class="team-routing__error" role="alert">{{ error }}</p>
    <p v-if="saved" role="status">{{ ui("Settings saved") }}</p>
  </form>
</template>
<script setup>
import "./company-design.css";
import { computed, ref, watch } from "vue";
import { operationText } from "../../i18n/operations.js";
import { i18n } from "../../i18n/index.js";
import { formatRoleTitle } from "../../services/company/presentation.js";
const props = defineProps({ store: { type: Object, required: true } });
const company = computed(() =>
  props.store.state.companies.find((c) => c.id === props.store.state.activeId),
);
const teams = computed(() =>
  props.store.state.companies.filter(
    (c) => c.id !== company.value?.id && c.status !== "dissolved",
  ),
);
const teamId = ref(""),
  role = ref(""),
  busy = ref(false),
  error = ref(""),
  saved = ref(false);
const roles = computed(() =>
  Object.entries(teams.value.find((c) => c.id === teamId.value)?.roles || {})
    .filter(([, member]) => member.companion)
    .map(([key]) => key),
);
const ui = (s) => operationText(s, i18n.state.locale);
watch(
  () => company.value?.id,
  () => {
    teamId.value = company.value?.purchasingTeamId || "";
    role.value = company.value?.purchasingRole || "";
    saved.value = false;
  },
  { immediate: true },
);
async function save() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  saved.value = false;
  try {
    if (teamId.value && !roles.value.includes(role.value))
      throw new Error(ui("Choose a member"));
    await props.store.update({
      ...JSON.parse(JSON.stringify(company.value)),
      purchasingTeamId: teamId.value || null,
      purchasingRole: role.value || null,
    });
    saved.value = true;
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
<style scoped>
.team-routing {
  display: grid;
  gap: 16px;
  padding: 0 0 24px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--bz-border);
}
.team-routing__fields {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: 12px;
  max-width: 960px;
}
.team-routing__fields > button {
  min-height: 44px;
}
.team-routing h3 {
  margin: 0 0 8px;
  font: italic 900 23px/1.2 var(--bz-font-metric);
}
.team-routing p {
  margin: 0;
  color: var(--bz-fg-mid);
  font-size: 13px;
  line-height: 1.6;
}
.team-routing label {
  display: grid;
  gap: 8px;
  flex: 1 1 200px;
  font-size: 13px;
  color: var(--bz-fg-mid);
}
.team-routing select {
  box-sizing: border-box;
  width: 100%;
  min-height: 42px;
  padding: 10px 42px 10px 12px;
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-sm);
  background: var(--bz-panel);
  color: var(--bz-fg);
  font: inherit;
}
.team-routing select:focus-visible {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
.team-routing .team-routing__error {
  color: var(--bz-danger);
  flex-basis: 100%;
}
</style>
