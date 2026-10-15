// Brave Web Search API: https://api-dashboard.search.brave.com/api-reference/web/search/get
export const BRAVE_SEARCH_ENDPOINT =
  "https://api.search.brave.com/res/v1/web/search";
export function supplierSearchInput(input = {}) {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (!query || query.length > 600 || query.split(/\s+/).length > 75)
    throw new Error(
      "Supplier search requires a query of at most 600 characters and 75 words.",
    );
  const country = String(input.country || "ALL").toUpperCase();
  const language = String(input.language || "en").toLowerCase();
  const count = input.count ?? 10;
  if (!/^(?:[A-Z]{2}|ALL)$/.test(country))
    throw new Error("Use a two-letter country code or ALL.");
  if (!/^[a-z]{2,3}(?:-[a-z]{2,4})?$/.test(language))
    throw new Error("Use a Brave search language code, such as en or fr.");
  if (!Number.isInteger(count) || count < 1 || count > 20)
    throw new Error("Supplier search count must be an integer from 1 to 20.");
  return { query, country, language, count };
}
export function supplierSearchRequest(input) {
  const { query, country, language, count } = supplierSearchInput(input);
  const url = new URL(BRAVE_SEARCH_ENDPOINT);
  url.search = new URLSearchParams({
    q: query,
    country,
    search_lang: language,
    count: String(count),
    result_filter: "web",
    text_decorations: "false",
    spellcheck: "false",
  }).toString();
  return { url: url.toString(), method: "GET" };
}
