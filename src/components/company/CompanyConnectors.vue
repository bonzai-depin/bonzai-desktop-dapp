<template>
  <div class="connectors">
    <header class="connectors__head">
      <div>
        <p class="connectors__eyebrow">Business tools</p>
        <h2 class="connectors__title fira-sans-condensed-black-italic">
          Connect tools
        </h2>
        <p class="connectors__intro">
          Credentials are encrypted on this device.
        </p>
      </div>
    </header>

    <!-- Health overview -->
    <div class="conn-kpis" aria-label="Connector health">
      <div class="conn-kpi conn-kpi--active">
        <div class="conn-kpi__value fira-sans-condensed-black-italic">{{ state.connectorHealth.active || 0 }}</div>
        <div class="conn-kpi__label">Active</div>
      </div>
      <div class="conn-kpi" :class="{ 'has-attn': (state.connectorHealth.needs_auth || 0) > 0 }">
        <div class="conn-kpi__value fira-sans-condensed-black-italic">{{ state.connectorHealth.needs_auth || 0 }}</div>
        <div class="conn-kpi__label">Needs sign-in</div>
      </div>
      <div class="conn-kpi" :class="{ 'has-attn': (state.connectorHealth.broken || 0) > 0 }">
        <div class="conn-kpi__value fira-sans-condensed-black-italic">{{ state.connectorHealth.broken || 0 }}</div>
        <div class="conn-kpi__label">Broken</div>
      </div>
      <div class="conn-kpi">
        <div class="conn-kpi__value fira-sans-condensed-black-italic">{{ state.connectorHealth.revoked || 0 }}</div>
        <div class="conn-kpi__label">Revoked</div>
      </div>
    </div>

    <!-- Pending list — connectors the template needs but aren't installed -->
    <div v-if="pendingNeeds.length" class="conn-pending">
      <div class="conn-section-head">
        <h3 class="conn-section-title fira-sans-condensed-black-italic">Suggested for this team</h3>
        <p>Connect these first so the team can complete its workflow.</p>
      </div>
      <div class="conn-pending__list">
        <button
          v-for="kind in pendingNeeds"
          :key="kind"
          class="conn-pending__chip"
          @click="quickAdd(kind)"
        >
          <span class="material-symbols-outlined">add_circle</span>
          {{ labelFor(kind) }}
        </button>
      </div>
    </div>

    <!-- Existing list -->
    <section class="conn-section">
      <div class="conn-section-head">
        <h3 class="conn-section-title fira-sans-condensed-black-italic">Connected tools</h3>
        <p>Review access and reconnect anything that needs attention.</p>
      </div>
      <div v-if="state.connectors?.length" class="conn-list">
        <div v-for="c in state.connectors" :key="c.id" class="conn-row">
          <div class="conn-row__icon">
            <span class="material-symbols-outlined">{{ iconFor(c.kind) }}</span>
          </div>
          <div class="conn-row__main">
            <div class="conn-row__name fira-sans-condensed-black-italic">{{ c.label || c.kind }}</div>
            <div class="conn-row__meta">
              <span class="conn-status" :class="statusClass(c.status)">{{ statusLabel(c.status) }}</span>
              <span class="conn-row__id">{{ c.kind }}</span>
              <span v-if="c.lastUsedAt" class="conn-row__time">last used {{ fmtTime(c.lastUsedAt) }}</span>
            </div>
          </div>
          <div class="conn-row__actions">
            <button
              v-if="c.status === 'needs_auth' || c.status === 'expired' || c.status === 'broken'"
              class="bz-btn bz-btn--sm bz-btn--primary fira-sans-condensed-black-italic"
              @click="openAuth(c)"
              title="Provide credentials"
            >
              <span class="material-symbols-outlined">vpn_key</span>
              Connect
            </button>
            <button
              v-if="c.status === 'active'"
              class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
              @click="revoke(c)"
            >
              <span class="material-symbols-outlined">link_off</span>
              Revoke
            </button>
            <button
              class="bz-iconbtn bz-iconbtn--sm bz-iconbtn--danger"
              @click="remove(c)"
              aria-label="Delete connector"
            >
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
        </div>
      </div>
      <div v-else class="empty">
        No tools connected yet. Add the first one below.
      </div>
    </section>

    <!-- Catalog — the full set users can add ad-hoc -->
    <div class="conn-section-head">
      <h3 class="conn-section-title fira-sans-condensed-black-italic">Available tools</h3>
      <p>Start with the tools this business already uses day to day.</p>
    </div>
    <div class="conn-catalog">
      <button
        v-for="opt in catalog"
        :key="opt.kind"
        class="conn-catalog__tile"
        @click="quickAdd(opt.kind)"
        :disabled="alreadyHas(opt.kind)"
      >
        <span class="material-symbols-outlined">{{ opt.icon }}</span>
        <span class="conn-catalog__copy">
          <span class="conn-catalog__name">{{ opt.name }}</span>
          <span v-if="opt.note" class="conn-catalog__note">{{ opt.note }}</span>
        </span>
      </button>
    </div>

    <!-- Auth modal -->
    <div v-if="authFor" class="conn-auth-overlay" @click.self="authFor = null">
      <div class="conn-auth">
        <div class="conn-auth__head">
          <h2 class="fira-sans-condensed-black-italic">
            <span class="conn-auth__title">{{ labelFor(authFor.kind) }}</span>
          </h2>
          <BzCloseButton size="md" aria-label="Close" @click="authFor = null" />
        </div>
        <p class="conn-auth__copy">
          {{ authHelpText }}
        </p>
        <label class="conn-auth__label">Account label (optional)</label>
        <input v-model.trim="authDraft.label" class="conn-input" :placeholder="authFor.kind" />
        <template v-if="authAccountLabel">
          <label class="conn-auth__label">{{ authAccountLabel }}</label>
          <input v-model.trim="authDraft.accountIdentifier" class="conn-input" :placeholder="authAccountPlaceholder" />
        </template>
        <label class="conn-auth__label">{{ authSecretLabel }}</label>
        <input
          v-model="authDraft.secret"
          class="conn-input"
          type="password"
          placeholder="paste here"
          autocomplete="off"
        />
        <p v-if="authError" class="conn-auth__error">{{ authError }}</p>
        <div class="conn-auth__actions">
          <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="authFor = null">
            Cancel
          </button>
          <button
            class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
            :class="{ 'bz-btn--running': busy }"
            :disabled="busy || !authDraft.secret.trim()"
            @click="saveAuth"
          >
            <span class="material-symbols-outlined">check</span>
            Connect
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed } from "vue";
import companyStore from "../../stores/companyStore.js";
import { COMPANY_CONNECTOR_CATALOG, connectorCatalogEntry, supportedConnectorKinds } from "../../config/companyConnectors.js";
import BzCloseButton from "../BzCloseButton.vue";
import { i18n } from "../../i18n/index.js";

