import {
  BRAVE_SEARCH_ENDPOINT,
  supplierSearchInput,
  supplierSearchRequest,
} from "../../shared/supplierSourcing.js";

export function assertBraveSearchRequest(url, method = "GET", body) {
  const target = new URL(url);
  if (
    target.origin + target.pathname !== BRAVE_SEARCH_ENDPOINT ||
    target.username ||
    target.password ||
    target.hash ||
    method !== "GET" ||
    body != null
  )
    throw new Error("Brave supports only the approved web search endpoint.");
  const allowed = new Set([
    "q",
    "country",
    "search_lang",
    "count",
    "result_filter",
    "text_decorations",
    "spellcheck",
  ]);
  for (const key of target.searchParams.keys()) {
    if (!allowed.has(key) || target.searchParams.getAll(key).length !== 1)
      throw new Error("Unsupported Brave search parameter.");
  }
  supplierSearchInput({
    query: target.searchParams.get("q"),
    country: target.searchParams.get("country"),
    language: target.searchParams.get("search_lang"),
    count: target.searchParams.has("count")
      ? Number(target.searchParams.get("count"))
      : undefined,
  });
  if (
    target.searchParams.get("result_filter") !== "web" ||
    target.searchParams.get("text_decorations") !== "false" ||
    target.searchParams.get("spellcheck") !== "false"
  )
    throw new Error(
      "Brave supplier searches must preserve the reviewed query and return plain web results.",
    );
}
export function braveSearchHeaders(credential) {
  const token =
    credential?.apiKey || credential?.token || credential?.accessToken;
  if (typeof token !== "string" || !token.trim() || /[\r\n]/.test(token))
    throw new Error("A valid Brave Search API key is required.");
  return { "X-Subscription-Token": token };
}
// Connecting validates only this neutral query, never private company data.
export const braveValidationRequest = () =>
  supplierSearchRequest({ query: "Brave Search API", count: 1 });
