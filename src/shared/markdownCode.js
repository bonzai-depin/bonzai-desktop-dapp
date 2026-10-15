// Escaped code rendering shared by chat and company deliverables.
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeCodeLang(lang) {
  return String(lang || "")
    .trim()
    .split(/\s+/)[0]
    .replace(/^language-/, "")
    .toLowerCase();
}

const KEYWORDS = {
  js: new Set(
    "await async break case catch class const continue default delete do else export extends finally for function if import in instanceof let new return switch throw try typeof var void while with yield true false null undefined this super".split(
      " ",
    ),
  ),
  ts: new Set(
    "await async break case catch class const continue default delete do else enum export extends finally for function if implements import in interface instanceof let namespace new private protected public readonly return switch throw try type typeof var void while with yield true false null undefined this super".split(
      " ",
    ),
  ),
  py: new Set(
    "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield self".split(
      " ",
    ),
  ),
  css: new Set(
    "align-items background border color display flex grid height justify-content margin padding position width".split(
      " ",
    ),
  ),
  sh: new Set(
    "case do done elif else esac export fi for function if in local readonly return set shift then while".split(
      " ",
    ),
  ),
  json: new Set("true false null".split(" ")),
};

function keywordSetForLang(lang) {
  if (["js", "javascript", "jsx", "mjs", "cjs"].includes(lang))
    return KEYWORDS.js;
  if (["ts", "typescript", "tsx"].includes(lang)) return KEYWORDS.ts;
  if (["python", "py"].includes(lang)) return KEYWORDS.py;
  if (["bash", "shell", "zsh", "sh"].includes(lang)) return KEYWORDS.sh;
  if (["css", "scss"].includes(lang)) return KEYWORDS.css;
  if (["json", "jsonc"].includes(lang)) return KEYWORDS.json;
  return new Set();
}

export function highlightCode(source, lang = "") {
  const normalized = normalizeCodeLang(lang);
  if (["html", "xml", "vue"].includes(normalized)) {
    return escapeHtml(source).replace(
      /(&lt;\/?)([A-Za-z][\w:-]*)([^&]*?)(\/?&gt;)/g,
      (_, open, tag, attrs, close) =>
        `<span class="bz-code-token bz-code-token--punct">${open}</span><span class="bz-code-token bz-code-token--tag">${tag}</span>${attrs}<span class="bz-code-token bz-code-token--punct">${close}</span>`,
    );
  }

  const keywords = keywordSetForLang(normalized);
  let out = "";
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const ch = source[i];

    if (rest.startsWith("/*")) {
      const end = source.indexOf("*/", i + 2);
      const next = end === -1 ? source.length : end + 2;
      out += `<span class="bz-code-token bz-code-token--comment">${escapeHtml(source.slice(i, next))}</span>`;
      i = next;
      continue;
    }

    if (
      rest.startsWith("//") ||
      (["python", "py", "bash", "shell", "zsh", "sh"].includes(normalized) &&
        ch === "#")
    ) {
      const end = source.indexOf("\n", i + 1);
      const next = end === -1 ? source.length : end;
      out += `<span class="bz-code-token bz-code-token--comment">${escapeHtml(source.slice(i, next))}</span>`;
      i = next;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      let next = i + 1;
      while (next < source.length) {
        if (source[next] === "\\") {
          next += 2;
          continue;
        }
        if (source[next] === ch) {
          next += 1;
          break;
        }
        next += 1;
      }
      out += `<span class="bz-code-token bz-code-token--string">${escapeHtml(source.slice(i, next))}</span>`;
      i = next;
      continue;
    }

    const number = rest.match(/^\b\d+(?:\.\d+)?\b/);
    if (number) {
      out += `<span class="bz-code-token bz-code-token--number">${escapeHtml(number[0])}</span>`;
      i += number[0].length;
      continue;
    }

    const ident = rest.match(/^[A-Za-z_$][\w$-]*/);
    if (ident) {
      const token = ident[0];
      out += keywords.has(token)
        ? `<span class="bz-code-token bz-code-token--keyword">${escapeHtml(token)}</span>`
        : escapeHtml(token);
      i += token.length;
      continue;
    }

    out += escapeHtml(ch);
    i += 1;
  }
  return out;
}

export function renderCodeBlock(code, lang, copyLabel = "Copy code") {
  const normalizedLang = normalizeCodeLang(lang);
  const displayLang = normalizedLang || "code";
  const highlighted = highlightCode(code, normalizedLang);
  return `<figure class="bz-code" data-lang="${escapeHtml(displayLang)}"><header class="bz-code__head"><span class="bz-code__lang bz-mono">${escapeHtml(displayLang)}</span><button type="button" class="bz-code__copy" title="${escapeHtml(copyLabel)}" aria-label="${escapeHtml(copyLabel)}"><span class="material-symbols-outlined" aria-hidden="true">content_copy</span></button></header><pre class="bz-code__body"><code class="language-${escapeHtml(displayLang)}">${highlighted}</code></pre></figure>`;
}

export function bonzaiCodeBlockPlugin(md) {
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    return `${renderCodeBlock(token.content, token.info)}\n`;
  };
  md.renderer.rules.code_block = (tokens, idx) =>
    `${renderCodeBlock(tokens[idx].content, "")}\n`;
}

export function localizedCodeBlockPlugin(copyLabel) {
  return (md) => {
    md.renderer.rules.fence = (tokens, index) =>
      renderCodeBlock(tokens[index].content, tokens[index].info, copyLabel);
    md.renderer.rules.code_block = (tokens, index) =>
      renderCodeBlock(tokens[index].content, "", copyLabel);
  };
}
