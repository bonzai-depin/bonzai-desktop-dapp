/** OI stages from Process.pdf. Technician completion and manager closure differ. */
export function interventionProgress(wo, data = {}) {
  const events = (data.events || []).filter((e) => e.workOrderId === wo.id);
  const fact = (type) =>
    events.find(
      (e) =>
        e.eventType === "process_" + type &&
        (!e.evidence?.purchaseOrder ||
          e.evidence.purchaseOrder === wo.purchaseOrder),
    );
  const quotes = (data.quotes || []).filter((q) => q.workOrderId === wo.id);
  const visits = (data.attachmentSheets || data.attachments || []).filter(
    (v) => v.workOrderId === wo.id,
  );
  const quoted =
    wo.repairMode === "with_quote" || !!wo.purchaseOrder || quotes.length > 0;
  const finished = ["restored", "completed"].includes(wo.status);
  const rows = [
    ["receipt", "Prise en compte", !!wo.receiptConfirmedAt, "Responsable"],
    ["visit", "Visite initiale", !!visits.length, "Technicien"],
    ...(quoted
      ? [
          [
            "proforma",
            "Proforma fournisseur",
            (data.procurements || []).some(
              (p) => p.workOrderId === wo.id && p.proformaReceivedAt,
            ),
            "Équipe Achats",
          ],
          [
            "quote",
            "Devis client",
            quotes.some((q) =>
              ["sent", "accepted", "purchase_order_received"].includes(
                q.status,
              ),
            ),
            "Responsable",
          ],
          [
            "purchase_order",
            "BC signé et retourné",
            !!fact("purchase_order_returned"),
            "Responsable",
          ],
          ["repair", "Reprise et fin des travaux", finished, "Technicien"],
          [
            "acceptance",
            "Service fait client",
            !!wo.serviceAcceptanceReceivedAt,
            "Client",
          ],
          [
            "billing",
            "Transmission facturation",
            !!fact("billing_requested") ||
              ["invoice_draft", "invoice_sent"].includes(wo.billingStatus),
            "Service facturation",
          ],
        ]
      : [["finished", "Fin des travaux", finished, "Technicien"]]),
    [
      "closed",
      "Clôture après accord client",
      wo.closureStatus === "closed" && wo.status === "completed",
      "Responsable",
    ],
  ];
  let current = rows.findIndex((r) => !r[2]);
  const stages = rows.map(([id, label, done, owner], i) => ({
    id,
    label,
    owner,
    status: done
      ? "done"
      : wo.status === "cancelled" && i === current
        ? "cancelled"
        : i === current
          ? "active"
          : "pending",
  }));
  let code = "received",
    label = "Prise en compte",
    action = "advance";
  if (wo.status === "cancelled") {
    code = "cancelled";
    label = "Annulée";
    action = null;
  } else if (wo.closureStatus === "closed") {
    code = "closed";
    label = "Clôturée";
    action = null;
  } else if (
    fact("billing_requested") ||
    ["invoice_draft", "invoice_sent"].includes(wo.billingStatus)
  ) {
    code = "billing";
    label = "À facturer";
    action = "close";
  } else if (wo.serviceAcceptanceReceivedAt) {
    code = "service";
    label = "Service fait reçu";
    action = "billing_requested";
  } else if (finished && quoted && fact("service_acceptance_requested")) {
    code = "service";
    label = "Service fait demandé";
    action = "acceptance";
  } else if (finished) {
    code = "finished";
    label = "Terminée par le technicien";
    action = quoted ? "service_acceptance_requested" : "close";
  } else if (wo.status === "on_site" || wo.status === "en_route") {
    code = "working";
    label = "Intervention en cours";
  } else if (
    quoted &&
    wo.quoteStatus === "purchase_order_received" &&
    !fact("purchase_order_signed")
  ) {
    code = "approval";
    label = "BC à signer";
    action = "purchase_order_signed";
  } else if (
    quoted &&
    wo.quoteStatus === "purchase_order_received" &&
    !fact("purchase_order_returned")
  ) {
    code = "approval";
    label = "BC signé à retourner";
    action = "purchase_order_returned";
  } else if (quotes.some((q) => ["sent", "accepted"].includes(q.status))) {
    code = "approval";
    label = "Accord client attendu";
    action = "quoteReview";
  } else if (quotes.some((q) => q.status === "draft")) {
    code = "quote_ready";
    label = "Devis à transmettre";
    action = "quoteReview";
  } else if (wo.repairMode === "with_quote") {
    code = "quote_needed";
    label = "Devis à préparer";
    action = "procurement";
  }
  return {
    stages,
    code,
    label,
    action,
    quoted,
    facts: {
      signed: fact("purchase_order_signed"),
      returned: fact("purchase_order_returned"),
      acceptanceRequested: fact("service_acceptance_requested"),
      billingRequested: fact("billing_requested"),
    },
  };
}

