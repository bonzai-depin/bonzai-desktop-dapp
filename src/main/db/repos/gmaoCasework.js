import { randomUUID, createHash } from "node:crypto";
import { get } from "../connection.js";
import * as blobs from "../blobs.js";
import { owned } from "./gmaoIntegrity.js";
import {
  identity,
  normalizeMaintenanceDocument,
  normalizeEquipment,
  normalizeVisit,
  normalizePart,
  normalizeFluid,
  normalizeBlocker,
  normalizeSignature,
  normalizeReferences,
} from "../../../shared/maintenanceEvidence.js";
import {
  validatePricingProfile,
  calculateContractQuote,
} from "../../../services/company/contractPricing.js";
const db = () => get().db;
const tx =
  (fn) =>
  (...args) =>
    db().transaction(() => fn(...args))();
const row = (r) =>
  r
    ? {
        ...JSON.parse(r.data),
        id: r.id,
        kind: r.kind,
        workOrderId: r.work_order_id,
        siteId: r.site_id,
        sourceId: r.source_id,
        revision: r.revision,
        createdAt: r.created_at,
      }
    : null;
function company(id) {
  if (!db().prepare("SELECT id FROM companies WHERE id=?").get(id))
    throw new Error("Entreprise introuvable.");
}
function record(id, key) {
  return owned("gmao_case_records", id, key);
}
function append(id, key, action, data) {
  db()
    .prepare("INSERT INTO gmao_case_events VALUES(?,?,?,?,?)")
    .run(
      randomUUID(),
      id,
      key,
      JSON.stringify({ action, revision: record(id, key).revision, ...data }),
      Date.now()
    );
}
function persist(id, kind, data, input = {}) {
  company(id);
  if (input.workOrderId) owned("gmao_work_orders", id, input.workOrderId);
  if (input.siteId) owned("gmao_sites", id, input.siteId);
  const old = input.id ? record(id, input.id) : null;
  if (
    old &&
    (old.kind !== kind ||
      old.work_order_id !== (input.workOrderId || null) ||
      old.site_id !== (input.siteId || null))
  )
    throw new Error(
      "Le dossier et la nature d’une preuve ne peuvent pas changer."
    );
  if (old && input.revision !== old.revision)
    throw new Error("Ce dossier a changé. Actualisez avant de modifier.");
  const key = old?.id || randomUUID(),
    now = Date.now();
  db()
    .prepare(
      `INSERT INTO gmao_case_records(id,company_id,work_order_id,site_id,kind,data,source_id,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=gmao_case_records.revision+1,updated_at=excluded.updated_at`
    )
    .run(
      key,
      id,
      input.workOrderId || null,
      input.siteId || null,
      kind,
      JSON.stringify(data),
      input.sourceId || null,
      now,
      now
    );
  append(id, key, old ? "updated" : "created", {
    before: old ? JSON.parse(old.data) : null,
    after: data,
  });
  return row(record(id, key));
}
function scopeFacts(id, data) {
  for (const key of ["assetId", "donorAssetId", "recipientAssetId"])
    if (data[key]) owned("gmao_assets", id, data[key]);
  if (
    data.downtimeFrom &&
    data.downtimeUntil &&
    data.downtimeUntil < data.downtimeFrom
  )
    throw new Error("La remise en service précède la panne.");
}
function proof(id, sourceId) {
  const source = owned("company_intake_sources", id, sourceId),
    data = JSON.parse(source.data);
  if (!data.blobId)
    throw new Error("Un fichier original est requis pour cette archive.");
  const blob = db().prepare("SELECT id FROM blobs WHERE id=?").get(data.blobId);
  if (
    !blob ||
    !/^[a-f0-9]{64}$/.test(data.blobId) ||
    !/^[a-z0-9]{1,12}$/.test(data.ext || "") ||
    !blobs.exists(data.blobId, data.ext)
  )
    throw new Error("Le fichier original est introuvable.");
  if (
    createHash("sha256")
      .update(blobs.read(data.blobId, data.ext))
      .digest("hex") !== data.blobId
  )
    throw new Error(
      "Le fichier original a été modifié. Restaurez la copie intacte."
    );
  return {
    sourceId,
    blobId: data.blobId,
    ext: data.ext,
    name: source.name,
    importedAt: Date.now(),
  };
}
const refScope = (r, site) =>
  JSON.stringify([identity(r.issuer), r.year, site]);
