<template>
  <section class="bz-empty-chat" aria-label="Start a conversation">
    <div class="bz-empty-chat__head">
      <p class="bz-eyebrow">Chat</p>
      <h1 class="bz-display">{{ headline }}</h1>
      <p v-if="subhead" class="bz-empty-chat__sub bz-meta">{{ subhead }}</p>
    </div>

    <!-- Quick prompts — small editorial cards. Click → emit -->
    <div class="bz-empty-chat__grid" v-if="prompts?.length">
      <button
        v-for="(p, i) in prompts"
        :key="i"
        type="button"
        class="bz-prompt-card"
        @click="$emit('pick', p)"
      >
        <span class="material-symbols-outlined bz-prompt-card__icon" aria-hidden="true">
          {{ p.icon || 'arrow_outward' }}
        </span>
        <span class="bz-prompt-card__title">{{ p.title }}</span>
        <span v-if="p.subtitle" class="bz-prompt-card__sub bz-meta">{{ p.subtitle }}</span>
      </button>
    </div>

    <!-- Browse models CTA — a quiet secondary action so it doesn't
         compete with the prompt cards above it. -->
    <p class="bz-empty-chat__cta">
      <button type="button" class="bz-empty-chat__link" @click="$emit('browse-models')">
        <span class="material-symbols-outlined" aria-hidden="true">memory</span>
        <span>Choose a different model</span>
      </button>
      <span class="bz-meta bz-empty-chat__model" v-if="modelName">
        Currently loaded: <span class="bz-mono">{{ modelName }}</span>
      </span>
    </p>
  </section>
</template>

<script setup>
defineProps({
  /** Headline rendered in the display tier — quiet hero. */
  headline: { type: String, default: "What are we making today?" },
  /** Optional subhead under the headline. */
  subhead: {
    type: String,
    default: "Pick a starter or type your own. Streaming, vision, code, roleplay — same input.",
  },
  /** Quick prompt cards — [{ icon, title, subtitle, value }, …] */
  prompts: {
    type: Array,
    default: () => [
      { icon: "psychology", title: "Help me think through a problem", subtitle: "Reasoning, trade-offs, decisions", value: "Help me think through " },
      { icon: "code", title: "Write or review code", subtitle: "Languages, refactors, tests", value: "Write me a " },
      { icon: "edit_note", title: "Draft something",  subtitle: "Email, README, post", value: "Draft a " },
      { icon: "menu_book", title: "Explain a concept", subtitle: "ELI5 or technical", value: "Explain " },
    ],
  },
  /** Currently loaded model name — shown as a quiet hint. */
  modelName: { type: String, default: "" },
});

defineEmits(["pick", "browse-models"]);
</script>

<style scoped>
.bz-empty-chat {
  max-width: 760px;
  margin: 0;
  padding: var(--bz-space-8) var(--bz-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-7);
}

.bz-empty-chat__head .bz-eyebrow { margin: 0 0 var(--bz-space-2) 0; }
.bz-empty-chat__head h1          { margin: 0; color: var(--bz-fg); }
.bz-empty-chat__sub {
  margin: var(--bz-space-3) 0 0 0;
  max-width: 56ch;
}

/* Prompt cards — 2 × 2 grid on wide, single column on narrow. */
.bz-empty-chat__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bz-space-3);
}
@media (max-width: 720px) {
  .bz-empty-chat__grid { grid-template-columns: 1fr; }
}

.bz-prompt-card {
  text-align: left;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  padding: var(--bz-space-4);
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: var(--bz-space-3);
  row-gap: 4px;
  cursor: pointer;
  color: var(--bz-fg);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body);
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-prompt-card:hover {
  background: var(--bz-raised);
  border-color: var(--bz-border-brand);
}
.bz-prompt-card__icon {
  grid-row: 1 / span 2;
  color: var(--bz-purple-300);
  font-size: 22px !important;
  align-self: start;
  margin-top: 2px;
}
.bz-prompt-card__title {
  font-weight: 400;
}
.bz-prompt-card__sub {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
}

.bz-empty-chat__cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  flex-wrap: wrap;
  margin: 0;
  padding-top: var(--bz-space-4);
  border-top: 1px solid var(--bz-border);
}
.bz-empty-chat__link {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  background: transparent;
  border: 0;
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body);
  cursor: pointer;
  padding: 4px 0;
  transition: color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-empty-chat__link:hover { color: var(--bz-fg); }
.bz-empty-chat__link .material-symbols-outlined { font-size: 18px !important; }

.bz-empty-chat__model { color: var(--bz-fg-low); }
</style>
