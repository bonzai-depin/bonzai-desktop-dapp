<template>
  <div class="connectors company-screen" data-i18n-skip>
    <p v-if="toolsError" class="conn-auth__error" role="alert">{{ toolsError }}</p>
    <!-- Health overview -->
    <CompanyMetricStrip v-if="state.connectors?.length" :items="healthMetrics" @select="item=>healthFilter=healthFilter===item.id?'':item.id" />
    <!-- Pending list — connectors the template needs but aren't installed -->
    <div v-if="pendingNeeds.length" class="conn-pending">
      <div class="conn-section-head">
        <h3 class="conn-section-title fira-sans-condensed-black-italic">{{ $ui('Suggested for this team') }}</h3>

      </div>
      <div class="conn-pending__list">
        <button
          v-for="kind in pendingNeeds"
          :key="kind"
          class="conn-pending__chip"
          :disabled="!!adding"
          @click="quickAdd(kind)"
        >
          <span class="material-symbols-outlined">add_circle</span>
          {{ labelFor(kind) }}
        </button>
      </div>
    </div>

    <!-- Existing list -->
    <section v-if="state.connectors?.length" class="conn-section">
      <div class="conn-section-head">
        <h3 class="conn-section-title fira-sans-condensed-black-italic">{{ $ui('Connections') }}</h3>

      </div>
      <div v-if="healthFilter" class="company-filter-notice"><span>{{ $ui(healthMetrics.find(m=>m.id===healthFilter)?.label) }}</span><button class="bz-btn bz-btn--ghost bz-btn--sm" @click="healthFilter=''">{{ $ui('Clear filters') }}</button></div>
      <p v-if="!visibleConnections.length" class="company-muted">{{ $ui('No matching records.') }}</p>
      <div class="conn-list">
        <div v-for="c in visibleConnections" :key="c.id" class="conn-row">
          <div class="conn-row__icon">
            <span class="material-symbols-outlined">{{ iconFor(c.kind) }}</span>
          </div>
          <div class="conn-row__main">
            <div class="conn-row__name fira-sans-condensed-black-italic">{{ c.label || c.kind }}</div>
            <div class="conn-row__meta">
              <span class="conn-status" :class="statusClass(c.status)">{{ $ui(statusLabel(c.status)) }}</span>
              <span class="conn-row__id">{{ labelFor(c.kind) }}</span>
              <span v-if="c.accountIdentifier" class="conn-row__account">{{ c.accountIdentifier }}</span>
              <span v-if="c.lastUsedAt" class="conn-row__time">{{ $ui('Last used') }} {{ fmtTime(c.lastUsedAt) }}</span>
            </div>
          </div>
          <div class="conn-row__actions">
            <button
              v-if="c.status === 'needs_auth' || c.status === 'expired' || c.status === 'broken'"
              class="bz-btn bz-btn--sm bz-btn--primary fira-sans-condensed-black-italic"
              @click="openAuth(c)"
              :title="$ui('Connect')"
            >
              <span class="material-symbols-outlined">vpn_key</span>
              {{ $ui('Connect') }}
            </button>
            <button
              v-if="c.status === 'active'"
              class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
              @click="revoke(c)"
            >
              <span class="material-symbols-outlined">link_off</span>
              {{ $ui('Revoke') }}
            </button>
            <button
              class="bz-iconbtn bz-iconbtn--sm bz-iconbtn--danger"
              @click="remove(c)"
              :aria-label="$ui('Delete connector')"
            >
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <CompanyFinanceRecords v-if="state.connectors?.some(tool => ['qonto', 'stripe'].includes(tool.kind) && tool.status === 'active')" :company-id="charter.id" :connectors="state.connectors || []" />

    <!-- Catalog — the full set users can add ad-hoc -->
    <div class="conn-section-head conn-catalog-head">
      <h3 class="conn-section-title fira-sans-condensed-black-italic">{{ $ui('Available tools') }}</h3>
      <label class="tools-search"><span class="material-symbols-outlined" aria-hidden="true">search</span><input v-model="toolQuery" :placeholder="$ui('Search tools')" :aria-label="$ui('Search tools')" /></label>
    </div>
    <div class="tools-categories" :aria-label="$ui('Tool categories')">
      <button v-for="group in toolGroups" :key="group.id" type="button" :aria-pressed="toolCategory === group.id" @click="toolCategory = group.id">{{ $ui(group.label) }}</button>
    </div>
    <p v-if="!filteredCatalog.length" class="empty">{{ $ui('No tools match your search.') }}</p>
    <div class="conn-catalog">
      <button
        v-for="opt in filteredCatalog"
        :key="opt.kind"
        class="conn-catalog__tile"
        @click="quickAdd(opt.kind)"
        :disabled="!!adding || (!['qonto', 'stripe'].includes(opt.kind) && alreadyHas(opt.kind))"
      >
        <span class="conn-catalog__symbol" aria-hidden="true"><span class="material-symbols-outlined">{{ opt.icon }}</span></span>
        <span class="conn-catalog__copy">
          <span class="conn-catalog__name">{{ opt.name }}</span>
          <span v-if="opt.note" class="conn-catalog__note">{{ $ui(opt.note) }}</span>
        </span>
        <span class="material-symbols-outlined conn-catalog__action" aria-hidden="true">{{ !['qonto', 'stripe'].includes(opt.kind) && alreadyHas(opt.kind) ? 'check' : 'add' }}</span>
      </button>
    </div>

    <!-- Auth modal -->
    <CompanyProviderConnect v-if="authFor && oauthProviders[authFor.kind]" :key="authFor.id" :company-id="charter.id" :connector="authFor" @close="authFor = null" @connected="providerConnected" />
    <Teleport to="body">
    <div v-if="authFor && !oauthProviders[authFor.kind]" class="conn-auth-overlay company-screen" @click.self="closeAuth">
      <div ref="authDialog" class="conn-auth" role="dialog" data-i18n-skip aria-modal="true" :aria-labelledby="`company-tool-auth-${charter.id}`">
        <div class="conn-auth__head">
          <h2 :id="`company-tool-auth-${charter.id}`" class="fira-sans-condensed-black-italic">
            <span class="conn-auth__title">{{ labelFor(authFor.kind) }}</span>
          </h2>
          <BzCloseButton size="md" :aria-label="$ui('Close')" @click="closeAuth" />
        </div>
        <p class="conn-auth__copy">
          {{ $ui(authHelpText) }}
        </p>
        <label class="conn-auth__label" :for="`company-tool-label-${charter.id}`">{{ $ui('Account label (optional)') }}</label>
        <input :id="`company-tool-label-${charter.id}`" v-model.trim="authDraft.label" class="conn-input" :placeholder="authFor.kind" />
        <template v-if="authAccountLabel">
          <label class="conn-auth__label" :for="`company-tool-account-${charter.id}`">{{ $ui(authAccountLabel) }}</label>
          <input :id="`company-tool-account-${charter.id}`" v-model.trim="authDraft.accountIdentifier" class="conn-input" :placeholder="authAccountPlaceholder" />
        </template>
        <template v-if="authFor.kind === 'chorus'">
          <label class="conn-auth__label" :for="`chorus-environment-${charter.id}`">{{ $ui('Environment') }}</label>
          <select :id="`chorus-environment-${charter.id}`" v-model="authDraft.accountIdentifier" class="conn-input"><option value="sandbox">{{ $ui('Sandbox · test invoices') }}</option><option value="production">{{ $ui('Production · real invoices') }}</option></select>
          <template v-for="field in chorusFields" :key="field.key">
            <label class="conn-auth__label" :for="`chorus-${field.key}-${charter.id}`">{{ $ui(field.label) }}</label>
            <input :id="`chorus-${field.key}-${charter.id}`" v-model="authDraft[field.key]" class="conn-input" :type="field.secret ? 'password' : 'text'" autocomplete="off" />
          </template>
        </template>
        <template v-else>
        <label class="conn-auth__label" :for="`company-tool-secret-${charter.id}`">{{ $ui(authSecretLabel) }}</label>
        <input
          :id="`company-tool-secret-${charter.id}`"
          v-model="authDraft.secret"
          class="conn-input"
          type="password"
          :placeholder="$ui('Paste here')"
          autocomplete="off"
        />
        </template>
        <p v-if="authError" class="conn-auth__error" role="alert">{{ authError }}</p>
        <div class="conn-auth__actions">
          <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="closeAuth">
            {{ $ui('Cancel') }}
          </button>
          <button
            class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
            :class="{ 'bz-btn--running': busy }"
            :disabled="busy || !authReady"
            @click="saveAuth"
          >
            <span class="material-symbols-outlined">check</span>
            {{ $ui('Connect') }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<script>
import "./company-design.css";
import CompanyMetricStrip from './CompanyMetricStrip.vue';
import CompanyProviderConnect from './CompanyProviderConnect.vue';
import { COMPANY_OAUTH_PROVIDERS } from '../../shared/companyOAuth.js';
import CompanyFinanceRecords from "./CompanyFinanceRecords.vue";
import { ref, reactive, computed } from "vue";
import companyStore from "../../stores/companyStore.js";
import { COMPANY_CONNECTOR_CATALOG, connectorCatalogEntry, supportedConnectorKinds } from "../../config/companyConnectors.js";
import BzCloseButton from "../BzCloseButton.vue";
import { useModalAccessibility } from "../../composables/useModalAccessibility.js";
import { operationText } from "../../i18n/operations.js";
import { i18n } from "../../i18n/index.js";

export default {
  name: "CompanyConnectors",
  components: { BzCloseButton, CompanyFinanceRecords, CompanyMetricStrip, CompanyProviderConnect },
  props: {
    state: { type: Object, required: true },
    charter: { type: Object, required: true },
  },
  setup(props) {
    const store = companyStore;
    const authFor = ref(null);
    const authDialog = ref(null);
    useModalAccessibility(authDialog, { onClose: () => { void closeAuth(); } });
    const chorusFields = [{key:'clientId',label:'PISTE client ID'}, {key:'clientSecret',label:'PISTE client secret',secret:true}, {key:'technicalLogin',label:'Chorus technical login'}, {key:'technicalPassword',label:'Chorus technical password',secret:true}];
    const authDraft = reactive({ label: "", accountIdentifier: "", secret: "", clientId:'',clientSecret:'',technicalLogin:'',technicalPassword:'' });
    const authReady = computed(() => authFor.value?.kind === 'chorus' ? chorusFields.every(field => authDraft[field.key].trim()) : !!authDraft.secret.trim());
    const busy = ref(false);
    const authError = ref("");
    const toolsError = ref("");
    const adding = ref(null);

    const catalog = COMPANY_CONNECTOR_CATALOG;
    const toolQuery = ref(''), healthFilter=ref('');
    const healthMetrics=computed(()=>[
      ['active','Active','check_circle'],['needs_auth','Needs sign-in','key'],['broken','Broken','error_outline'],['revoked','Revoked','link_off']
    ].map(([id,label,icon])=>({id,label,icon,value:(props.state.connectors||[]).filter(c=>id==='needs_auth'?['needs_auth','expired'].includes(c.status):c.status===id).length,action:true,selected:healthFilter.value===id,tone:['broken','needs_auth'].includes(id)?'warning':null})));
    const visibleConnections=computed(()=>(props.state.connectors||[]).filter(c=>!healthFilter.value || (healthFilter.value==='needs_auth'?['needs_auth','expired'].includes(c.status):c.status===healthFilter.value)));
    const toolCategory = ref('all');
    const toolGroups = [{id:'all',label:'All tools'}, {id:'finance',label:'Finance'}, {id:'customers',label:'Customers and sales'}, {id:'communication',label:'Communication'}, {id:'operations',label:'Operations'}];
    const groupFor = kind => ['qonto','quickbooks','sage_accounting','stripe','chorus'].includes(kind) ? 'finance' : ['hubspot','shopify'].includes(kind) ? 'customers' : ['gmail','outlook_mail','sendgrid','slack','twilio'].includes(kind) ? 'communication' : 'operations';
    const filteredCatalog = computed(() => catalog.filter(tool => (toolCategory.value === 'all' || groupFor(tool.kind) === toolCategory.value) && `${tool.name} ${tool.kind} ${operationText(tool.note || '', i18n.state.locale)}`.toLocaleLowerCase().includes(toolQuery.value.trim().toLocaleLowerCase())));

    const pendingNeeds = computed(() => {
      const have = new Set((props.state.connectors || []).map((c) => c.kind));
      const want = props.charter?.pendingConnectors || [];
      return want.filter((k) => supportedConnectorKinds.has(k) && !have.has(k));
    });

    function alreadyHas(kind) {
      return (props.state.connectors || []).some((c) => c.kind === kind);
    }
    function labelFor(kind) {
      const e = connectorCatalogEntry(kind);
      return e?.name || kind;
    }
    function catalogEntry(kind) {
      return connectorCatalogEntry(kind) || {};
    }
    function authTypeFor(kind) {
      return catalogEntry(kind).authType || "apiKey";
    }
    const authSecretLabel = computed(() => {
      if (!authFor.value) return "API key / Secret";
      return catalogEntry(authFor.value.kind).secretLabel || (authTypeFor(authFor.value.kind) === "oauth2" ? "OAuth access token" : "API key / Secret");
    });
    const authAccountLabel = computed(() => authFor.value ? catalogEntry(authFor.value.kind).accountLabel || "" : "");
    const authAccountPlaceholder = computed(() => authFor.value ? catalogEntry(authFor.value.kind).accountPlaceholder || "" : "");
    const authHelpText = computed(() => {
      if (!authFor.value) return "";
      if (["gmail","outlook_mail"].includes(authFor.value.kind)) return "Sign in with your provider. Credentials stay encrypted on this device.";
      const entry = catalogEntry(authFor.value.kind);
      const prefix = entry.help || (authTypeFor(authFor.value.kind) === "oauth2"
        ? "Use credentials issued by your service administrator. This connector requires account configuration."
        : "Paste your API key or secret.");
      return [prefix, "Encrypted on this device and never shown back.", entry.note].filter(Boolean).map(text => operationText(text, i18n.state.locale)).join(" ");
    });
    function iconFor(kind) {
      const e = connectorCatalogEntry(kind);
      return e?.icon || "extension";
    }
    function statusClass(s) {
      return ({
        active: "conn-status--active",
        needs_auth: "conn-status--attention",
        expired: "conn-status--attention",
        broken: "conn-status--danger",
        revoked: "conn-status--muted",
      })[s] || "conn-status--muted";
    }
    function statusLabel(s) {
      return ({
        active: "Active",
        needs_auth: "Needs sign-in",
        expired: "Expired",
        broken: "Broken",
        revoked: "Revoked",
      })[s] || String(s || "Unknown").replace(/_/g, " ");
    }
    function fmtTime(ms) {
      if (!ms) return "";
      const d = new Date(ms);
      return d.toLocaleString(i18n.state.locale);
    }

    async function quickAdd(kind) {
      if (adding.value) return;
      adding.value = kind;
      toolsError.value = '';
      try {
        const c = await store.createConnector({ kind, authType: authTypeFor(kind), label: labelFor(kind) });
        if (c) openAuth(c);
      } catch (error) { toolsError.value = error.message || operationText('Connection failed', i18n.state.locale); }
      finally { adding.value = null; }
    }

    function openAuth(c) {
      authFor.value = c;
      authDraft.label = c.label || "";
      authDraft.accountIdentifier = c.accountIdentifier || (c.kind === 'chorus' ? 'sandbox' : '');
      authDraft.secret = "";
      for (const field of chorusFields) authDraft[field.key] = '';
      authError.value = "";
    }
    async function closeAuth() {
      if (busy.value) return;
      authFor.value = null;
      authDraft.secret = ''; authDraft.clientSecret = '';
    }
    async function providerConnected() {
      authFor.value = null;
      try { await store.refreshActive(); }
      catch (error) { toolsError.value = error.message; }
    }
    async function saveAuth() {
      if (busy.value || !authFor.value || !authReady.value) return;
      busy.value = true;
      authError.value = "";
      try {
        const secret = authFor.value.kind === 'chorus' ? JSON.stringify(Object.fromEntries(chorusFields.map(field=>[field.key,authDraft[field.key].trim()]))) : authDraft.secret.trim();
        await store.setConnectorSecret(authFor.value.id, secret, {
          label: authDraft.label.trim(),
          accountIdentifier: authDraft.accountIdentifier.trim(),
        });
        authFor.value = null;
        authDraft.label = "";
        authDraft.accountIdentifier = "";
        authDraft.secret = "";
        for (const field of chorusFields) authDraft[field.key] = '';
      } catch (error) {
        authError.value = error.message || "Connection failed";
      } finally {
        busy.value = false;
      }
    }
    async function revoke(c) {
      if (!confirm(`Revoke ${labelFor(c.kind)}? Skills depending on it will fail until reconnected.`)) return;
      await store.revokeConnector(c.id, "user-revoked");
    }
    async function remove(c) {
      if (!confirm(`Delete this connector entirely?`)) return;
      await store.removeConnector(c.id);
    }

    return {
      oauthProviders: COMPANY_OAUTH_PROVIDERS, providerConnected,
      healthMetrics, healthFilter, visibleConnections, catalog, toolsError, adding, toolQuery, toolCategory, toolGroups, filteredCatalog, pendingNeeds, alreadyHas, labelFor, iconFor, statusClass, statusLabel, fmtTime,
      authDialog, authFor, authDraft, authReady, chorusFields, busy, authError, authSecretLabel, authAccountLabel, authAccountPlaceholder, authHelpText,
      quickAdd, openAuth, closeAuth, saveAuth, revoke, remove,
    };
  },
};
</script>

<style scoped>
.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 300, "GRAD" 0, "opsz" 24;
}
.connectors {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-4);
  min-height: 100%;
  padding: var(--bz-space-5);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-card);
  color: var(--bz-fg);
}
.connectors__head {
  display: flex;
  justify-content: space-between;
  gap: var(--bz-space-4);
}
.connectors__eyebrow {
  margin: 0 0 var(--bz-space-1) !important;
  color: var(--bz-purple-300) !important;
  font-family: var(--bz-font-ui);
  font-size: var(--bz-size-micro) !important;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1;
  text-align: left !important;
  text-transform: uppercase;
}
.connectors__title {
  margin: 0 !important;
  color: var(--bz-fg) !important;
  font-size: 28px !important;
  line-height: 0.98;
  text-align: left !important;
}
.connectors__intro,
.conn-section-head p,
.conn-auth__copy {
  max-width: 72ch;
  margin: var(--bz-space-2) 0 0 !important;
  color: var(--bz-fg-mid) !important;
  font-size: 13px !important;
  line-height: 1.45;
  text-align: left !important;
}
.conn-section,
.conn-pending {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
}
.conn-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
}
.conn-section-head p {
  max-width: 48ch;
  margin-top: 0 !important;
  text-align: right !important;
}
.conn-section-title {
  margin: 0 !important;
  color: var(--bz-fg) !important;
  font-size: 23px !important;
  line-height: 1.25;
  text-align: left !important;
}
.empty {
  padding: var(--bz-space-5);
  border: 1px dashed var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  color: var(--bz-fg-low);
  font-size: 14px;
  text-align: center;
}

