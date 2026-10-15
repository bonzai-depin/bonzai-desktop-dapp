<script setup>
import "./company-design.css";
import { ref, onMounted, onBeforeUnmount } from "vue";
const props = defineProps({
  companyId: { type: String, required: true },
  dossierId: { type: String, required: true },
  initialUrl: { type: String, default: "" },
});
const queuedFields = ref([]),
  downloads = ref([]);
let unsubscribe;
onBeforeUnmount(() => unsubscribe?.());
const dossier = ref(null),
  blockers = ref([]);
async function loadPackage() {
  const result = await window.electronAPI.db.companyGrants.portalPackage(
    props.companyId,
    { id: props.dossierId },
  );
  dossier.value = result.dossier;
  documents.value = result.documents;
  blockers.value = result.preparation.blockers;
  const snapshot = await window.electronAPI.db.companyGrants.snapshot(
    props.companyId,
  );
  downloads.value = (snapshot.events || [])
    .filter(
      (e) => e.dossierId === props.dossierId && e.operation === "download",
    )
    .slice(0, 5);
}
onMounted(() => {
  loadPackage().catch((e) => (error.value = e.message));
  unsubscribe = window.electronAPI?.db?.companyGrants?.onChanged?.((event) => {
    if (event.companyId === props.companyId)
      loadPackage().catch((e) => (error.value = e.message));
  });
});
function suggestFields(elements) {
  const aliases = {
    beneficiary: ["beneficiary", "bénéficiaire"],
    applicationReference: ["application reference", "référence du dossier"],
    workOrderReference: ["installation reference", "référence installation"],
    territory: ["territory", "territoire"],
  };
  return elements
    .filter(
      (e) =>
        ["INPUT", "TEXTAREA", "SELECT"].includes(e.tag) &&
        !e.disabled &&
        !["password", "file", "hidden", "submit", "checkbox", "radio"].includes(
          e.type,
        ),
    )
    .map((e) => {
      const key = Object.keys(aliases).find((k) =>
        aliases[k].includes(
          String(e.label || "")
            .toLocaleLowerCase()
            .trim(),
        ),
      );
      const value = key ? String(dossier.value?.[key] || "") : "";
      return {
        ...e,
        elementId: e.id,
        value:
          e.tag === "SELECT" && !e.options?.some((o) => o.value === value)
            ? ""
            : value,
      };
    });
}
const documents = ref([]),
  documentId = ref("");
const url = ref(props.initialUrl),
  page = ref(null),
  error = ref(""),
  busy = ref(false),
  elementId = ref(""),
  value = ref("");