export function findMatches(
  id,
  {
    references = [],
    site = "",
    siteId,
    title = "",
    occurredOn,
    equipment = [],
  } = {}
) {
  company(id);
  const resolvedSite = siteId || resolveSite(id, site)?.id || site;
  const results = new Map();
  for (const r of normalizeReferences(references)) {
    const hits = db()
      .prepare(
        "SELECT r.* FROM gmao_case_references x JOIN gmao_case_records r ON r.id=x.record_id WHERE x.company_id=? AND x.scope=? AND x.type=? AND x.value=?"
      )
      .all(id, refScope(r, resolvedSite), r.type, identity(r.value));
    for (const hit of hits) results.set(hit.id, row(hit));
  }
  if (title || occurredOn || equipment.length) {
    const words = new Set(
      identity(title)
        .split(/\W+/)
        .filter((w) => w.length > 3)
    );
    for (const candidate of db()
      .prepare(
        "SELECT * FROM gmao_case_records WHERE company_id=? AND site_id=? AND kind='archive'"
      )
      .all(id, resolvedSite)) {
      if (results.has(candidate.id)) continue;
      const data = row(candidate);
      const score = (data.documents || []).reduce(
        (best, d) =>
          Math.max(
            best,
            (occurredOn && d.occurredOn === occurredOn ? 2 : 0) +
              (equipment.some((e) =>
                (d.equipment || []).some(
                  (a) =>
                    (e.assetId && e.assetId === a.assetId) ||
                    (e.serialNumber &&
                      identity(e.serialNumber) === identity(a.serialNumber))
                )
              )
                ? 2
                : 0) +
              (identity(d.title)
                .split(/\W+/)
                .filter((w) => words.has(w)).length >= 3
                ? 1
                : 0)
          ),
        0
      );
      if (score >= 2)
        results.set(candidate.id, { ...data, matchKind: "suggested" });
    }
  }
  return [...results.values()].slice(0, 100);
}
export function resolveSite(id, name) {
  const target = identity(name);
  if (!target) return null;
  const aliases = db()
    .prepare(
      "SELECT * FROM gmao_case_records WHERE company_id=? AND kind='site_alias'"
    )
    .all(id)
    .filter((r) => identity(JSON.parse(r.data).alias) === target)
    .map((r) => r.site_id);
  const matches = db()
    .prepare("SELECT * FROM gmao_sites WHERE company_id=?")
    .all(id)
    .filter(
      (s) =>
        [identity(s.name), identity(s.trigram)].includes(target) ||
        aliases.includes(s.id)
    );
  if (matches.length > 1)
    throw new Error("Site ambigu : choisissez le site exact.");
  return matches[0] || null;
}
function indexReferences(id, key, refs, site) {
  for (const r of refs) {
    const scope = refScope(r, site);
    const old = db()
      .prepare(
        "SELECT record_id FROM gmao_case_references WHERE company_id=? AND scope=? AND type=? AND value=?"
      )
      .get(id, scope, r.type, identity(r.value));
    if (old && old.record_id !== key) {
      const linked = record(id, old.record_id),
        incoming = record(id, key);
      if (
        linked.work_order_id &&
        linked.work_order_id === incoming.work_order_id
      )
        continue;
      throw new Error(
        "Une référence appartient déjà à un autre dossier. Rapprochez les preuves avant de poursuivre."
      );
    }
    db()
      .prepare("INSERT OR IGNORE INTO gmao_case_references VALUES(?,?,?,?,?,?)")
      .run(randomUUID(), id, key, scope, r.type, identity(r.value));
  }
}
export const importHistory = tx((id, input) => {
  company(id);
  if (input.confirmed !== true)
    throw new Error("Vérifiez les preuves avant de reprendre cet historique.");
  const data = normalizeMaintenanceDocument(input.data || input),
    original = proof(id, input.sourceId);
  const existing = db()
    .prepare(
      "SELECT * FROM gmao_case_records WHERE company_id=? AND kind='archive'"
    )
    .all(id)
    .find((r) =>
      (JSON.parse(r.data).documents || []).some(
        (d) =>
          d.source.sourceId === input.sourceId &&
          d.actionId === (input.actionId || null)
      )
    );
  if (existing) return row(existing);
  const site = data.siteId
    ? owned("gmao_sites", id, data.siteId)
    : resolveSite(id, data.site);
  if (!site)
    throw new Error(
      "Créez ou rapprochez le site avant de reprendre cette archive."
    );
  data.siteId = site.id;
  if (data.workOrderId) {
    const wo = owned("gmao_work_orders", id, data.workOrderId);
    if (wo.site_id !== site.id)
      throw new Error(
        "L’intervention et l’archive doivent concerner le même site."
      );
  }
  for (const fact of [...data.equipment, ...data.parts, ...data.fluids])
    scopeFacts(id, fact);
  const matches = findMatches(id, {
    references: data.references,
    siteId: site.id,
  });
  const target = input.targetRecordId || input.data?.targetRecordId;
  if (matches.length && !target)
    throw new Error(
      "Rapprochement nécessaire : une référence existe déjà. Choisissez le dossier à compléter."
    );
  const chosen = target ? row(record(id, target)) : null;
  if (
    target &&
    matches.some(
      (m) =>
        m.id !== target &&
        (!chosen.workOrderId || chosen.workOrderId !== m.workOrderId)
    )
  )
    throw new Error(
      "Les références désignent plusieurs dossiers : corrigez le rapprochement."
    );
  let old = chosen;
  if (chosen?.kind === "reference") {
    const wo = owned("gmao_work_orders", id, chosen.workOrderId);
    if (
      wo.site_id !== site.id ||
      (data.workOrderId && data.workOrderId !== wo.id)
    )
      throw new Error(
        "La référence et l’archive doivent concerner le même dossier."
      );
    data.workOrderId = wo.id;
    old =
      snapshot(id, { workOrderId: wo.id }).records.find(
        (r) => r.kind === "archive"
      ) || null;
  }
  if (old && (old.kind !== "archive" || old.siteId !== site.id))
    throw new Error("Archive cible incompatible.");
  const documents = [
    ...(old?.documents || []),
    { ...data, source: original, actionId: input.actionId || null },
  ];
  const result = persist(
    id,
    "archive",
    {
      title: old?.title || data.title,
      occurredOn: old?.occurredOn || data.occurredOn,
      documents,
    },
    {
      id: old?.id,
      revision: old?.revision,
      siteId: site.id,
      workOrderId: old?.workOrderId || data.workOrderId,
      sourceId: old?.sourceId || input.sourceId,
    }
  );
  indexReferences(id, result.id, data.references, site.id);
  return result;
});
const normalizers = {
  reference: (d) => normalizeReferences([d])[0],
  equipment: normalizeEquipment,
  visit: normalizeVisit,
  part: normalizePart,
  fluid: normalizeFluid,
  blocker: normalizeBlocker,
  signature: normalizeSignature,
};
export const saveRecord = tx((id, input = {}) => {
  company(id);
  if (!normalizers[input.kind]) throw new Error("Type de preuve inconnu.");
  const wo = owned("gmao_work_orders", id, input.workOrderId);
  if (["completed", "cancelled"].includes(wo.status))
    throw new Error("Le dossier clôturé est en lecture seule.");
  const data = normalizers[input.kind](input.data || {});
  scopeFacts(id, data);
  if (input.id && input.kind === "fluid") {
    const old = row(record(id, input.id));
    if (old.followupResolvedAt)
      throw new Error("Ce suivi est clos. Enregistrez un nouveau contrôle.");
  }
  if (
    input.kind === "equipment" &&
    data.assetId &&
    owned("gmao_assets", id, data.assetId).site_id !== wo.site_id
  )
    throw new Error(
      "Cet équipement ne fait pas partie du site de l’intervention."
    );
  if (input.kind === "equipment" && data.assetId) {
    const duplicate = db()
      .prepare(
        "SELECT id FROM gmao_case_records WHERE company_id=? AND work_order_id=? AND kind='equipment' AND json_extract(data,'$.assetId')=? AND id!=?"
      )
      .get(id, wo.id, data.assetId, input.id || "");
    if (duplicate)
      throw new Error(
        "Cet équipement figure déjà dans le dossier. Modifiez sa ligne."
      );
  }
  if (
    input.kind === "part" &&
    data.origin === "stock" &&
    !data.stockMovementId &&
    !(input.id && row(record(id, input.id)).stockReceipt)
  )
    throw new Error("Reliez la sortie de stock enregistrée dans Achats.");
  if (data.stockMovementId) {
    const move = stockMovements(id, { workOrderId: wo.id }).movements.find(
      (m) => m.id === data.stockMovementId
    );
    if (
      !move ||
      !["consume", "transfer", "fulfill"].includes(move.type) ||
      move.quantity !== data.quantity
    )
      throw new Error("Mouvement de stock incompatible avec cette pièce.");
    const reference = data.stockMovementId;
    const linked = db()
      .prepare(
        "SELECT id FROM gmao_case_records WHERE company_id=? AND kind='part' AND (json_extract(data,'$.stockMovementId')=? OR json_extract(data,'$.stockReceipt.movementReference')=?) AND id!=?"
      )
      .get(id, reference, reference, input.id || "");
    if (linked) throw new Error("Ce mouvement de stock est déjà affecté.");
    if (move.shared) {
      data.stockMovementId = null;
      data.stockReceipt = {
        movementReference: reference,
        type: move.type,
        quantity: move.quantity,
        locationId: move.locationId,
        destinationId: move.destinationId,
        receivedAt: move.receivedAt,
      };
    }
  }
  if (input.id && !data.stockMovementId && !data.stockReceipt) {
    const old = row(record(id, input.id));
    if (old.stockReceipt) {
      if (
        old.stockReceipt.quantity !== data.quantity ||
        data.origin !== "stock"
      )
        throw new Error(
          "La quantité et la provenance doivent correspondre au mouvement de stock lié."
        );
      data.stockReceipt = old.stockReceipt;
    }
  }
  const evidence = input.sourceId ? proof(id, input.sourceId) : null;
  if (
    input.kind === "signature" &&
    data.status === "present" &&
    !evidence &&
    !input.documentId
  )
    throw new Error("Joignez la preuve de signature.");
  if (input.documentId) {
    const doc = owned("gmao_documents", id, input.documentId);
    if (doc.work_order_id !== wo.id)
      throw new Error("Le document appartient à une autre intervention.");
  }
  const result = persist(
    id,
    input.kind,
    { ...data, evidence, documentId: input.documentId || null },
    { ...input, siteId: wo.site_id }
  );
  if (input.kind === "reference") {
    db()
      .prepare(
        "DELETE FROM gmao_case_references WHERE company_id=? AND record_id=?"
      )
      .run(id, result.id);
    indexReferences(id, result.id, [data], wo.site_id);
  }
  return result;
});
export const resolveBlocker = tx((id, input) => {
  const old = row(record(id, input.id));
  if (old.kind !== "blocker" || !String(input.resolution || "").trim())
    throw new Error("Indiquez la résolution du blocage.");
  const wo = owned("gmao_work_orders", id, old.workOrderId);
  if (["completed", "cancelled"].includes(wo.status) || old.status !== "open")
    throw new Error("Ce blocage ne peut plus être modifié.");
  const {
    id: key,
    kind,
    workOrderId,
    siteId,
    sourceId,
    revision,
    createdAt,
    ...facts
  } = old;
  return persist(
    id,
    "blocker",
    {
      ...facts,
      status: "resolved",
      resolution: String(input.resolution).slice(0, 4000),
      resolvedAt: Date.now(),
    },
    {
      id: old.id,
      revision: input.revision,
      workOrderId: old.workOrderId,
      siteId: old.siteId,
    }
  );
});
export const resolveFluidFollowup = tx((id, input) => {
  const old = row(record(id, input.id));
  if (
    old.kind !== "fluid" ||
    old.followupResolvedAt ||
    !String(input.resolution || "").trim()
  )
    throw new Error("Indiquez le résultat constaté du suivi.");
  const document = owned("gmao_documents", id, input.documentId);
  if (document.work_order_id !== old.workOrderId)
    throw new Error("Joignez un compte-rendu de ce dossier.");
  const {
    id: key,
    kind,
    workOrderId,
    siteId,
    sourceId,
    revision,
    createdAt,
    ...facts
  } = old;
  return persist(
    id,
    "fluid",
    {
      ...facts,
      followupResolvedAt: Date.now(),
      followupResolution: String(input.resolution).trim().slice(0, 4000),
      followupDocumentId: document.id,
    },
    { id: key, revision: input.revision, workOrderId, siteId }
  );
});
export function partCostSummary(id, { workOrderId }) {
  const parts = snapshot(id, { workOrderId }).records.filter(
    (r) => r.kind === "part"
  );
  const included = parts.filter((r) => r.origin !== "customer_supplied");
  const missing = included.filter((r) => r.unitCostCents == null);
  const total = included.reduce(
    (sum, r) => sum + Math.round(r.quantity * (r.unitCostCents || 0)),
    0
  );
  if (!Number.isSafeInteger(total))
    throw new Error("Montant des pièces hors limites.");
  return {
    partsCents: missing.length ? null : total,
    missing: missing.map((r) => r.name),
    excluded: parts
      .filter((r) => r.origin === "customer_supplied")
      .map((r) => r.name),
    records: parts.map((r) => ({ id: r.id, revision: r.revision })),
  };
}
export const saveSiteAlias = tx((id, input) => {
  owned("gmao_sites", id, input.siteId);
  if (!String(input.alias || "").trim()) throw new Error("Alias requis.");
  const match = resolveSite(id, input.alias);
  if (match && match.id !== input.siteId)
    throw new Error("Cet alias désigne déjà un autre site.");
  return persist(
    id,
    "site_alias",
    { alias: String(input.alias).trim().slice(0, 200) },
    { id: input.id, revision: input.revision, siteId: input.siteId }
  );
});
export function snapshot(id, { workOrderId, siteId, query = "" } = {}) {
  company(id);
  if (workOrderId) owned("gmao_work_orders", id, workOrderId);
  if (siteId) owned("gmao_sites", id, siteId);
  const rows = db()
    .prepare(
      "SELECT * FROM gmao_case_records WHERE company_id=? AND (? IS NULL OR work_order_id=?) AND (? IS NULL OR site_id=?) ORDER BY created_at DESC,id"
    )
    .all(
      id,
      workOrderId || null,
      workOrderId || null,
      siteId || null,
      siteId || null
    )
    .map(row)
    .filter(
      (r) => !query || identity(JSON.stringify(r)).includes(identity(query))
    );
  return {
    records: rows,
    references: db()
      .prepare("SELECT * FROM gmao_case_references WHERE company_id=?")
      .all(id),
  };
}
export function history(id, { id: key }) {
  record(id, key);
  return db()
    .prepare(
      "SELECT * FROM gmao_case_events WHERE company_id=? AND record_id=? ORDER BY COALESCE(json_extract(data,'$.revision'),0),created_at,id"
    )
    .all(id, key)
    .map((r) => ({ ...r, data: JSON.parse(r.data) }));
}
export function assertCaseRestorable(id, wo) {
  const facts = snapshot(id, { workOrderId: wo.id }).records;
  if (facts.some((r) => r.kind === "blocker" && r.status === "open"))
    throw new Error(
      "Résolvez les blocages avant de remettre l’ensemble en service."
    );
  if (facts.some((r) => r.kind === "equipment" && r.outcome !== "operational"))
    throw new Error(
      "La remise en service est partielle. Tous les équipements doivent être opérationnels avant de clôturer."
    );
}
export const savePricingVersion = tx((id, input) => {
  const contract = owned("gmao_service_contracts", id, input.contractId);
  const profile = validatePricingProfile(
    { ...input.profile, id: "contract", version: input.version },
    { confirmed: input.confirmed }
  );
  const existing = db()
    .prepare(
      "SELECT * FROM gmao_case_records WHERE company_id=? AND kind='pricing'"
    )
    .all(id)
    .map(row)
    .filter((r) => r.contractId === contract.id);
  if (input.supersedes) {
    const previous = existing.find((r) => r.id === input.supersedes);
    if (
      !previous ||
      profile.version <= previous.profile.version ||
      profile.effectiveFrom <= previous.profile.effectiveFrom ||
      profile.effectiveFrom > previous.profile.effectiveUntil
    )
      throw new Error(
        "L’avenant doit commencer dans la période de la version remplacée."
      );
    const end = new Date(Date.parse(profile.effectiveFrom) - 86400000)
      .toISOString()
      .slice(0, 10);
    const updated = persist(
      id,
      "pricing",
      {
        contractId: contract.id,
        profile: { ...previous.profile, effectiveUntil: end },
        supersededByVersion: profile.version,
      },
      { id: previous.id, revision: previous.revision }
    );
    existing.splice(existing.indexOf(previous), 1, updated);
  }
  if (
    existing.some(
      (r) =>
        r.profile.version === profile.version ||
        (r.profile.effectiveFrom <= profile.effectiveUntil &&
          profile.effectiveFrom <= r.profile.effectiveUntil)
    )
  )
    throw new Error(
      "Cette version ou sa période chevauche un profil existant."
    );
  return persist(id, "pricing", { contractId: contract.id, profile });
});
export function pricingFor(id, contractId, date) {
  const profiles = snapshot(id).records.filter(
    (r) =>
      r.kind === "pricing" &&
      r.contractId === contractId &&
      r.profile.effectiveFrom <= date &&
      date <= r.profile.effectiveUntil
  );
  if (profiles.length !== 1) return null;
  return profiles[0].profile;
}
export function previewQuote(id, input) {
  const asset = owned("gmao_assets", id, input.assetId),
    profile = pricingFor(id, input.contractId, input.date);
  if (!profile)
    throw new Error("Aucun profil tarifaire validé pour cette date.");
  return calculateContractQuote(input, profile, {
    technicalSection: asset.technical_section,
    domainCode: asset.domain_code,
  });
}