.conn-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border-block: 1px solid var(--bz-border);
}
.conn-kpi {
  min-width: 0;
  padding: var(--bz-space-3);
  border: 0;
  border-right: 1px solid var(--bz-border);
  border-radius: 0;
  background: transparent;
}
.conn-kpi:last-child { border-right: 0; }
.conn-kpi.has-attn {
  border-color: var(--bz-warning);
  background: var(--bz-warning-soft);
}
.conn-kpi--active {
  border-color: var(--bz-border);
}
.conn-kpi__value {
  color: var(--bz-fg);
  font-size: 25px;
  line-height: 1;
}
.conn-kpi__label {
  margin-top: var(--bz-space-1);
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-body);
  font-size: 13px;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
}

.conn-pending {
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border-brand);
  border-radius: var(--bz-r-sm);
  background: var(--bz-purple-soft);
}
.conn-pending__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}
.conn-pending__chip {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border-brand);
  border-radius: var(--bz-r-sm);
  background: var(--bz-card);
  color: var(--bz-fg);
  cursor: pointer;
  font-family: var(--bz-font-body);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out),
    color var(--bz-dur-fast) var(--bz-ease-out);
}
.conn-pending__chip:hover {
  border-color: var(--bz-border-strong);
  background: var(--bz-raised);
  color: var(--bz-fg);
}
.conn-pending__chip .material-symbols-outlined {
  font-size: 17px;
  color: currentColor;
  -webkit-text-fill-color: currentColor;
  background: none;
}