async function act(method, input = {}) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const api = window.electronAPI?.db?.companyBrowser;
    if (!api) throw new Error("Restart BonzAI to enable browser tools.");
    await loadPackage();
    const result = await api[method](props.companyId, {
      ...input,
      dossierId: props.dossierId,
    });
    if (result.elements) {
      page.value = result;
      queuedFields.value = suggestFields(result.elements);
      elementId.value = "";
    } else {
      page.value = null;
      queuedFields.value = [];
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
function interact(operation) {
  return act("interact", {
    operation,
    snapshotId: page.value?.snapshotId,
    elementId: Number(elementId.value),
    value: value.value,
  });
}
</script>
<template>
  <section class="portal-panel company-screen" data-i18n-skip>
    <header>
      <span class="material-symbols-outlined" aria-hidden="true">web</span>
      <h3>{{ $ui("Submit this application") }}</h3>
    </header>
    <p>{{ dossier?.title }} · {{ dossier?.beneficiary }}</p>
    <p>
      {{
        $ui(
          "Review the application, sign in to the provider, then keep the submission receipt with this dossier.",
        )
      }}
    </p>
    <ul v-if="blockers.length" class="portal-checks">
      <li v-for="blocker in blockers" :key="blocker">{{ $ui(blocker) }}</li>
    </ul>
    <div class="portal-address">
      <input
        v-model="url"
        type="url"
        placeholder="https://…"
        :aria-label="$ui('Portal URL')"
      />
      <button
        type="button"
        class="bz-btn bz-btn--primary"
        :disabled="busy || !url"
        @click="act('navigate', { url })"
      >
        {{ $ui("Open portal") }}
      </button>
      <button
        type="button"
        class="bz-btn"
        :disabled="busy"
        @click="act('inspect')"
      >
        {{ $ui("Read page") }}
      </button>
    </div>
    <p v-if="error" role="alert">{{ $ui(error) }}</p>
    <p v-if="busy" role="status">
      {{ $ui("Check the browser window for approval.") }}
    </p>
    <div class="portal-package">
      <strong
        >{{ $ui("Documents for this application") }} ·
        {{ documents.length }}</strong
      ><span v-for="doc in documents" :key="doc.id">{{ doc.label }}</span>
    </div>
    <p>
      {{
        $ui(
          "Downloaded receipts are attached to this application. Verify their contents before recording submission.",
        )
      }}
    </p>
    <ul v-if="downloads.length" class="portal-checks">
      <li
        v-for="event in downloads"
        :key="event.id"
        :role="event.status === 'attachment_failed' ? 'alert' : undefined"
      >
        {{ event.filename }} ·
        {{
          $ui(
            event.documentId
              ? "Attached to application"
              : event.message || event.status,
          )
        }}
      </li>
    </ul>
    <div v-if="page" class="portal-observation">
      <strong>{{ page.title }}</strong
      ><small>{{ page.url }}</small>
      <h4>{{ $ui("Review form fields") }}</h4>
      <p v-if="!queuedFields.length">
        {{
          $ui(
            "No editable fields found. Continue in the visible browser, then read the next page.",
          )
        }}
      </p>
      <label v-for="field in queuedFields" :key="field.id"
        >{{ field.label || $ui("Unlabelled field") }}
        <select v-if="field.tag === 'SELECT'" v-model="field.value">
          <option value="">{{ $ui("Select") }}</option>
          <option
            v-for="option in field.options"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
        <input v-else v-model="field.value" autocomplete="off" />
      </label>
      <button
        type="button"
        class="bz-btn"
        :disabled="busy || !queuedFields.some((f) => f.value)"
        @click="
          act('fillForm', {
            snapshotId: page.snapshotId,
            fields: queuedFields
              .filter((f) => f.value)
              .map((f) => ({ elementId: f.id, value: f.value })),
          })
        "
      >
        {{ $ui("Fill reviewed form") }}
      </button>
      <div
        v-if="page.elements.some((e) => e.type === 'file')"
        class="portal-upload"
      >
        <label
          >{{ $ui("Upload field")
          }}<select v-model="elementId" :aria-label="$ui('Upload field')">
            <option value="">{{ $ui("Select") }}</option>
            <option
              v-for="e in page.elements.filter((e) => e.type === 'file')"
              :key="e.id"
              :value="e.id"
            >
              {{ e.label || $ui("Supporting documents") }}
            </option>
          </select></label
        >
        <label
          >{{ $ui("Document")
          }}<select v-model="documentId" :aria-label="$ui('Document')">
            <option value="">{{ $ui("Select document") }}</option>
            <option v-for="doc in documents" :key="doc.id" :value="doc.id">
              {{ doc.label }}
            </option>
          </select></label
        >
        <button
          type="button"
          class="bz-btn"
          :disabled="busy || elementId === '' || !documentId"
          @click="
            act('uploadDocument', {
              snapshotId: page.snapshotId,
              elementId: Number(elementId),
              documentId,
            })
          "
        >
          {{ $ui("Upload document") }}
        </button>
      </div>
      <p>
        {{
          $ui(
            "Complete signatures, verification and final submission in the visible browser. A click alone does not confirm submission.",
          )
        }}
      </p>
      <details>
        <summary>{{ $ui("Advanced browser controls") }}</summary>
        <label
          >{{ $ui("Page element")
          }}<select v-model="elementId">
            <option value="">{{ $ui("Select") }}</option>
            <option v-for="e in page.elements" :key="e.id" :value="e.id">
              {{ e.label || e.tag }}
            </option>
          </select></label
        >
        <label
          >{{ $ui("Value") }}<input v-model="value" autocomplete="off"
        /></label>
        <div class="portal-actions">
          <button
            type="button"
            v-for="[op, label] in [
              ['fill', 'Fill field'],
              ['select', 'Select option'],
              ['click', 'Click element'],
            ]"
            :key="op"
            class="bz-btn"
            :disabled="busy || elementId === ''"
            @click="interact(op)"
          >
            {{ $ui(label) }}
          </button>
        </div>
        <pre>{{ page.text }}</pre>
      </details>
    </div>
  </section>
</template>
<style scoped>
.portal-package,
.portal-upload {
  display: grid;
  gap: 10px;
  padding-block: 16px;
  border-block: 1px solid var(--bz-border);
}
.portal-panel .bz-btn {
  justify-self: start;
  width: auto;
}
.portal-panel details > * {
  margin-top: 12px;
}
.portal-panel {
  padding: 24px;
  border: 1px solid var(--bz-border);
  border-radius: 16px;
  background: var(--bz-panel);
  color: var(--bz-fg);
  display: grid;
  gap: 16px;
  margin-bottom: 24px;
}
.portal-panel header,
.portal-address,
.portal-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.portal-panel h2 {
  font-size: 24px;
  margin: 0;
}
.portal-panel p {
  color: var(--bz-muted);
  margin: 0;
}
.portal-panel input,
.portal-panel select {
  padding: 12px 36px 12px 14px;
  border: 1px solid var(--bz-border);
  background: var(--bz-canvas);
  color: var(--bz-fg);
  border-radius: 8px;
  min-width: 0;
}
.portal-address input {
  flex: 1;
}
.portal-observation {
  display: grid;
  gap: 12px;
}
.portal-observation label {
  display: grid;
  gap: 8px;
}
.portal-observation small {
  overflow-wrap: anywhere;
}
.portal-observation pre {
  white-space: pre-wrap;
  max-height: 260px;
  overflow: auto;
  background: var(--bz-canvas);
  color: var(--bz-fg);
  padding: 16px;
}
.portal-panel input:focus,
.portal-panel select:focus {
  outline: none;
  border-color: var(--bz-accent);
  box-shadow: none;
}
@media (max-width: 700px) {
  .portal-address input {
    flex-basis: 100%;
  }
  .portal-panel {
    padding: 16px;
  }
}
</style>
