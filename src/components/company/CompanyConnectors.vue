<template>
  <div class="connectors panel models__activity--payouts">
    <h2 class="panel-title fira-sans-condensed-black-italic">
      <span class="material-symbols-outlined">cable</span>
      Connectors
    </h2>
    <p class="muted">
      Each connector binds your company to a third-party service. Skills consume connectors —
      one Twilio connector serves SMS, voice, and WhatsApp skills. Credentials live in the OS
      keychain; the dashboard never sees them in the clear.
    </p>

    <!-- Health overview -->
    <div class="conn-kpis">
      <div class="conn-kpi">
        <div class="conn-kpi__value fira-sans-condensed-black-italic">{{ state.connectorHealth.active || 0 }}</div>
        <div class="conn-kpi__label">Active</div>
      </div>
      <div class="conn-kpi" :class="{ 'has-attn': (state.connectorHealth.needs_auth || 0) > 0 }">
        <div class="conn-kpi__value fira-sans-condensed-black-italic">{{ state.connectorHealth.needs_auth || 0 }}</div>
        <div class="conn-kpi__label">Needs auth</div>
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

    <hr />

    <!-- Pending list — connectors the template needs but aren't installed -->
    <div v-if="pendingNeeds.length" class="conn-pending">
      <h3 class="panel-subtitle fira-sans-condensed-black-italic">
        <span class="material-symbols-outlined">priority_high</span>
        Pending setup
      </h3>
      <p class="muted">
        Your template depends on these but you haven't connected them yet.
      </p>
      <div class="conn-pending__list">
        <button
          v-for="kind in pendingNeeds"
          :key="kind"
          class="conn-pending__chip"
          @click="quickAdd(kind)"
        >
          <span class="material-symbols-outlined mr-1">add_circle</span>
          {{ labelFor(kind) }}
        </button>
      </div>
      <hr />
    </div>

    <!-- Existing list -->
    <div v-if="state.connectors?.length" class="conn-list">
      <div v-for="c in state.connectors" :key="c.id" class="conn-row">
        <div class="conn-row__icon">
          <span class="material-symbols-outlined">{{ iconFor(c.kind) }}</span>
        </div>
        <div class="conn-row__main">
          <div class="conn-row__name fira-sans-condensed-black-italic">{{ c.label || c.kind }}</div>
          <div class="conn-row__meta muted">
            <span class="tag is-small" :class="statusClass(c.status)">{{ c.status.replace('_', ' ') }}</span>
            <span class="conn-row__id">{{ c.kind }}</span>
            <span v-if="c.lastUsedAt" class="conn-row__time">last used {{ fmtTime(c.lastUsedAt) }}</span>
          </div>
        </div>
        <div class="conn-row__actions">
          <button
            v-if="c.status === 'needs_auth' || c.status === 'expired' || c.status === 'broken'"
            class="button is-small is-warning fira-sans-condensed-black-italic"
            @click="openAuth(c)"
            title="Provide credentials"
          >
            <span class="material-symbols-outlined mr-1">vpn_key</span>
            Connect
          </button>
          <button
            v-if="c.status === 'active'"
            class="button is-small is-light fira-sans-condensed-black-italic"
            @click="revoke(c)"
          >
            <span class="material-symbols-outlined mr-1">link_off</span>
            Revoke
          </button>
          <button
            class="button is-small is-danger fira-sans-condensed-black-italic icon-only-btn ml-2"
            @click="remove(c)"
            aria-label="Delete connector"
          >
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>
    </div>
    <div v-else class="empty">
      No connectors yet. Pick from the catalog below or pending setup above.
    </div>

    <hr />

    <!-- Catalog — the full set users can add ad-hoc -->
    <h3 class="panel-subtitle fira-sans-condensed-black-italic">
      <span class="material-symbols-outlined">apps</span>
      Add a connector
    </h3>
    <div class="conn-catalog">
      <button
        v-for="opt in catalog"
        :key="opt.kind"
        class="conn-catalog__tile"
        @click="quickAdd(opt.kind)"
        :disabled="alreadyHas(opt.kind)"
      >
        <span class="material-symbols-outlined">{{ opt.icon }}</span>
        <span class="conn-catalog__name">{{ opt.name }}</span>
      </button>
    </div>

    <!-- Auth modal -->
    <div v-if="authFor" class="conn-auth-overlay" @click.self="authFor = null">
      <div class="conn-auth models__activity--payouts">
        <div class="conn-auth__head">
          <h2 class="fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined is-size-1 mr-2">vpn_key</span>
            <span class="conn-auth__title">{{ labelFor(authFor.kind) }}</span>
          </h2>
          <button class="button is-medium is-light icon-only-btn" @click="authFor = null" aria-label="Close">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <p class="muted">
          Paste your API key or OAuth token. Stored locally in your OS keychain — never synced
          to a server, never shown back.
        </p>
        <hr />
        <label class="conn-auth__label">Account label (optional)</label>
        <input v-model.trim="authDraft.label" class="input is-medium" :placeholder="authFor.kind" />
        <label class="conn-auth__label">API key / Secret</label>
        <input
          v-model="authDraft.secret"
          class="input is-medium"
          type="password"
          placeholder="paste here"
          autocomplete="off"
        />
        <hr />
        <div class="conn-auth__actions">
          <button class="button is-medium is-light fira-sans-condensed-black-italic" @click="authFor = null">
            Cancel
          </button>
          <button
            class="button is-medium is-success fira-sans-condensed-black-italic ml-5"
            :class="{ 'is-loading': busy }"
            :disabled="busy || !authDraft.secret.trim()"
            @click="saveAuth"
          >
            <span class="material-symbols-outlined is-size-3 mr-2">check</span>
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

