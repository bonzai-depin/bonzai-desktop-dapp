/**
 * Public tenders: watched notices and the company's response dossiers.
 *
 * French buyer platforms offer no public API to deposit a bid, so nothing here
 * sends one. The team prepares the package, the owner approves the exact list
 * of files and the buyer they go to, deposits it on the buyer's platform, and
 * records the platform's receipt. A model may draft pieces; it never approves.
 */
export const TENDER_STAGES = ["preparing", "review", "approved", "deposited", "awarded"];
export const TENDER_CLOSED = ["lost", "withdrawn"];
export const TENDER_PIECES = [
  "candidature", // DUME, or DC1 and DC2
  "technical", // mémoire technique
  "financial", // BPU, DPGF, DQE or price schedule
  "commitment", // acte d'engagement
  "company_identity", // extrait Kbis or equivalent
  "tax_social", // attestations fiscales et sociales
  "insurance",
  "references",
];
/** Evidence kept with a dossier but never part of what is deposited. */
export const TENDER_EVIDENCE = ["receipt", "notice", "consultation"];
export const DEFAULT_REQUIRED_PIECES = ["candidature", "technical", "financial"];

const text = (value, max = 2000) => String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
const required = (value, label) => {
  if (!text(value)) throw new Error(`${label} is required.`);
};
const httpsUrl = (value) => {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
};
const isoDate = (value) => (value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null);

/** A notice exactly as kept on this device, whatever the renderer or a model sent. */
export function sanitizeNotice(input = {}) {
  const notice = {
    source: text(input.source, 40),
    sourceId: text(input.sourceId, 80),
    title: text(input.title, 1000),
    buyer: text(input.buyer, 300),
    publishedAt: isoDate(input.publishedAt),
    deadline: isoDate(input.deadline),
    departments: (Array.isArray(input.departments) ? input.departments : []).map((d) => text(d, 5)).filter(Boolean).slice(0, 30),
    type: text(input.type, 80),
    nature: text(input.nature, 120),
    procedure: text(input.procedure, 120),
    descriptors: (Array.isArray(input.descriptors) ? input.descriptors : []).map((d) => text(d, 80)).filter(Boolean).slice(0, 30),
    url: httpsUrl(input.url),
    buyerProfileUrl: httpsUrl(input.buyerProfileUrl),
  };
  if (notice.source !== "boamp" || !/^[A-Za-z0-9_-]{3,80}$/.test(notice.sourceId))
    throw new Error("Unknown tender notice source.");
  required(notice.title, "Notice title");
  return notice;
}

export const deadlinePassed = (record, now = Date.now()) =>
  !!record?.deadline && Date.parse(record.deadline) < now;

export function validateResponse(input, previous) {
  if (previous && input.revision !== previous.revision)
    throw new Error("Response changed. Reload before saving.");
  if (previous && ["deposited", "awarded", ...TENDER_CLOSED].includes(previous.stage))
    throw new Error("A deposited or closed response is locked.");
  const value = {
    noticeId: previous?.noticeId ?? (input.noticeId || null),
    title: text(input.title, 1000),
    buyer: text(input.buyer, 300),
    consultationReference: text(input.consultationReference, 120),
    lots: text(input.lots, 500),
    deadline: isoDate(input.deadline),
    platformUrl: input.platformUrl ? httpsUrl(input.platformUrl) : "",
    notes: text(input.notes, 8000),
    requiredPieces: [...new Set(input.requiredPieces || previous?.requiredPieces || DEFAULT_REQUIRED_PIECES)],
    documentIds: [...new Set(input.documentIds || previous?.documentIds || [])],
  };
  required(value.title, "Consultation title");
  required(value.buyer, "Buyer");
  if (input.platformUrl && !value.platformUrl) throw new Error("Use the HTTPS address of the buyer platform.");
  if (value.requiredPieces.some((piece) => !TENDER_PIECES.includes(piece)))
    throw new Error("Unknown response piece.");
  // Any edit invalidates the preparation snapshot and an approval given earlier:
  // the owner approved one exact package for one buyer, not the next version.
  const reopened = previous && ["review", "approved"].includes(previous.stage);
  return {
    ...value,
    stage: reopened ? "preparing" : previous?.stage || "preparing",
    revision: (previous?.revision || 0) + 1,
    preparation: null,
    approval: null,
    deposit: null,
    outcome: null,
    preparationTaskId: previous?.preparationTaskId || null,
    remindedFor: previous?.remindedFor || null,
    history: [
      ...(previous?.history || []),
      ...(reopened ? [{ from: previous.stage, to: "preparing", at: Date.now(), evidence: "Response edited; review and approval required again." }] : []),
    ],
  };
}