export const GAS_CONTRACT_TERMS = Object.freeze({
  profile: "gas_franchise_25_004",
  source: "25-004_CCTP_L3_ST3 -FRANCHISE GAZ.pdf",
  sourceSection: "ST 04",
  thresholdCents: 30000,
  deductionCents: 35000,
  includedLaborHours: 8,
  travelIncluded: true,
  liftingIncludedBelowThreshold: true,
});

export function calculateGasContractQuote(input, profile) {
  if (
    profile?.profile !== GAS_CONTRACT_TERMS.profile ||
    !profile.validatedAt ||
    !profile.validatedBy ||
    !profile.technicalSection
  )
    throw new Error(
      "Validez le profil contractuel gaz et sa section avant de calculer le devis.",
    );
  for (const key of ["partsCents", "laborCents", "travelCents", "accessCents"])
    if (
      input[key] != null &&
      (!Number.isSafeInteger(Number(input[key])) || Number(input[key]) < 0)
    )
      throw new Error("Montants HT invalides.");
  if (
    input.vatRate != null &&
    (!Number.isFinite(Number(input.vatRate)) ||
      Number(input.vatRate) < 0 ||
      Number(input.vatRate) > 100)
  )
    throw new Error("TVA invalide.");
  const parts = Number(input.partsCents || 0),
    labor = Number(input.laborCents || 0),
    hours = Number(input.laborHours),
    access = Number(input.accessCents || 0);
  if (parts > 30000 && labor > 0 && (!Number.isFinite(hours) || hours <= 0))
    throw new Error(
      "Renseignez les heures de main-d’œuvre pour appliquer la limite de 8 heures.",
    );
  const laborDeduction =
    parts <= 30000
      ? labor
      : labor > 0
        ? Math.round(labor * Math.min(1, 8 / hours))
        : 0;
  const subtotalCents =
    parts <= 30000
      ? 0
      : Math.max(0, parts + labor + access - 35000 - laborDeduction);
  const vatRate = Number(input.vatRate || 0),
    vatCents = Math.round((subtotalCents * vatRate) / 100);
  return {
    ...input,
    quoteType: "outside_bpu",
    franchiseCents: 35000,
    coefficient: 1,
    subtotalCents,
    vatRate,
    vatCents,
    totalCents: subtotalCents + vatCents,
    contractTerms: GAS_CONTRACT_TERMS,
    includedLaborCents: laborDeduction,
  };
}

/** A bound gas contract cannot silently fall back to generic pricing. */
export function gasProfileApplies(profile, asset, quoteType = "outside_bpu") {
  if (!profile || quoteType !== "outside_bpu") return false;
  if (!asset)
    throw new Error(
      "Sélectionnez l’appareil pour appliquer les conditions du contrat.",
    );
  if (asset.domainCode !== "REG") return false;
  if (asset.technicalSection !== profile.technicalSection)
    throw new Error(
      "La section de l’appareil ne correspond pas au profil gaz validé.",
    );
  return true;
}