const CATALOG = [
  { kind: "twilio",          name: "Twilio",          icon: "call" },
  { kind: "quickbooks",      name: "QuickBooks",      icon: "receipt_long" },
  { kind: "stripe",          name: "Stripe",          icon: "credit_card" },
  { kind: "google_calendar", name: "Google Calendar", icon: "event" },
  { kind: "hubspot",         name: "HubSpot",         icon: "hub" },
  { kind: "sendgrid",        name: "SendGrid",        icon: "mail" },
  { kind: "shopify",         name: "Shopify",         icon: "storefront" },
  { kind: "printful",        name: "Printful",        icon: "local_shipping" },
  { kind: "printify",        name: "Printify",        icon: "inventory" },
  { kind: "optimoroute",     name: "OptimoRoute",     icon: "alt_route" },
  { kind: "google_business", name: "Google Business", icon: "storefront" },
  { kind: "docusign",        name: "DocuSign",        icon: "draw" },
  { kind: "clio",            name: "Clio",            icon: "gavel" },
  { kind: "meta_ads",        name: "Meta Ads",        icon: "ads_click" },
  { kind: "google_ads",      name: "Google Ads",      icon: "campaign" },
  { kind: "notion",          name: "Notion",          icon: "menu_book" },
  { kind: "convertkit",      name: "ConvertKit",      icon: "newspaper" },
  { kind: "teachable",       name: "Teachable",       icon: "school" },
  { kind: "calendly",        name: "Calendly",        icon: "event_available" },
  { kind: "slack",           name: "Slack",           icon: "tag" },
  { kind: "linear",          name: "Linear",          icon: "list_alt" },
];