export function assetHistory(id, { assetId }) {
  owned("gmao_assets", id, assetId);
  const belongs = (f) =>
    [f.assetId, f.donorAssetId, f.recipientAssetId].includes(assetId);
  const records = [];
  for (const record of snapshot(id).records) {
    if (record.kind === "archive")
      for (const [di, doc] of record.documents.entries()) {
        for (const [group, kind] of [
          ["equipment", "equipment"],
          ["visits", "visit"],
          ["parts", "part"],
          ["fluids", "fluid"],
        ])
          for (const [index, fact] of (doc[group] || []).entries())
            if (belongs(fact))
              records.push({
                ...fact,
                kind,
                id: `${record.id}:${di}:${group}:${index}`,
                archiveId: record.id,
                source: doc.source,
                occurredOn: doc.occurredOn,
                readonly: true,
              });
      }
    else if (belongs(record)) records.push(record);
  }
  return { records };
}

// Only receipts explicitly shared into this work order are visible across teams.
export function stockMovements(id, { workOrderId }) {
  owned("gmao_work_orders", id, workOrderId);
  const own = db()
    .prepare(
      "SELECT id,data FROM purchasing_records WHERE company_id=? AND kind='movement'"
    )
    .all(id)
    .map((r) => ({ ...JSON.parse(r.data), id: r.id }));
  const shared = [];
  for (const event of db()
    .prepare(
      "SELECT evidence,happened_at FROM gmao_work_order_events WHERE company_id=? AND work_order_id=? AND event_type='stock_update'"
    )
    .all(id, workOrderId)) {
    const receipt = JSON.parse(event.evidence || "{}");
    const stored = db()
      .prepare(
        "SELECT company_id,data FROM purchasing_records WHERE id=? AND kind='movement'"
      )
      .get(receipt.movementId || "");
    if (!stored || stored.company_id === id) continue;
    const movement = JSON.parse(stored.data);
    const requestRow = db()
      .prepare(
        "SELECT data FROM purchasing_records WHERE id=? AND company_id=? AND kind='request'"
      )
      .get(movement.requestId || "", stored.company_id);
    if (!requestRow) continue;
    const request = JSON.parse(requestRow.data);
    const thread = db()
      .prepare(
        "SELECT * FROM team_threads WHERE id=? AND source_company_id=? AND target_company_id=?"
      )
      .get(request.conversationId || "", id, stored.company_id);
    const context = thread ? JSON.parse(thread.context || "{}") : {};
    if (
      request.sourceCompanyId !== id ||
      request.workOrderId !== workOrderId ||
      context.workOrderId !== workOrderId ||
      context.procurementId !== request.sourceProcurementId ||
      receipt.requestId !== movement.requestId
    )
      continue;
    shared.push({
      id: receipt.movementId,
      reference: movement.reference,
      type: movement.type,
      quantity: movement.quantity,
      locationId: movement.locationId,
      destinationId: movement.destinationId,
      shared: true,
      receivedAt: event.happened_at,
    });
  }
  const available = own.filter((m) => {
    if (!m.requestId) return true;
    const request = db()
      .prepare(
        "SELECT data FROM purchasing_records WHERE id=? AND company_id=? AND kind='request'"
      )
      .get(m.requestId, id);
    const data = request ? JSON.parse(request.data) : {};
    return (
      (!data.workOrderId || data.workOrderId === workOrderId) &&
      (!data.sourceCompanyId || data.sourceCompanyId === id)
    );
  });
  return {
    movements: [
      ...new Map([...available, ...shared].map((m) => [m.id, m])).values(),
    ].filter((m) => ["consume", "transfer", "fulfill"].includes(m.type)),
  };
}