.conn-list {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
}
.conn-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: var(--bz-space-3);
  align-items: center;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out);
}
.conn-row:hover {
  border-color: var(--bz-border-strong);
  background: var(--bz-raised);
}
.conn-row__icon {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-card);
}
.conn-row__icon .material-symbols-outlined {
  font-size: 24px;
  color: var(--bz-fg-mid);
  -webkit-text-fill-color: currentColor;
  background: none;
}
.conn-row__main {
  min-width: 0;
}
.conn-row__name {
  color: var(--bz-fg);
  font-size: 18px;
  line-height: 1.05;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conn-row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bz-space-2);
  margin-top: var(--bz-space-1);
}
.conn-row__id {
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-body);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
}
.conn-row__time {
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.conn-row__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--bz-space-2);
}
.conn-status {
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  padding: 0 var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-card);
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-body);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
}
.conn-status--active {
  border-color: color-mix(in srgb, var(--bz-success) 35%, var(--bz-border));
  background: var(--bz-success-soft);
  color: var(--bz-success);
}
.conn-status--attention {
  border-color: var(--bz-warning);
  background: var(--bz-warning-soft);
  color: var(--bz-warning);
}
.conn-status--danger {
  border-color: var(--bz-danger);
  background: var(--bz-danger-soft);
  color: var(--bz-danger);
}
.conn-status--muted {
  border-color: var(--bz-border);
  background: var(--bz-panel);
  color: var(--bz-fg-low);
}

