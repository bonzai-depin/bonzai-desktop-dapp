import { visibleText } from "../../shared/visibleText.js";

export function artifactText(row = {}) {
  const value = row.payload ?? row.meta?.text ?? "";
  if (typeof value === "object")
    return visibleText(JSON.stringify(value, null, 2));
  const text = visibleText(value);
  if (/^[\[{]/.test(text)) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      /* prose can start with a bracket */
    }
  }
  return text;
}

export function artifactLanguage(row = {}) {
  const format = String(
    row.meta?.format || row.meta?.language || "",
  ).toLowerCase();
  if (
    [
      "javascript",
      "js",
      "typescript",
      "ts",
      "python",
      "py",
      "json",
      "html",
      "css",
      "sql",
      "bash",
      "sh",
      "yaml",
      "xml",
      "vue",
    ].includes(format)
  )
    return format;
  if (row.pipeline === "3d" && row.meta?.payloadEncoding === "text")
    return "javascript";
  if (
    ["text", "skill", "vision", "finetune"].includes(
      String(row.pipeline).toLowerCase(),
    )
  ) {
    try {
      const value =
        typeof row.payload === "object"
          ? row.payload
          : JSON.parse(artifactText(row));
      if (value && typeof value === "object") return "json";
    } catch {
      /* ordinary Markdown */
    }
  }
  return "";
}

export function artifactTitle(row = {}) {
  // Media payloads can contain megabytes of base64; never scan them for a title.
  const prose =
    ["text", "vision", "skill", "finetune"].includes(
      String(row.pipeline).toLowerCase(),
    ) || !row.pipeline;
  const heading =
    prose && typeof row.payload === "string"
      ? visibleText(row.payload.slice(0, 10000)).match(/^#{1,3}\s+(.+)$/m)?.[1]
      : "";
  const title =
    row.meta?.title || row.title || heading || row.prompt || row.id || "";
  return visibleText(title)
    .replace(/\*\*|__|`/g, "")
    .split("\n")[0]
    .slice(0, 180);
}
