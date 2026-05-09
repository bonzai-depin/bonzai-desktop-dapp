<template>
  <div class="bz-chat">
    <!-- Optional left rail — slot for future ChatHistoryRail.
         Intentionally not built into this shell so the chat tab can
         opt in (or use its own rail later). -->
    <aside v-if="$slots.rail" class="bz-chat__rail">
      <slot name="rail" />
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
        :class="{ 'bz-chat__stream--empty': !hasMessages }"
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
import { computed, nextTick, ref, watch } from "vue";
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
  emptySubhead:  { type: String, default: "Pick a starter or type your own. Streaming, vision, code, roleplay — same input." },
  emptyPrompts:  { type: Array,  default: () => [] },
  /** Currently loaded model name — shown in EmptyChat hint. */
  modelName: { type: String, default: "" },
  /** Auto-scroll to bottom on new messages. */
  autoscroll: { type: Boolean, default: true },
});

const emit = defineEmits([
  "inspect",
  "regenerate",
  "browse-models",
  "pick-prompt",
]);

const streamEl = ref(null);
const hasMessages = computed(
  () => Array.isArray(props.messages) && props.messages.length > 0,
);

function onPickPrompt(p) {
  emit("pick-prompt", p);
}

watch(
  () => props.messages?.length,
  () => {
    if (!props.autoscroll) return;
    nextTick(() => {
      const el = streamEl.value;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
  },
);
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
  width: 240px;
  border-right: 1px solid var(--bz-border);
  background: var(--bz-panel);
  overflow-y: auto;
}

.bz-chat__main {
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
}

.bz-chat__header {
  padding: var(--bz-space-3) var(--bz-space-4);
  border-bottom: 1px solid var(--bz-border);
  background: var(--bz-canvas);
  z-index: 1;
}

/* Message stream — scrolls; max-width applied to the message column
    so wide screens don't render uncomfortable line-lengths. */
.bz-chat__stream {
  overflow-y: auto;
  padding: 0;
  min-height: 0;
}
.bz-chat__messages {
  max-width: 760px;
  margin: 0;
  padding: var(--bz-space-4);
}

.bz-chat__stream--empty {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

/* Composer dock — sticks to the bottom of the main column.
   Never scrolls away. */
.bz-chat__input {
  padding: var(--bz-space-3) var(--bz-space-4);
  border-top: 1px solid var(--bz-border);
  background: var(--bz-canvas);
}
.bz-chat__input > :deep(*) {
  max-width: 760px;
  margin: 0;
}

.bz-chat__inspector {
  width: 320px;
  border-left: 1px solid var(--bz-border);
  background: var(--bz-panel);
  overflow-y: auto;
}

/* Narrow viewports collapse rail/inspector below the main column. */
@media (max-width: 1024px) {
  .bz-chat { grid-template-columns: minmax(0, 1fr); }
  .bz-chat__rail,
  .bz-chat__inspector { display: none; }
}
</style>