export const documentBelongsToResponse = (document, response) =>
  !!response && (!document.responseId ? ["company_identity", "tax_social", "insurance", "references"].includes(document.pieceType) : document.responseId === response.id);

export const currentTenderDocument = (document, response, now = Date.now()) =>
  documentBelongsToResponse(document, response) &&
  (!document.validUntil || Date.parse(document.validUntil + "T23:59:59") >= now);

/** Deterministic readiness check. Never a statement that the bid is admissible. */
export function prepareTender(response, documents, now = Date.now()) {
  const attached = documents.filter(
    (d) => (response.documentIds || []).includes(d.id) && TENDER_PIECES.includes(d.pieceType) && currentTenderDocument(d, response, now),
  );
  const missing = (response.requiredPieces || []).filter((piece) => !attached.some((d) => d.pieceType === piece));
  const unreviewed = attached.filter((d) => d.draft && !d.reviewedBy);
  const blockers = [];
  if (!response.deadline) blockers.push("Record the response deadline.");
  else if (deadlinePassed(response, now)) blockers.push("The response deadline has passed.");
  if (!response.platformUrl) blockers.push("Record the buyer platform where the response is deposited.");
  if (!(response.requiredPieces || []).length) blockers.push("Select the pieces the consultation requires.");
  if (missing.length) blockers.push("Some required pieces are missing.");
  if (unreviewed.length) blockers.push("Drafts written by the team need human review.");
  return { documentIds: attached.map((d) => d.id), missing, unreviewed: unreviewed.map((d) => d.id), blockers, preparedAt: now };
}