.conn-catalog {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: var(--bz-space-2);
}
.conn-catalog__tile {
  min-width: 0;
  min-height: 78px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 20px;
  align-items: center;
  gap: var(--bz-space-3);
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  color: var(--bz-fg);
  cursor: pointer;
  text-align: left;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out);
}
.conn-catalog__tile:hover:not(:disabled) {
  border-color: var(--bz-border-brand);
  background: var(--bz-raised);
}
.conn-catalog__tile:disabled {
  cursor: default;
  color: var(--bz-fg-mid);
  background: var(--bz-panel);
  opacity: 1;
}
.conn-catalog__tile .material-symbols-outlined {
  font-size: 24px;
  color: var(--bz-fg-mid);
  -webkit-text-fill-color: currentColor;
  background: none;
}
.conn-catalog__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.conn-catalog__name {
  color: var(--bz-fg);
  font-family: var(--bz-font-body);
  font-size: 15px;
  font-weight: 500;
  letter-spacing: normal;
  line-height: 1.4;
  text-transform: none;
}
.conn-catalog__note {
  color: var(--bz-fg-mid);
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.conn-catalog__tile .conn-catalog__action { font-size: 19px; margin-top: 2px; }
.conn-catalog__tile:disabled .conn-catalog__action { color: var(--bz-success); }
.conn-catalog-head .tools-search { flex: 0 1 360px; }

.conn-auth-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--bz-space-5);
  background: var(--bz-overlay);
  backdrop-filter: blur(9px);
}
.conn-auth {
  width: min(560px, 100%);
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
  padding: 28px;
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-lg);
  background: var(--bz-card);
  box-shadow: var(--bz-shadow-lg);
  color: var(--bz-fg);
}
.conn-auth__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--bz-space-3);
  padding-bottom: 16px;
  border-bottom: 1px solid var(--bz-border);
}
.conn-auth__head h2 {
  margin: 0 !important;
  font-size: 26px !important;
  line-height: 1.25;
  text-align: left !important;
}
.conn-auth__title {
  color: var(--bz-fg);
}
.conn-auth__label {
  display: block;
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-body);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0;
  margin-top: 8px;
}
.conn-auth__error { margin: 0; color: var(--bz-danger); font-size: var(--bz-size-meta); }
.conn-auth__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--bz-space-2);
  margin-top: 16px;
  padding-top: 20px;
  border-top: 1px solid var(--bz-border);
}
.conn-input {
  width: 100%;
  min-height: 44px;
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  color: var(--bz-fg);
  font-family: var(--bz-font-body);
  font-size: 14px;
}
.conn-input:focus {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
  border-color: var(--bz-accent);
}
.conn-input::placeholder {
  color: var(--bz-fg-faint);
}