export default {
  name: "CompanyConnectors",
  components: { BzCloseButton },
  props: {
    state: { type: Object, required: true },
    charter: { type: Object, required: true },
  },
  setup(props) {
    const store = companyStore;
    const authFor = ref(null);
    const authDraft = reactive({ label: "", accountIdentifier: "", secret: "" });
    const busy = ref(false);
    const authError = ref("");

    const catalog = COMPANY_CONNECTOR_CATALOG;

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
      const entry = catalogEntry(authFor.value.kind);
      const prefix = authTypeFor(authFor.value.kind) === "oauth2"
        ? "Paste an OAuth access token for now; the connector stores it locally and can be upgraded to the full OAuth redirect flow."
        : "Paste your API key or secret.";
      return `${prefix} Encrypted on this device and never shown back.${entry.note ? ` ${entry.note}` : ""}`;
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
      // Add as needs_auth, then immediately open the auth modal.
      const c = await store.createConnector({
        kind,
        authType: authTypeFor(kind),
        label: labelFor(kind),
      });
      if (c) openAuth(c);
    }
    function openAuth(c) {
      authFor.value = c;
      authDraft.label = c.label || "";
      authDraft.accountIdentifier = c.accountIdentifier || "";
      authDraft.secret = "";
      authError.value = "";
    }
    async function saveAuth() {
      if (!authFor.value || !authDraft.secret.trim()) return;
      busy.value = true;
      authError.value = "";
      try {
        await store.setConnectorSecret(authFor.value.id, authDraft.secret.trim(), {
          label: authDraft.label.trim(),
          accountIdentifier: authDraft.accountIdentifier.trim(),
        });
        authFor.value = null;
        authDraft.label = "";
        authDraft.accountIdentifier = "";
        authDraft.secret = "";
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
      catalog, pendingNeeds, alreadyHas, labelFor, iconFor, statusClass, statusLabel, fmtTime,
      authFor, authDraft, busy, authError, authSecretLabel, authAccountLabel, authAccountPlaceholder, authHelpText,
      quickAdd, openAuth, saveAuth, revoke, remove,
    };
  },
};
</script>

