import copy from "./operations-copy.json" with { type: "json" };
import generated from "./generated-ui.json" with { type: "json" };
import { reviewedCatalogOverrides } from "./reviewed-catalog.js";
// Electron prefixes rejected IPC calls with implementation details. Localize
// known validation copy while leaving unrecognized provider evidence intact.
export function operationError(error, locale = 'en') {
  const message = String(error?.message || error || '').replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
  return operationText(message, locale);
}
// Explicit UI copy only. Never run this over business records or generated messages.
export function operationText(source, locale = "en", params = {}) {
  const key = copy.keys[String(source).trim().replace(/\s+/g, " ")];
  const en = copy.en[key] ?? String(source);
  if (/\bmint\b/i.test(en)) return en;
  const text =
    locale === "fr"
      ? (copy.fr[key] ?? reviewedCatalogOverrides.fr?.[en] ?? generated.fr?.[en] ?? source)
      : locale === "en"
        ? (en ?? source)
        : reviewedCatalogOverrides[locale]?.[en] ||
          generated[locale]?.[en] ||
          en ||
          source;
  return String(text).replace(
    /\{([^}]+)\}/g,
    (_, key) => params[key] ?? `{${key}}`,
  );
}