/** Exactly what the owner is asked to approve: the recipient and every file. */
export function submissionManifest(response, documents) {
  return {
    recipient: {
      buyer: response.buyer,
      consultationReference: response.consultationReference || "",
      lots: response.lots || "",
      platformUrl: response.platformUrl || "",
    },
    deadline: response.deadline || null,
    documents: documents
      .filter((d) => (response.documentIds || []).includes(d.id) && TENDER_PIECES.includes(d.pieceType) && currentTenderDocument(d, response))
      .map((d) => ({ id: d.id, label: d.label, pieceType: d.pieceType, sha256: d.blob_id, ext: d.ext }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}
export const sameManifest = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const step = (response, to, now, evidence, extra = {}) => ({
  ...response,
  ...extra,
  stage: to,
  revision: (response.revision || 0) + 1,
  history: [...(response.history || []), { from: response.stage, to, at: now, evidence: evidence || "" }],
});

export function requestReview(response, documents, input, now = Date.now()) {
  if (input.revision !== response.revision) throw new Error("Response changed. Reload before continuing.");
  if (response.stage !== "preparing") throw new Error("Only a response in preparation can be sent for review.");
  const preparation = prepareTender(response, documents, now);
  if (preparation.blockers.length) throw new Error(preparation.blockers.join(" "));
  return step(response, "review", now, "Package ready for owner review.", { preparation, documentIds: preparation.documentIds });
}

/** The owner approves the package shown on screen; a stale or altered list is refused. */
export function approveResponse(response, documents, input, now = Date.now()) {
  if (input.revision !== response.revision) throw new Error("Response changed. Reload before approving.");
  if (response.stage !== "review") throw new Error("Send the response for review before approving it.");
  if (input.confirmed !== true) throw new Error("Confirm the package and its recipient.");
  required(input.approvedBy, "Approver");
  const preparation = prepareTender(response, documents, now);
  if (preparation.blockers.length) throw new Error(preparation.blockers.join(" "));
  const manifest = submissionManifest(response, documents);
  if (!manifest.documents.length || !sameManifest(manifest, input.manifest))
    throw new Error("The package changed since it was displayed. Review it again.");
  return step(response, "approved", now, `Approved by ${text(input.approvedBy, 120)}.`, {
    approval: { approvedBy: text(input.approvedBy, 120), approvedAt: now, manifest },
  });
}

/** Recorded after the owner deposited the approved package on the buyer platform. */
export function recordDeposit(response, documents, input, now = Date.now()) {
  if (input.revision !== response.revision) throw new Error("Response changed. Reload before continuing.");
  if (response.stage !== "approved" || !response.approval)
    throw new Error("No deposit without an approved package.");
  if (!sameManifest(response.approval.manifest, submissionManifest(response, documents)))
    throw new Error("The package differs from the approved one. Approve the current package first.");
  if (input.confirmed !== true) throw new Error("Confirm that the deposit was made on the buyer platform.");
  required(input.recordedBy, "Person who deposited the response");
  required(input.reference, "Deposit receipt reference");
  const receipt = documents.find((d) => d.id === input.receiptDocumentId && d.pieceType === "receipt" && d.responseId === response.id && !d.draft);
  if (!receipt) throw new Error("Attach the deposit receipt issued by the buyer platform.");
  return step(response, "deposited", now, `Receipt ${text(input.reference, 120)}.`, {
    deposit: { reference: text(input.reference, 120), recordedBy: text(input.recordedBy, 120), depositedAt: isoDate(input.depositedAt) || new Date(now).toISOString(), receiptDocumentId: receipt.id, recordedAt: now },
  });
}

export function recordOutcome(response, documents, input, now = Date.now()) {
  if (input.revision !== response.revision) throw new Error("Response changed. Reload before continuing.");
  if (!["awarded", "lost", "withdrawn"].includes(input.outcome)) throw new Error("Unknown outcome.");
  if ([...TENDER_CLOSED, "awarded"].includes(response.stage)) throw new Error("This response is closed.");
  required(input.evidence, "Reason or decision reference");
  if (input.outcome !== "withdrawn") {
    if (response.stage !== "deposited") throw new Error("Only a deposited response can be awarded or lost.");
    if (!documents.some((d) => d.id === input.evidenceDocumentId && d.pieceType === "notice" && d.responseId === response.id))
      throw new Error("Attach the buyer's decision notice.");
  }
  return step(response, input.outcome, now, text(input.evidence, 500), {
    outcome: { result: input.outcome, evidenceDocumentId: input.evidenceDocumentId || null, at: now },
  });
}

/** Search filters the user typed. These are the only values a search sends. */
export function normalizeSearch(input = {}) {
  const departments = String(input.departments ?? "").split(/[\s,;]+/).map((d) => d.trim().toUpperCase()).filter(Boolean);
  if (departments.some((d) => !/^(?:\d{2,3}|2[AB])$/.test(d))) throw new Error("Use department numbers such as 75, 2A or 972.");
  const type = text(input.type, 20).toUpperCase();
  if (type && !["TRAVAUX", "SERVICES", "FOURNITURES"].includes(type)) throw new Error("Unknown contract type.");
  const page = Number(input.page || 0);
  if (!Number.isSafeInteger(page) || page < 0 || page > 200) throw new Error("Invalid page.");
  return {
    keywords: text(input.keywords, 120),
    departments: [...new Set(departments)].slice(0, 10),
    type,
    openOnly: input.openOnly !== false,
    page,
  };
}