<style scoped>
.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 100, "GRAD" -25, "opsz" 48;
  border-radius: 100%;
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
  align-items: flex-end;
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
  font-size: 20px !important;
  line-height: 1;
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
  color: var(--bz-fg-low);
  font-family: var(--bz-font-ui);
  font-size: var(--bz-size-micro);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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
  font-family: var(--bz-font-ui);
  font-size: var(--bz-size-meta);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out),
    color var(--bz-dur-fast) var(--bz-ease-out);
}
.conn-pending__chip:hover {
  border-color: var(--bz-purple-300);
  background: var(--bz-raised);
  color: var(--bz-purple-300);
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
  color: var(--bz-purple-300);
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
  color: var(--bz-fg-low);
  font-family: var(--bz-font-ui);
  font-size: var(--bz-size-micro);
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.conn-row__time {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
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
  font-family: var(--bz-font-ui);
  font-size: var(--bz-size-micro);
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.conn-status--active {
  border-color: var(--bz-emerald-500);
  background: var(--bz-success-soft);
  color: var(--bz-emerald-500);
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
  grid-template-columns: auto minmax(0, 1fr);
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
    border-color var(--bz-dur-fast) var(--bz-ease-out),
    transform var(--bz-dur-fast) var(--bz-ease-out);
}
.conn-catalog__tile:hover:not(:disabled) {
  border-color: var(--bz-purple-300);
  background: var(--bz-purple-soft);
  transform: translateY(-1px);
}
.conn-catalog__tile:disabled {
  cursor: default;
  opacity: 0.54;
}
.conn-catalog__tile .material-symbols-outlined {
  font-size: 24px;
  color: var(--bz-purple-300);
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
  font-family: var(--bz-font-ui);
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.04em;
  line-height: 1.05;
  text-transform: uppercase;
}
.conn-catalog__note {
  display: -webkit-box;
  overflow: hidden;
  color: var(--bz-fg-low);
  font-size: 11px;
  line-height: 1.25;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.conn-auth-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--bz-space-5);
  background: var(--bz-overlay);
}
.conn-auth {
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
  padding: var(--bz-space-5);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r);
  background: var(--bz-card);
  box-shadow: var(--bz-shadow-lg);
  color: var(--bz-fg);
}
.conn-auth__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--bz-space-3);
}
.conn-auth__head h2 {
  margin: 0 !important;
  font-size: 26px !important;
  line-height: 1;
  text-align: left !important;
}
.conn-auth__title {
  color: var(--bz-fg);
}
.conn-auth__label {
  display: block;
  color: var(--bz-fg-low);
  font-family: var(--bz-font-ui);
  font-size: var(--bz-size-meta);
  font-weight: 600;
  letter-spacing: 0;
}
.conn-auth__error { margin: 0; color: var(--bz-danger); font-size: var(--bz-size-meta); }
.conn-auth__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--bz-space-2);
  margin-top: var(--bz-space-2);
}
.conn-input {
  width: 100%;
  min-height: 42px;
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  color: var(--bz-fg);
  font-family: var(--bz-font-body);
  font-size: 14px;
}
.conn-input:focus {
  outline: none;
  border-color: var(--bz-purple-300);
  box-shadow: 0 0 0 3px var(--bz-purple-soft);
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
</style>
