<template>
  <div class="bzdt" :class="[`bzdt--density-${density}`]">
    <!-- Header row with optional title + action cluster -->
    <div v-if="title || $slots.header" class="bzdt__header">
      <div class="bzdt__title-wrap">
        <h3 v-if="title" class="bz-h3">{{ title }}</h3>
        <slot name="header" />
      </div>
      <div v-if="$slots.headerActions" class="bzdt__header-actions">
        <slot name="headerActions" />
      </div>
    </div>

    <!-- Column header row -->
    <div class="bzdt__head" role="rowgroup">
      <div
        v-for="col in visibleColumns"
        :key="col.key"
        class="bzdt__th"
        :class="{ 'bzdt__th--sortable': col.sortable, 'bzdt__th--sorted': sortKey === col.key }"
        :style="columnStyle(col)"
        role="columnheader"
        @click="col.sortable ? toggleSort(col.key) : null"
      >
        <span class="bzdt__th-label">{{ col.title }}</span>
        <span v-if="col.sortable" class="bzdt__th-sort">
          <span class="material-symbols-outlined" aria-hidden="true">
            {{ sortKey === col.key ? (sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'swap_vert' }}
          </span>
        </span>
      </div>
    </div>

    <!-- Data rows -->
    <div class="bzdt__body" role="rowgroup">
      <template v-if="sortedRows.length">
        <div
          v-for="(row, idx) in sortedRows"
          :key="rowKey(row, idx)"
          class="bzdt__row"
          :class="{
            'bzdt__row--clickable': clickable,
            'bzdt__row--selected': isSelected(row),
          }"
          role="row"
          @click="clickable && $emit('rowClick', row)"
        >
          <div
            v-for="col in visibleColumns"
            :key="col.key"
            class="bzdt__td"
            :style="columnStyle(col)"
            role="cell"
          >
            <!-- Leading status dot (dense lists) -->
            <span
              v-if="col.dot && row[col.dot]"
              class="bzdt__dot"
              :class="`bzdt__dot--${row[col.dot]}`"
            />
            <!-- Cell renderer via slot OR default -->
            <slot
              :name="`cell-${col.key}`"
              :row="row"
              :col="col"
              :value="getCell(row, col)"
              :index="idx"
            >
              <!-- Default render: apply .bz-mono to numeric columns -->
              <span
                :class="{ 'bz-mono': col.mono || col.type === 'number' || col.type === 'address' }"
                :style="col.type === 'address' ? 'cursor: copy;' : ''"
                :title="col.type === 'address' ? getCell(row, col) : ''"
                @click.stop="col.type === 'address' ? copyAddress(getCell(row, col)) : null"
              >
                {{ formatCell(row, col) }}
              </span>
            </slot>
          </div>
        </div>
      </template>

      <!-- Empty slot override -->
      <div v-if="!sortedRows.length && $slots.empty" class="bzdt__empty">
        <slot name="empty" />
      </div>

      <!-- Default empty -->
      <div v-else-if="!sortedRows.length" class="bzdt__empty">
        <BonzaiEmptyState
          :title="emptyTitle"
          :subtitle="emptySubtitle"
          compact
        />
      </div>
    </div>

    <!-- Footer: pagination or summary -->
    <div v-if="$slots.footer || pagination" class="bzdt__footer">
      <slot name="footer" />
      <div v-if="pagination" class="bzdt__pagination">
        <span class="bzdt__page-info bz-micro">
          {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, total) }} of {{ total }}
        </span>
        <div class="bzdt__page-controls">
          <button
            class="bz-iconbtn bz-iconbtn--sm"
            :disabled="page <= 1"
            @click="$emit('pageChange', page - 1)"
          >
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
          <button
            class="bz-iconbtn bz-iconbtn--sm"
            :disabled="page >= Math.ceil(total / pageSize)"
            @click="$emit('pageChange', page + 1)"
          >
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * BonzaiDataTable
 * ───────────────
 * Fintech-grade data table for transaction lists, pool epochs,
 * marketplace orders, and P2P provider registries.
 *
 * Reference: Kraken purple-accented dark UI, Stripe dense data rows.
 *
 * Design rules enforced:
 *   - Every numeric / address value in .bz-mono
 *   - Addresses truncated with copy-on-click
 *   - Status dots instead of icon-badge combos
 *   - No zebra striping; hover elevation only
 *   - Tabular numerics via ss01 / tnum
 *
 * Props:
 *   `columns`   — Array<{key, title, width?, sortable?, type?, mono?, dot?, formatter?}>
 *   `rows`      — Array<Record>
 *   `title`     — Optional section heading
 *   `loading`   — Boolean — shows skeleton rows
 *   `clickable` — Boolean — row emits @rowClick
 *   `selected`  — Set/Array of selected row identifiers
 *   `rowKey`    — Function(row, index) → string
 *   `density`   — "default" | "compact" | "spacious"
 *   `pagination`— Boolean — enable pagination controls
 *   `page` / `pageSize` / `total` — pagination state
 *
 * Events:
 *   `@sort`       — { key: string, dir: 'asc' | 'desc' }
 *   `@rowClick`   — row object
 *   `@pageChange` — page number
 */
import { ref, computed } from "vue";
import BonzaiEmptyState from "./BonzaiEmptyState.vue";

const props = defineProps({
  columns: { type: Array, required: true },
  rows:    { type: Array, default: () => [] },
  title:   { type: String, default: "" },
  loading: { type: Boolean, default: false },
  clickable: { type: Boolean, default: false },
  selected: { type: [Array, Set], default: () => new Set() },
  rowKey:  { type: Function, default: (r, i) => r.id || r.key || String(i) },
  density: { type: String, default: "default", validator: (v) => ["default", "compact", "spacious"].includes(v) },
  pagination: { type: Boolean, default: false },
  page:    { type: Number, default: 1 },
  pageSize:{ type: Number, default: 20 },
  total:   { type: Number, default: 0 },
  emptyTitle:   { type: String, default: "No records" },
  emptySubtitle:{ type: String, default: "" },
});

