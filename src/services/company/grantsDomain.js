import { currentGrantDocument } from './grantDocuments.js';
export const GRANT_DOCUMENT_TYPES = [
  ['company_identity','Company identity'],['qualification','Professional qualification'],
  ['quote','Quote'],['invoice','Invoice'],['tax_notice','Tax notice'],
  ['attestation','Signed declaration'],['bank','Bank evidence'],['notice','Provider notice']
];
/** Evidence-based grant dossiers. A model may propose facts, never certify eligibility. */
export const GRANT_STAGES = [
  "qualification",
  "documents",
  "review",
  "submitted",
  "instruction",
  "awarded",
  "settled",
];
export const GRANT_LABELS = [
  "To qualify",
  "Documents",
  "To approve",
  "Submitted",
  "Under review",
  "Awarded",
  "Received",
];
export const GRANT_SCHEMES = [
  {
    id: "BAR-TH-129",
    label: "PAC air/air",
    territory: "Territoire et version à vérifier",
    url: "https://calculateur-cee.ademe.fr/pdf/display/201/BAR-TH-129",
  },
  {
    id: "BAR-TH-141",
    label: "Climatiseur performant — outre-mer",
    territory: "Outre-mer — conditions à vérifier",
    url: "https://www.ecologie.gouv.fr/politiques-publiques/operations-standardisees-deconomies-denergie",
  },
  {
    id: "AGIRPLUS",
    label: "EDF Agir Plus",
    territory: "Martinique / Guyane — offre locale à vérifier",
    url: "https://agirplus.edf.fr/",
  },
];
const required = (value, label) => {
  if (!String(value || "").trim()) throw new Error(`${label} is required.`);
};
export function validateDossier(input, previous) {
  const value = { ...input };
  if (previous && input.revision !== previous.revision)
    throw new Error("Dossier changed. Reload before saving.");
  if (
    previous &&
    GRANT_STAGES.indexOf(previous.stage) >= 3 &&
    [
      "title",
      "beneficiary",
      "territory",
      "scheme",
      "ruleSource",
      "ruleVersion",
      "portalUrl",
      "applicationReference",
      "workOrderReference",
    ].some((k) => (value[k] || "") !== (previous[k] || ""))
  )
    throw new Error(
      "Submitted dossier identity is locked. Create a new dossier for a different application.",
    );
  value.eligibilityReviewedAt = previous?.eligibilityReviewedAt || null;
  value.payments = previous?.payments || [];
  value.corrections = previous?.corrections || [];
  value.preparationTaskId = previous?.preparationTaskId || null;
  value.preparation = null; // Any edit invalidates the preparation snapshot.
  if (value.requiredDocumentTypes && (!Array.isArray(value.requiredDocumentTypes) || value.requiredDocumentTypes.some(t => typeof t !== 'string'))) throw new Error('Invalid required document types.');
  value.revision = (previous?.revision || 0) + 1;
  for (const key of ["dueDate"])
    if (
      value[key] &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value[key]) ||
        !Number.isFinite(Date.parse(value[key])))
    )
      throw new Error("Invalid date.");
  if (!Array.isArray(value.documentIds || []))
    throw new Error("Document IDs must be an array.");
  required(value.title, "Dossier title");
  required(value.beneficiary, "Beneficiary");
  required(value.territory, "Territory");
  for (const key of ["estimatedCents", "awardedCents", "receivedCents"]) {
    value[key] = Number(value[key] || 0);
    if (!Number.isSafeInteger(value[key]) || value[key] < 0)
      throw new Error("Amounts must be non-negative integer cents.");
  }
  if (previous?.payments?.length && value.receivedCents !== previous.receivedCents) throw new Error('Use bank reconciliation to update received amounts.');
  // Editing a dossier never changes its workflow stage or evidence history.
  value.stage = previous?.stage || "qualification";
  value.history = previous?.history || [];
  value.remindedDate = previous?.remindedDate || null;
  if (
    previous &&
    ["documents", "review"].includes(previous.stage) &&
    ["beneficiary", "territory", "scheme", "ruleSource", "ruleVersion"].some(
      (k) => (value[k] || "") !== (previous[k] || ""),
    )
  ) {
    value.stage = "qualification";
    value.eligibilityReviewedAt = null;
    value.history = [
      ...value.history,
      {
        from: previous.stage,
        to: "qualification",
        at: Date.now(),
        evidence: "Eligibility facts changed; review required.",
      },
    ];
  }
  if (
    previous?.stage === "settled" &&
    ["awardedCents", "receivedCents"].some((k) => value[k] !== previous[k])
  )
    throw new Error("Settled amounts are locked.");
  return value;
}
export function transitionDossier(dossier, input, documents, now = Date.now()) {
  if (input.revision !== dossier.revision)
    throw new Error("Dossier changed. Reload before advancing.");
  if (["rejected", "withdrawn"].includes(dossier.stage))
    throw new Error("This application is closed.");
  if (["rejected", "withdrawn"].includes(input.stage)) {
    required(input.evidence, "Closure reason");
    if (
      input.stage === "rejected" &&
      !documents.some(
        (d) =>
          d.id === input.evidenceDocumentId &&
          currentGrantDocument(d, dossier, now) && d.documentType === "notice" &&
          (dossier.documentIds || []).includes(d.id),
      )
    )
      throw new Error("Attach the refusal notice.");
    return {
      ...dossier,
      revision: (dossier.revision || 0) + 1,
      stage: input.stage,
      history: [
        ...(dossier.history || []),
        {
          from: dossier.stage,
          to: input.stage,
          at: now,
          evidence: input.evidence,
          evidenceDocumentId: input.evidenceDocumentId || null,
        },
      ],
    };
  }
  const index = GRANT_STAGES.indexOf(dossier.stage),
    next = GRANT_STAGES[index + 1];
  if (!next || input.stage !== next)
    throw new Error("Complete the next workflow step first.");
  const attached = documents.filter((d) =>
    (dossier.documentIds || []).includes(d.id) && currentGrantDocument(d, dossier, now),
  );
  if (next === "documents") {
    required(dossier.scheme, "Scheme");
    required(dossier.ruleSource, "Official rule source");
    if (!/^https:\/\//.test(dossier.ruleSource))
      throw new Error("Use an HTTPS official rule source.");
    required(dossier.ruleVersion, "Rule version / verification date");
    required(input.evidence, "Eligibility review and reviewer");
  }
  if (["review", "submitted"].includes(next)) {
    if (!attached.length)
      throw new Error("Attach current supporting documents.");
    required(dossier.checklist, "Document and chronology checklist");
  }
  if (["submitted", "awarded", "settled"].includes(next)) {
    required(input.evidence, "Receipt or decision reference");
    if (!attached.some((d) => d.id === input.evidenceDocumentId && d.documentType === (next === "settled" ? "bank" : "notice")))
      throw new Error(
        "Attach and select the supporting receipt, decision or bank evidence.",
      );
  }
  if (next === "submitted") {
    required(dossier.portalUrl, "Portal URL");
    required(dossier.applicationReference, "Application reference");
  }
  if (next === "awarded" && !dossier.awardedCents)
    throw new Error("Record the confirmed award amount.");
  if (
    next === "settled" &&
    (!dossier.receivedCents || dossier.receivedCents < dossier.awardedCents)
  )
    throw new Error(
      "Full settlement needs evidence of the awarded amount received.",
    );
  return {
    ...dossier,
    revision: (dossier.revision || 0) + 1,
    stage: next,
    eligibilityReviewedAt: next === "documents" ? now : dossier.eligibilityReviewedAt,
    history: [
      ...(dossier.history || []),
      {
        from: dossier.stage,
        to: next,
        at: now,
        evidence: input.evidence || "",
        evidenceDocumentId: input.evidenceDocumentId || null,
      },
    ],
  };
}