export default {
  name: "CompanyConnectors",
  props: {
    state: { type: Object, required: true },
    charter: { type: Object, required: true },
  },
  setup(props) {
    const store = companyStore;
    const authFor = ref(null);
    const authDraft = reactive({ label: "", secret: "" });
    const busy = ref(false);

    const catalog = CATALOG;

    const pendingNeeds = computed(() => {
      const have = new Set((props.state.connectors || []).map((c) => c.kind));
      const want = props.charter?.pendingConnectors || [];
      return want.filter((k) => !have.has(k));
    });

    function alreadyHas(kind) {
      return (props.state.connectors || []).some((c) => c.kind === kind);
    }
    function labelFor(kind) {
      const e = CATALOG.find((c) => c.kind === kind);
      return e?.name || kind;
    }
    function iconFor(kind) {
      const e = CATALOG.find((c) => c.kind === kind);
      return e?.icon || "extension";
    }
    function statusClass(s) {
      return ({
        active: "is-success",
        needs_auth: "is-warning",
        expired: "is-warning",
        broken: "is-danger",
        revoked: "is-light",
      })[s] || "is-light";
    }
    function fmtTime(ms) {
      if (!ms) return "";
      const d = new Date(ms);
      return d.toLocaleString();
    }

    async function quickAdd(kind) {
      // Add as needs_auth, then immediately open the auth modal.
      const c = await store.createConnector({
        kind,
        authType: "apiKey",
        label: labelFor(kind),
      });
      if (c) openAuth(c);
    }
    function openAuth(c) {
      authFor.value = c;
      authDraft.label = c.label || "";
      authDraft.secret = "";
    }
    async function saveAuth() {
      if (!authFor.value || !authDraft.secret.trim()) return;
      busy.value = true;
      try {
        await store.setConnectorSecret(authFor.value.id, authDraft.secret.trim());
        authFor.value = null;
        authDraft.label = "";
        authDraft.secret = "";
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
      catalog, pendingNeeds, alreadyHas, labelFor, iconFor, statusClass, fmtTime,
      authFor, authDraft, busy,
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
hr {
  margin: 24px 0 !important;
  width: 100%;
  border: none;
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(255, 255, 255, 1), transparent);
}
.muted { color: rgba(255, 255, 255, 0.65); font-size: 0.92em; }
.icon-only-btn { width: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
.empty { padding: 1.5em; text-align: center; color: rgba(255, 255, 255, 0.55); font-style: italic; }

.panel-title {
  font-size: 1.6rem;
  display: flex; align-items: center; gap: 0.5em;
  margin-bottom: 0.4em;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}
.panel-title .material-symbols-outlined {
  font-size: 28px;
  -webkit-text-fill-color: rgb(255, 153, 51);
  background: none;
}
.panel-subtitle {
  font-size: 1.05rem;
  display: flex; align-items: center; gap: 0.5em;
  margin: 0.5em 0 0.3em;
}
.panel-subtitle .material-symbols-outlined { font-size: 20px; color: rgb(255, 153, 51); }

/* ───────── Health KPIs ───────── */
.conn-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75em;
  margin: 1em 0;
}
.conn-kpi {
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(32px);
  border-radius: 4px;
  padding: 0.85em 1em;
  text-align: center;
}
.conn-kpi.has-attn {
  border-color: rgba(255, 224, 138, 0.6) !important;
  box-shadow: 0 0 16px rgba(255, 224, 138, 0.18);
}
.conn-kpi__value {
  font-size: 1.6rem;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}
.conn-kpi__label {
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 0.2em;
}

/* ───────── Pending chips ───────── */
.conn-pending__list { display: flex; flex-wrap: wrap; gap: 0.4em; margin: 0.5em 0; }
.conn-pending__chip {
  padding: 6px 12px;
  border: 1px solid rgba(255, 153, 51, 0.6);
  border-radius: 4px;
  background: rgba(255, 153, 51, 0.08);
  color: #fff;
  cursor: pointer;
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  backdrop-filter: blur(32px);
  display: inline-flex;
  align-items: center;
  transition: all 0.18s ease;
}
.conn-pending__chip:hover {
  background: rgba(255, 153, 51, 0.2);
  border-color: rgb(255, 153, 51);
}
.conn-pending__chip .material-symbols-outlined { font-size: 18px; }

/* ───────── Existing list ───────── */
.conn-list { display: flex; flex-direction: column; gap: 0.5em; }
.conn-row {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  gap: 1em;
  align-items: center;
  padding: 0.75em 1em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(32px);
  transition: border-color 0.15s;
}
.conn-row:hover { border-color: rgba(255, 255, 255, 0.25); }
.conn-row__icon .material-symbols-outlined {
  font-size: 32px;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}
.conn-row__name { font-size: 1rem; }
.conn-row__meta { display: flex; gap: 0.7em; align-items: center; flex-wrap: wrap; font-size: 0.82em; }
.conn-row__id {
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
}
.conn-row__time { color: rgba(255, 255, 255, 0.5); }
.conn-row__actions { display: flex; align-items: center; }

/* ───────── Catalog grid ───────── */
.conn-catalog {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 0.5em;
  margin-top: 0.5em;
}
.conn-catalog__tile {
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  padding: 0.9em 0.5em;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3em;
  color: #fff;
  backdrop-filter: blur(32px);
}
.conn-catalog__tile:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(97, 55, 142, 0.18);
}
.conn-catalog__tile:disabled { opacity: 0.35; cursor: not-allowed; }
.conn-catalog__tile .material-symbols-outlined {
  font-size: 24px;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}
.conn-catalog__name { font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }

/* ───────── Auth modal ───────── */
.conn-auth-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  padding: 2em;
}
.conn-auth {
  width: 100%; max-width: 520px;
  padding: 2em 2.5em !important;
  background: rgba(0, 0, 0, 0.55) !important;
  border: 1px solid rgba(255, 255, 255, 0.18) !important;
  backdrop-filter: blur(32px) !important;
  border-radius: 8px !important;
  color: #fff;
}
.conn-auth__head {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 0.5em;
}
.conn-auth__head h2 { font-size: 1.3rem; display: flex; align-items: center; }
.conn-auth__title {
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}
.conn-auth__label {
  display: block;
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.65);
  margin: 0.75em 0 0.3em;
}
.conn-auth__actions {
  display: flex;
  justify-content: flex-end;
}

:deep(.input) {
  background: rgba(0, 0, 0, 0.45) !important;
  border: 1px solid rgba(255, 255, 255, 0.22) !important;
  color: #fff !important;
  backdrop-filter: blur(32px) !important;
}
:deep(.input::placeholder) {
  color: rgba(255, 255, 255, 0.4) !important;
}
:deep(.tag.is-light) {
  background: rgba(255, 255, 255, 0.12) !important;
  color: rgba(255, 255, 255, 0.85) !important;
}
</style>
