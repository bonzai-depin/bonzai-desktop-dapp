/**
 * BOAMP open data (Bulletin officiel des annonces des marchés publics), published
 * by the DILA under the Licence Ouverte 2.0. Anonymous, read-only, no account.
 * https://boamp-datadila.opendatasoft.com/explore/dataset/boamp/api/
 *
 * A search sends the terms the user typed and nothing else: no credential,
 * cookie, company name or document ever goes into the request.
 */
export const BOAMP_HOST = "boamp-datadila.opendatasoft.com";
const ENDPOINT = `https://${BOAMP_HOST}/api/explore/v2.1/catalog/datasets/boamp/records`;
export const BOAMP_PAGE_SIZE = 20;
const SELECT = "idweb,objet,nomacheteur,dateparution,datelimitereponse,code_departement,type_marche,nature,nature_libelle,procedure_libelle,descripteur_libelle,url_avis,donnees";

const quote = (value) => `"${String(value).replace(/[\\"]/g, " ").replace(/\s+/g, " ").trim()}"`;

/** Filters (already normalised by tendersDomain.normalizeSearch) to an ODSQL query. */
export function boampQuery(filters, now = Date.now()) {
  const where = ['nature = "APPEL_OFFRE"'];
  if (filters.keywords) where.push(`search(objet, ${quote(filters.keywords)})`);
  if (filters.departments?.length) where.push(`(${filters.departments.map((d) => `code_departement = ${quote(d)}`).join(" OR ")})`);
  if (filters.type) where.push(`type_marche = ${quote(filters.type)}`);
  if (filters.openOnly !== false) where.push(`datelimitereponse >= date'${new Date(now).toISOString().slice(0, 10)}'`);
  return new URLSearchParams({
    select: SELECT,
    where: where.join(" AND "),
    order_by: "dateparution desc",
    limit: String(BOAMP_PAGE_SIZE),
    offset: String((filters.page || 0) * BOAMP_PAGE_SIZE),
  });
}

function find(value, key, depth = 0) {
  if (!value || typeof value !== "object" || depth > 12) return undefined;
  if (typeof value[key] === "string") return value[key];
  if (value[key] && typeof value[key]["#text"] === "string") return value[key]["#text"];
  for (const child of Object.values(value)) {
    const hit = find(child, key, depth + 1);
    if (hit) return hit;
  }
  return undefined;
}
const list = (value) => (Array.isArray(value) ? value : value ? [value] : []).map(String);

/** One open-data record to the notice shape the workspace keeps. Unknown layouts lose only optional fields. */
export function normalizeBoampRecord(record = {}) {
  let details = {};
  try {
    details = typeof record.donnees === "string" ? JSON.parse(record.donnees) : record.donnees || {};
  } catch {
    details = {};
  }
  return {
    source: "boamp",
    sourceId: String(record.idweb || ""),
    title: String(record.objet || "").trim(),
    buyer: String(record.nomacheteur || "").trim(),
    publishedAt: record.dateparution || null,
    deadline: record.datelimitereponse || null,
    departments: list(record.code_departement),
    type: list(record.type_marche).join(", "),
    nature: String(record.nature_libelle || record.nature || ""),
    procedure: String(record.procedure_libelle || ""),
    descriptors: list(record.descripteur_libelle),
    url: String(record.url_avis || ""),
    // The buyer's own platform, where the consultation file is and where a bid is deposited.
    buyerProfileUrl: find(details, "urlProfilAch") || find(details, "cbc:BuyerProfileURI") || "",
  };
}

export function createBoampClient({ fetchImpl = fetch } = {}) {
  return {
    async search(filters, now = Date.now()) {
      const query = boampQuery(filters, now);
      let response;
      try {
        response = await fetchImpl(`${ENDPOINT}?${query}`, {
          method: "GET",
          redirect: "error",
          credentials: "omit",
          signal: AbortSignal.timeout(20000),
          headers: { Accept: "application/json" },
        });
      } catch {
        throw new Error("The public tender service could not be reached. Check the connection and try again.");
      }
      if (response.status === 429) throw new Error("The public tender service is limiting requests. Try again in a minute.");
      if (!response.ok) throw new Error(`The public tender service answered HTTP ${response.status}.`);
      let body;
      try {
        body = await response.json();
      } catch {
        throw new Error("The public tender service returned an unreadable answer.");
      }
      if (!Array.isArray(body?.results)) throw new Error("The public tender service returned an unreadable answer.");
      return {
        host: BOAMP_HOST,
        total: Number(body.total_count) || 0,
        pageSize: BOAMP_PAGE_SIZE,
        notices: body.results.map(normalizeBoampRecord).filter((notice) => notice.sourceId && notice.title),
      };
    },
  };
}
