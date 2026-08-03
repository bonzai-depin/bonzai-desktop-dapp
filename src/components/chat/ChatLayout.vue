<template>
  <div class="bz-chat">
    <!-- Optional left rail — slot for future ChatHistoryRail.
         Intentionally not built into this shell so the chat tab can
         opt in (or use its own rail later). -->
    <aside
      v-if="$slots.rail"
      class="bz-chat__rail"
      :class="{ 'is-collapsed': railCollapsed }"
    >
      <slot v-if="!railCollapsed" name="rail" />
      <slot v-else name="rail-collapsed">
        <button
          type="button"
          class="bz-chat__rail-peek"
          :aria-label="`Expand ${railLabel}`"
          :title="`Expand ${railLabel}`"
          @click="$emit('toggle-rail')"
        >
          <span class="material-symbols-outlined" aria-hidden="true">history</span>
          <span v-if="railCount > 0" class="bz-chat__rail-count bz-mono">
            {{ railCount }}
          </span>
        </button>
      </slot>
    </aside>

    <!-- Main column: header → stream OR empty → input -->
    <main class="bz-chat__main">
      <!-- Optional sticky header — model badge, mode toggles, etc. -->
      <header v-if="$slots.header" class="bz-chat__header">
        <slot name="header" />
      </header>

      <!-- Stream — when messages exist, render them; else show empty -->
      <section
        ref="streamEl"
        class="bz-chat__stream"
        :class="{ 'bz-chat__stream--empty': shouldCenterStream }"
        aria-live="polite"
        :aria-busy="busy ? 'true' : 'false'"
        @scroll="onStreamScroll"
      >
        <slot name="stream">
          <div v-if="hasMessages" class="bz-chat__messages">
            <ChatMessage
              v-for="(msg, i) in messages"
              :key="msg.id || i"
              :role="msg.role"
              :content="msg.content"
              :thinking="msg.thinking"
              :model="msg.model"
              :ts="msg.ts"
              :streaming="msg.streaming"
              :attachments="msg.attachments"
              :tool-calls="msg.toolCalls"
              :fresh="isFresh(msg)"
              @inspect="$emit('inspect', msg)"
              @regenerate="$emit('regenerate', msg)"
            >
              <slot
                name="message-body"
                :message="msg"
                :index="i"
              />
            </ChatMessage>
          </div>
          <EmptyChat
            v-else
            :headline="emptyHeadline"
            :subhead="emptySubhead"
            :prompts="emptyPrompts"
            :model-name="modelName"
            @pick="onPickPrompt"
            @browse-models="$emit('browse-models')"
          />
        </slot>
      </section>

      <button
        v-if="!isNearBottom && hasMessages"
        class="bz-chat__scroll-bottom"
        type="button"
        title="Scroll to latest message"
        aria-label="Scroll to latest message"
        @click="scrollToBottom(true)"
      >
        <span class="material-symbols-outlined" aria-hidden="true">arrow_downward</span>
      </button>

      <!-- Input docked at the bottom -->
      <footer class="bz-chat__input">
        <slot name="input" />
      </footer>
    </main>

    <!-- Optional right inspector slot — for inline inspector mounting
         when not using the global GenerationInspector overlay. -->
    <aside v-if="$slots.inspector" class="bz-chat__inspector">
      <slot name="inspector" />
    </aside>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, useSlots, watch } from "vue";
import ChatMessage from "./ChatMessage.vue";
import EmptyChat from "./EmptyChat.vue";

const props = defineProps({
  /** Default rendering: pass an array of messages and the layout
   *  iterates them through ChatMessage. Use the `stream` slot to opt
   *  out and render your own.
   *  Each item: { id, role, content, thinking, model, ts, streaming,
   *               attachments, toolCalls } */
  messages: { type: Array, default: () => [] },
  /** Empty-state hooks. */
  emptyHeadline: { type: String, default: "What are we making today?" },
  emptySubhead:  { type: String, default: "Pick a starter or type your own." },
  emptyPrompts:  { type: Array,  default: () => [] },
  /** Currently loaded model name — shown in EmptyChat hint. */
  modelName: { type: String, default: "" },
  /** Auto-scroll to bottom on new messages. */
  autoscroll: { type: Boolean, default: true },
  /** Whether the stream is currently receiving a response. */
  busy: { type: Boolean, default: false },
  /** Collapse the optional left rail while leaving a compact reopen affordance. */
  railCollapsed: { type: Boolean, default: false },
  /** Accessible label for the optional rail. */
  railLabel: { type: String, default: "history" },
  /** Optional count shown in the compact rail. */
  railCount: { type: Number, default: 0 },
});

const emit = defineEmits([
  "inspect",
  "regenerate",
  "browse-models",
  "pick-prompt",
  "toggle-rail",
]);

