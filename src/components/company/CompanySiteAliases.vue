<script setup>
import { ref, onMounted } from "vue";
import { i18n } from "../../i18n/index.js";
const props = defineProps({
  companyId: String,
  sites: { type: Array, default: () => [] },
});
const t = (fr, en) => (i18n.state.locale.startsWith("fr") ? fr : en);
const rows = ref([]),
  siteId = ref(""),
  alias = ref(""),
  error = ref(""),
  busy = ref(false);
const api = () => window.electronAPI?.db?.gmaoCasework;
async function load() {
  if (api())
    rows.value = (await api().snapshot(props.companyId)).records.filter(
      (r) => r.kind === "site_alias"
    );
}
async function save() {
  busy.value = true;
  error.value = "";
  try {
    await api().saveSiteAlias(props.companyId, {
      siteId: siteId.value,
      alias: alias.value,
    });
    alias.value = "";
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
onMounted(() => load().catch((e) => (error.value = e.message)));
</script>
<template>
  <details class="site-aliases" data-i18n-skip>
    <summary>
      {{ t("Rapprochement des noms de sites", "Site name matching") }}
    </summary>
    <p v-if="error" role="alert">{{ error }}</p>
    <form @submit.prevent="save">
      <label
        >{{ t("Site", "Site")
        }}<select v-model="siteId" required>
          <option value="">{{ t("Choisir", "Choose") }}</option>
          <option v-for="s in sites" :key="s.id" :value="s.id">
            {{ s.trigram }} · {{ s.name }}
          </option>
        </select></label
      ><label
        >{{
          t(
            "Autre nom présent dans les documents",
            "Alternative name in documents"
          )
        }}<input v-model.trim="alias" required maxlength="200" /></label
      ><button class="bz-btn" :disabled="busy || !alias || !siteId">
        {{ t("Ajouter cet alias", "Add alias") }}
      </button>
    </form>
    <ul>
      <li v-for="r in rows" :key="r.id">
        <strong>{{ r.alias }}</strong> →
        {{ sites.find((s) => s.id === r.siteId)?.name }}
      </li>
    </ul>
  </details>
</template>
<style scoped>
.site-aliases {
  border: 1px solid var(--bz-border);
  border-radius: 14px;
  padding: 24px;
  margin: 20px 0;
  color: var(--bz-fg);
  background: var(--bz-card);
}
summary {
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 18px;
}
form {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 16px;
  align-items: end;
}
label {
  display: grid;
  gap: 8px;
  min-width: 0;
}
input,
select {
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  padding: 12px;
  background: var(--bz-panel);
  color: var(--bz-fg);
  border: 1px solid var(--bz-border);
  border-radius: 9px;
  font: inherit;
}
select {
  padding-right: 36px;
}
li {
  padding: 8px 0;
  overflow-wrap: anywhere;
}
@media (max-width: 800px) {
  form {
    grid-template-columns: 1fr;
  }
}
</style>