const emit = defineEmits(["sort", "rowClick", "pageChange"]);

const sortKey = ref("");
const sortDir = ref("desc");

const visibleColumns = computed(() => props.columns.filter((c) => !c.hidden));

function columnStyle(col) {
  const s = {};
  if (col.width) s.flex = `0 0 ${col.width}`;
  if (col.align) s.textAlign = col.align;
  return s;
}

function toggleSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortDir.value = "desc";
  }
  emit("sort", { key: sortKey.value, dir: sortDir.value });
}

function getCell(row, col) {
  return row[col.key];
}

function formatCell(row, col) {
  const val = getCell(row, col);
  if (col.formatter) return col.formatter(val, row);
  if (col.type === "address" && typeof val === "string" && val.startsWith("0x")) {
    return val.slice(0, 6) + "…" + val.slice(-4);
  }
  if (col.type === "timestamp" && val) {
    const d = new Date(val);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  if (col.type === "eth" && typeof val === "string") {
    return val + " ETH";
  }
  if (col.type === "bonzai" && typeof val === "number") {
    return val.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " BONZAI";
  }
  return val ?? "—";
}

function isSelected(row) {
  const key = props.rowKey(row);
  if (props.selected instanceof Set) return props.selected.has(key);
  return props.selected.includes(key);
}

/* Copy address to clipboard */
async function copyAddress(addr) {
  if (!addr) return;
  try {
    await navigator.clipboard.writeText(addr);
  } catch {}
}

/* Internal sort when no server-side sort */
const sortedRows = computed(() => {
  if (!sortKey.value) return props.rows;
  return [...props.rows].sort((a, b) => {
    const av = a[sortKey.value];
    const bv = b[sortKey.value];
    const dir = sortDir.value === "asc" ? 1 : -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av || "").localeCompare(String(bv || "")) * dir;
  });
});
</script>

<style scoped>
.bzdt {
  display: flex;
  flex-direction: column;
  width: 100%;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-card);
  overflow: hidden;
}

.bzdt__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--bz-space-3) var(--bz-space-4);
  border-bottom: 1px solid var(--bz-border);
  min-height: 44px;
}
.bzdt__title-wrap { display: flex; align-items: center; gap: var(--bz-space-2); }
.bzdt__header-actions { display: inline-flex; gap: var(--bz-space-2); }

/* Head row */
.bzdt__head {
  display: flex;
  align-items: center;
  padding: 0 var(--bz-space-4);
  border-bottom: 1px solid var(--bz-border);
  background: var(--bz-panel);
  min-height: 36px;
}
.bzdt__th {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
  padding: var(--bz-space-2) var(--bz-space-2);
  font-size: var(--bz-size-micro);
  font-family: var(--bz-font-mono);
  font-feature-settings: "tnum" 1, "ss01" 1;
  letter-spacing: var(--bz-track-tnum);
  text-transform: uppercase;
  color: var(--bz-fg-low);
  user-select: none;
  white-space: nowrap;
  cursor: default;
}
.bzdt__th--sortable { cursor: pointer; }
.bzdt__th--sortable:hover { color: var(--bz-fg-mid); }
.bzdt__th--sorted { color: var(--bz-purple-100); }
.bzdt__th-sort .material-symbols-outlined { font-size: 14px !important; }

/* Body */
.bzdt__body { display: flex; flex-direction: column; }
.bzdt__row {
  display: flex;
  align-items: center;
  padding: var(--bz-space-3) var(--bz-space-4);
  border-bottom: 1px solid var(--bz-hairline-0);
  transition: background var(--bz-dur-fast) var(--bz-ease-out);
  min-height: 44px;
}
.bzdt__row:last-child { border-bottom: none; }
.bzdt__row:hover { background: var(--bz-raised); }
.bzdt__row--clickable { cursor: pointer; }
.bzdt__row--selected {
  background: var(--bz-purple-soft);
  border-left: 3px solid var(--bz-purple-500);
}

.bzdt__td {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  padding: 0 var(--bz-space-2);
  font-size: var(--bz-size-body);
  color: var(--bz-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Status dot inside data cell */
.bzdt__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--bz-r-pill);
  flex-shrink: 0;
}
.bzdt__dot--current   { background: var(--bz-purple-300); box-shadow: 0 0 6px var(--bz-purple-glow); }
.bzdt__dot--ready     { background: var(--bz-emerald-500); }
.bzdt__dot--available { background: var(--bz-fg-faint); }
.bzdt__dot--unfit     { background: var(--bz-danger); }
.bzdt__dot--warning   { background: var(--bz-warning); }

/* Density */
.bzdt--density-compact .bzdt__row { padding: var(--bz-space-2) var(--bz-space-4); min-height: 36px; }
.bzdt--density-compact .bzdt__th { padding: var(--bz-space-1) var(--bz-space-2); }
.bzdt--density-spacious .bzdt__row { padding: var(--bz-space-4) var(--bz-space-4); min-height: 52px; }

/* Empty */
.bzdt__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--bz-space-6);
}

/* Footer */
.bzdt__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--bz-space-3) var(--bz-space-4);
  border-top: 1px solid var(--bz-border);
  background: var(--bz-panel);
  min-height: 44px;
}
.bzdt__pagination {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-3);
}
.bzdt__page-info { color: var(--bz-fg-low); }
.bzdt__page-controls { display: inline-flex; gap: var(--bz-space-1); }
</style>