const slots = useSlots();
const streamEl = ref(null);
const isNearBottom = ref(true);
const hasMessages = computed(
  () => Array.isArray(props.messages) && props.messages.length > 0,
);
const shouldCenterStream = computed(() => !hasMessages.value && !slots.stream);

function onPickPrompt(p) {
  emit("pick-prompt", p);
}

function onStreamScroll() {
  const el = streamEl.value;
  if (!el) return;
  isNearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= 96;
}

async function scrollToBottom(force = false) {
  if (!props.autoscroll || (!force && !isNearBottom.value)) return;
  await nextTick();
  const el = streamEl.value;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: force ? "smooth" : "auto" });
  isNearBottom.value = true;
}

function isFresh(message) {
  const ts = Number(message?.ts || message?.timestamp || 0);
  return ts > 0 && Date.now() - ts < 2200;
}

watch(
  () => props.messages?.length,
  () => scrollToBottom(false),
);
onMounted(() => scrollToBottom(true));
</script>

<style scoped>
/* Three-column shell — rail · main · inspector — collapsing to the
   essentials when those slots aren't used. The chat tab can adopt this
   gradually: ship `messages` + `<input>` slot first, slot in a rail
   later when conversation history persistence lands.

   Editorial reading width centered in the main column. The composer
   sticks to the bottom so the user's eye returns there after each
   exchange — Claude's pattern. */

.bz-chat {
  display: grid;
  grid-template-columns:
    [rail] minmax(0, auto)
    [main] minmax(0, 1fr)
    [inspector] minmax(0, auto);
  height: 100%;
  min-height: 0;
  background: var(--bz-canvas);
}

.bz-chat__rail {
  width: 480px;
  border-right: 1px solid var(--bz-border);
  background: var(--bz-panel);
  min-height: 0;
  overflow: hidden;
  transition:
    width var(--bz-dur-base) var(--bz-ease-out),
    background var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-chat__rail.is-collapsed {
  width: 56px;
  background: var(--bz-canvas);
}
.bz-chat__rail-peek {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--bz-space-2);
  padding: var(--bz-space-4) 0;
  background: transparent;
  border: 0;
  color: var(--bz-fg-low);
  cursor: pointer;
}
.bz-chat__rail-peek:hover {
  color: var(--bz-fg);
  background: var(--bz-panel);
}
.bz-chat__rail-peek .material-symbols-outlined {
  font-size: 20px !important;
}
.bz-chat__rail-count {
  min-width: 24px;
  max-width: 42px;
  padding: 2px 4px;
  border-radius: var(--bz-r-pill);
  border: 1px solid var(--bz-border);
  background: var(--bz-card);
  color: var(--bz-fg-mid);
  font-size: 10px;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bz-chat__main {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  overflow: hidden;
}
.bz-chat__scroll-bottom {
  position: absolute;
  right: var(--bz-space-5);
  bottom: 92px;
  z-index: 3;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border: 1px solid var(--bz-border-strong);
  border-radius: 50%;
  background: var(--bz-raised);
  color: var(--bz-fg);
  box-shadow: var(--bz-shadow-lg);
  cursor: pointer;
}

.bz-chat__header {
  padding: var(--bz-space-3) var(--bz-space-4);
  border-bottom: 1px solid var(--bz-border);
  background: var(--bz-canvas);
  z-index: 1;
}

.bz-chat__stream--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Message stream — scrolls natively. Content below is centered via
   margin: auto, not flexbox (which breaks overflow scroll). */
.bz-chat__stream {
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
  display: block;
  padding: 0;
}

/* Child wrapper inside the stream — centered reading column.
   This div must NOT have overflow-y; it grows with content and
   the parent .bz-chat__stream handles the scrollbar. */
.bz-chat__messages {
  max-width: 760px;
  width: 100%;
  padding: var(--bz-space-4);
  margin: 0 auto;
  min-height: 0;
}

/* Composer dock — sticks to the bottom of the main column.
   Never scrolls away. */
.bz-chat__input {
  position: sticky;
  bottom: 0;
  z-index: 2;
  padding: var(--bz-space-3) var(--bz-space-4);
  border-top: 1px solid var(--bz-border);
  background: var(--bz-canvas);
}
.bz-chat__input > :deep(*) {
  width: 100%;
  max-width: none;
  margin: 0;
}

.bz-chat__inspector {
  width: 320px;
  border-left: 1px solid var(--bz-border);
  background: var(--bz-panel);
  min-height: 0;
  overflow-y: auto;
}

/* Narrow viewports collapse rail/inspector below the main column. */
@media (max-width: 1024px) {
  .bz-chat { grid-template-columns: minmax(0, 1fr); }
  .bz-chat__rail,
  .bz-chat__inspector { display: none; }
}
</style>
