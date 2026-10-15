<template>
  <div class="company-markdown" data-i18n-skip @click="copyCode">
    <VueMarkdown
      :key="i18n.state.locale"
      :source="visibleText(source)"
      :options="options"
      :plugins="plugins"
    />
    <span v-if="copyNotice" class="company-markdown__notice" role="status">{{
      copyNotice
    }}</span>
  </div>
</template>

<script setup>
import { computed, ref, onBeforeUnmount } from "vue";
import VueMarkdown from "vue-markdown-render";
import { visibleText } from "../../shared/visibleText.js";
import { localizedCodeBlockPlugin } from "../../shared/markdownCode.js";
import { i18n } from "../../i18n/index.js";
import { operationText } from "../../i18n/operations.js";

defineProps({ source: { type: String, default: "" } });
const ui = (text) => operationText(text, i18n.state.locale);
const options = {
  html: false,
  breaks: true,
  linkify: true,
  typographer: false,
};
const plugins = computed(() => [
  localizedCodeBlockPlugin(ui("Copy code")),
  (md) => {
    const link =
      md.renderer.rules.link_open ||
      ((tokens, index, opts, env, renderer) =>
        renderer.renderToken(tokens, index, opts));
    md.renderer.rules.link_open = (tokens, index, opts, env, renderer) => {
      tokens[index].attrSet("target", "_blank");
      tokens[index].attrSet("rel", "noopener noreferrer");
      return link(tokens, index, opts, env, renderer);
    };
    // Remote images in generated text are opened deliberately, never fetched on preview.
    md.renderer.rules.image = (tokens, index) => {
      const token = tokens[index],
        url = token.attrGet("src") || "";
      if (!/^https?:\/\//i.test(url)) return md.utils.escapeHtml(token.content);
      return `<a href="${md.utils.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${md.utils.escapeHtml(token.content || ui("Open image"))}</a>`;
    };
  },
]);
const copyNotice = ref("");
let timer;
async function copyCode(event) {
  const button = event.target.closest?.(".bz-code__copy");
  if (!button || !event.currentTarget.contains(button)) return;
  const code = button
    .closest(".bz-code")
    ?.querySelector("pre code")?.textContent;
  if (code == null) return;
  try {
    await navigator.clipboard.writeText(code);
    copyNotice.value = ui("Code copied");
  } catch {
    copyNotice.value = ui("Unable to copy code. Select and copy it manually.");
  }
  clearTimeout(timer);
  timer = setTimeout(() => {
    copyNotice.value = "";
  }, 2500);
}
onBeforeUnmount(() => clearTimeout(timer));
</script>

<style scoped>
.company-markdown {
  min-width: 0;
  color: var(--bz-fg);
  font: 400 15px/1.8 var(--bz-font-body);
  overflow-wrap: anywhere;
}
.company-markdown :deep(:is(h1, h2, h3, h4, h5, h6)) {
  color: var(--bz-fg);
  font-family: var(--bz-font-body);
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: 0;
  text-transform: none;
  margin: 1.7em 0 0.7em;
  text-wrap: pretty;
}
.company-markdown :deep(h1) {
  font-size: 28px;
}
.company-markdown :deep(h2) {
  font-size: 22px;
}
.company-markdown :deep(h3) {
  font-size: 18px;
}
.company-markdown :deep(:is(h4, h5, h6)) {
  font-size: 16px;
}
.company-markdown :deep(:first-child) {
  margin-top: 0;
}
.company-markdown :deep(:last-child) {
  margin-bottom: 0;
}
.company-markdown :deep(p) {
  margin: 0 0 1.15em;
}
.company-markdown :deep(strong) {
  color: var(--bz-fg);
  font-weight: 600;
}
.company-markdown :deep(ul),
.company-markdown :deep(ol) {
  margin: 0.7em 0 1em;
  padding-left: 1.6em;
  list-style: disc;
}
.company-markdown :deep(ol) {
  list-style: decimal;
}
.company-markdown :deep(li + li) {
  margin-top: 0.3em;
}
.company-markdown :deep(a) {
  color: var(--bz-info);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.company-markdown :deep(blockquote) {
  margin: 1em 0;
  padding: var(--bz-space-4) var(--bz-space-5);
  border-left: 3px solid var(--bz-accent);
  border-radius: 0 var(--bz-r-sm) var(--bz-r-sm) 0;
  color: var(--bz-fg-mid);
  background: var(--bz-panel);
}
.company-markdown :deep(blockquote p:last-child) {
  margin-bottom: 0;
}
.company-markdown :deep(hr) {
  border: 0;
  border-top: 1px solid var(--bz-border);
  margin: var(--bz-space-6) 0;
}
.company-markdown :deep(table) {
  display: block;
  max-width: 100%;
  width: max-content;
  overflow: auto;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  margin: 20px 0;
  font-size: 14px;
}
.company-markdown :deep(th),
.company-markdown :deep(td) {
  border: 0;
  border-bottom: 1px solid var(--bz-border);
  padding: var(--bz-space-3) var(--bz-space-4);
  text-align: left;
  min-width: 100px;
}
.company-markdown :deep(tbody tr:last-child td) {
  border-bottom: 0;
}
.company-markdown :deep(tbody tr:hover) {
  background: var(--bz-panel);
}
.company-markdown :deep(th) {
  background: var(--bz-panel);
  font-weight: 600;
}
.company-markdown :deep(code) {
  padding: 2px 6px;
  background: var(--bz-raised);
  border-radius: 4px;
  color: var(--bz-fg);
  font: 400 0.9em/1.6 var(--bz-font-mono);
}
.company-markdown :deep(.bz-code) {
  margin: var(--bz-space-5) 0;
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-lg);
  overflow: hidden;
  background: var(--bz-canvas);
}
.company-markdown :deep(.bz-code__head) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--bz-space-2) var(--bz-space-4);
  min-height: 48px;
  background: var(--bz-panel);
  border-bottom: 1px solid var(--bz-border);
}
.company-markdown :deep(.bz-code__lang) {
  font: 400 12px/1.4 var(--bz-font-mono);
  color: var(--bz-fg-mid);
}
.company-markdown :deep(.bz-code__copy) {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  color: var(--bz-fg-mid);
  background: transparent;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  cursor: pointer;
  transition:
    background var(--bz-dur-fast),
    border-color var(--bz-dur-fast);
}
.company-markdown :deep(.bz-code__copy:hover) {
  background: var(--bz-raised);
  color: var(--bz-fg);
  border-color: var(--bz-border-strong);
}
.company-markdown :deep(.bz-code__copy span) {
  font-size: 17px;
}
.company-markdown :deep(.bz-code__body) {
  margin: 0;
  padding: var(--bz-space-5);
  scrollbar-width: thin;
  scrollbar-color: var(--bz-border-strong) transparent;
  max-height: 560px;
  overflow: auto;
  background: var(--bz-canvas);
  color: var(--bz-fg);
  white-space: pre;
  tab-size: 2;
}
.company-markdown :deep(.bz-code__body code) {
  display: block;
  padding: 0;
  background: none;
  border: 0;
  border-radius: 0;
  color: inherit;
  font: 400 13px/1.8 var(--bz-font-mono);
  white-space: pre;
  overflow-wrap: normal;
}
.company-markdown :deep(.bz-code-token--keyword),
.company-markdown :deep(.bz-code-token--tag) {
  color: var(--bz-info);
  font-weight: 600;
}
.company-markdown :deep(.bz-code-token--string) {
  color: var(--bz-success);
}
.company-markdown :deep(.bz-code-token--number) {
  color: var(--bz-warning);
}
.company-markdown :deep(.bz-code-token--comment),
.company-markdown :deep(.bz-code-token--punct) {
  color: var(--bz-fg-mid);
}
.company-markdown :deep(:is(a, .bz-code__copy):focus-visible) {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
.company-markdown__notice {
  display: block;
  margin-top: var(--bz-space-3);
  color: var(--bz-fg-mid);
  font-size: 12px;
}
@media (max-width: 640px) {
  .company-markdown {
    font-size: 14px;
  }
  .company-markdown :deep(h1) {
    font-size: 22px;
  }
  .company-markdown :deep(.bz-code__body) {
    padding: 14px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .company-markdown :deep(.bz-code__copy) {
    transition: none;
  }
}
</style>
