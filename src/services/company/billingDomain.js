/** Integer money and contract evidence shared by UI/main; no model-generated financial decisions. */
export const INVOICE_STATES = [
  "draft",
  "validated",
  "submitted",
  "accepted",
  "rejected",
  "paid",
];
export function cents(value, name = "Montant") {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${name} : centimes entiers positifs attendus.`);
  return value;
}
export function revisionCoefficient(revision) {
  if (!revision?.enabled) return 1;
  if (
    !revision.indexName?.trim() ||
    !revision.evidenceReference?.trim() ||
    !revision.notifiedAt ||
    !Number.isFinite(revision.baseIndex) ||
    revision.baseIndex <= 0 ||
    !Number.isFinite(revision.currentIndex) ||
    revision.currentIndex <= 0
  )
    throw new Error(
      "Révision : indice de base, indice actuel, notification et justificatif obligatoires.",
    );
  return (
    Math.round(
      (0.15 + (0.85 * revision.currentIndex) / revision.baseIndex) * 1000,
    ) / 1000
  );
}
export function calculateInvoice(input = {}) {
  const coefficient = revisionCoefficient(input.priceRevision);
  if (!Array.isArray(input.lines) || !input.lines.length)
    throw new Error("Ajoutez au moins une ligne.");
  const lines = input.lines.map((line) => {
    if (!String(line.description || "").trim())
      throw new Error("Chaque ligne doit avoir une désignation.");
    const quantity = Number(line.quantity ?? 1),
      vatRate = Number(line.vatRate ?? 0);
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(vatRate) ||
      vatRate < 0 ||
      vatRate > 100
    )
      throw new Error("Quantité ou TVA invalide.");
    const unitCents = cents(line.unitCents),
      revisedUnitCents = Math.round(
        unitCents * (line.revisable === false ? 1 : coefficient),
      );
    const grossCents = cents(Math.round(quantity * revisedUnitCents));
    const deductionCents = cents(line.deductionCents || 0);
    if (deductionCents > grossCents)
      throw new Error("La réfaction dépasse le montant de la ligne.");
    if (deductionCents && !line.deductionReference?.trim())
      throw new Error("Justifiez chaque réfaction.");
    const subtotalCents = grossCents - deductionCents,
      vatCents = Math.round((subtotalCents * vatRate) / 100);
    return {
      ...line,
      quantity,
      unitCents,
      revisedUnitCents,
      vatRate,
      grossCents,
      deductionCents,
      subtotalCents,
      vatCents,
      totalCents: cents(subtotalCents + vatCents),
    };
  });
  const subtotalCents = cents(lines.reduce((s, l) => s + l.subtotalCents, 0)),
    vatCents = cents(lines.reduce((s, l) => s + l.vatCents, 0));
  const totalCents = cents(subtotalCents + vatCents),
    advanceAppliedCents = cents(input.advanceAppliedCents || 0);
  if (advanceAppliedCents > totalCents)
    throw new Error("L’avance imputée dépasse le TTC.");
  if (advanceAppliedCents && !input.advanceReference?.trim())
    throw new Error("Justifiez l’avance imputée.");
  const allocations = (input.allocations || []).map((a) => {
    if (
      !a.name?.trim() ||
      !/^\d{9}(\d{5})?$/.test(a.registration || "") ||
      !a.nature?.trim()
    )
      throw new Error(
        "Renseignez identité, SIREN/SIRET et prestations de chaque bénéficiaire.",
      );
    return {
      ...a,
      subtotalCents: cents(a.subtotalCents),
      vatCents: cents(a.vatCents || 0),
    };
  });
  if (allocations.reduce((s, a) => s + a.subtotalCents, 0) > subtotalCents)
    throw new Error("Les parts des bénéficiaires dépassent le HT.");
  return {
    lines,
    allocations,
    coefficient,
    subtotalCents,
    vatCents,
    totalCents,
    advanceAppliedCents,
    amountDueCents: totalCents - advanceAppliedCents,
  };
}
export function invoiceIssues(invoice, profile, orders = []) {
  const issues = [];
  const contractBound =
    invoice.kind !== "standalone" ||
    Boolean(profile?.serviceContractId) ||
    profile?.channel === "chorus";
  profile = profile || invoice.parties || {};
  if (contractBound && (!profile?.validatedBy || !profile?.evidenceReference))
    issues.push("Validez les conditions du contrat et leur source.");
  if (
    !profile?.issuer?.name ||
    !/^\d{9}(\d{5})?$/.test(profile?.issuer?.registration || "")
  )
    issues.push("Renseignez la raison sociale et le SIREN/SIRET émetteur.");
  if (!profile?.recipient?.name) issues.push("Renseignez le destinataire.");
  if (!invoice.issuedAt || !invoice.dueAt || invoice.dueAt < invoice.issuedAt)
    issues.push("Vérifiez les dates de facture et d’échéance.");
  if (
    profile?.channel === "chorus" &&
    (!/^\d{10}$/.test(
      invoice.legalCommitment || profile.legalCommitment || "",
    ) ||
      !profile.recipient?.serviceCode ||
      !/^\d{14}$/.test(profile.recipient?.registration || ""))
  )
    issues.push(
      "Chorus : EJ à 10 chiffres, code service et SIRET destinataire obligatoires.",
    );
  if (invoice.kind === "forfait") {
    if (
      !invoice.periodStart ||
      !invoice.periodEnd ||
      invoice.periodStart > invoice.periodEnd
    )
      issues.push("Renseignez la période facturée.");
    if (!["monthly", "semiannual", "custom"].includes(profile?.cadence))
      issues.push("Renseignez la périodicité contractuelle.");
    if (
      invoice.periodStart &&
      invoice.periodEnd &&
      ["monthly", "semiannual"].includes(profile?.cadence)
    ) {
      const start = new Date(invoice.periodStart),
        end = new Date(invoice.periodEnd),
        months = profile.cadence === "monthly" ? 1 : 6;
      const expected = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 0),
      );
      if (
        start.getUTCDate() !== 1 ||
        end.toISOString().slice(0, 10) !== expected.toISOString().slice(0, 10)
      )
        issues.push(
          "La période doit couvrir un mois ou six mois complets selon le contrat.",
        );
    }
    if (!invoice.admissionReference?.trim())
      issues.push("Joignez la référence des prestations forfaitaires admises.");
  } else if (invoice.kind === "unit" && !(invoice.workOrderIds || []).length)
    issues.push("Rattachez les interventions facturées.");
  for (const id of invoice.workOrderIds || []) {
    const wo = orders.find((o) => o.id === id);
    if (!wo?.serviceAcceptanceReference || !wo?.serviceAcceptanceReceivedAt)
      issues.push(`Service fait manquant : ${wo?.workOrderNumber || id}.`);
    if (
      !["ready_to_invoice", "invoice_draft", "invoice_sent"].includes(
        wo?.billingStatus,
      )
    )
      issues.push(
        `Transmission facturation à valider : ${wo?.workOrderNumber || id}.`,
      );
  }
  if (
    invoice.priceRevision?.enabled &&
    (!invoice.priceBasisAt ||
      invoice.priceBasisAt < invoice.priceRevision.notifiedAt)
  )
    issues.push(
      "La date du BC ou de la période révisée doit suivre la notification des prix.",
    );
  if (
    contractBound &&
    (invoice.lines || []).some(
      (l) => l.admittedCents == null || l.admittedCents !== l.subtotalCents,
    )
  )
    issues.push("Confirmez les montants HT admis pour chaque ligne.");
  return issues;
}