@media (max-width: 900px) {
  .connectors,
  .conn-auth {
    padding: var(--bz-space-4);
  }
  .conn-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .conn-section-head {
    align-items: flex-start;
    flex-direction: column;
  }
  .conn-catalog-head .tools-search { width: 100%; flex-basis: auto; max-width: none; }
  .conn-section-head p {
    max-width: none;
    text-align: left !important;
  }
  .conn-row {
    grid-template-columns: 42px minmax(0, 1fr);
  }
  .conn-row__actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
}
@media (prefers-reduced-motion: reduce) {
  .conn-catalog__tile, .conn-pending__chip, .conn-row { transition: none; }
}
.tools-categories { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 8px; }
.tools-categories button { min-height: 38px; padding: 8px 14px; border: 1px solid var(--bz-border); border-radius: var(--bz-r); color: var(--bz-fg-mid); background: var(--bz-panel); font: 400 13px/1.4 var(--bz-font-body); cursor: pointer; }
.tools-categories button[aria-pressed="true"] { background: var(--bz-accent-soft); color: var(--bz-fg); border-color: var(--bz-border-brand); }
.connectors .conn-catalog { grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 16px; }
.connectors .conn-catalog__tile { min-height: 148px; padding: 22px; border-radius: var(--bz-r-lg); background: var(--bz-panel); align-items: start; column-gap: 16px; }
.connectors .conn-catalog__symbol { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid var(--bz-border); border-radius: 12px; background: var(--bz-canvas); }
.connectors .conn-catalog__symbol .material-symbols-outlined, .connectors .conn-row__icon .material-symbols-outlined { font-size: 25px; color: var(--bz-fg); font-variation-settings: "FILL" 0, "wght" 400, "opsz" 24; }
.connectors .conn-catalog__tile .conn-catalog__action { font-size: 20px; margin-top: 10px; }
.connectors .conn-catalog__copy { gap: 9px; }
.connectors .conn-catalog__name { font: 500 17px/1.4 var(--bz-font-body); }
.connectors .conn-catalog__note { font: 400 13px/1.6 var(--bz-font-body); }
.connectors .conn-row { padding: 20px; gap: 18px; border-radius: var(--bz-r-lg); }
.conn-auth-overlay { z-index: 10000; }
.conn-auth :is(button, input):focus-visible, .tools-categories button:focus-visible { outline: 2px solid var(--bz-accent); outline-offset: 3px; }
@media (max-width: 600px) { .connectors .conn-catalog__tile { min-height: 120px; padding: 18px; } .connectors .conn-row { grid-template-columns: 44px minmax(0, 1fr); } .conn-row__actions { grid-column: 1 / -1; } }
</style>
