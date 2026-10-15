/** Contract arithmetic is explicit, versioned and independent of model output. */
export const CCTP_PRICING_RULES = Object.freeze([
  {
    id: "chiller",
    section: "ST1",
    label: "Groupes froids",
    thresholdCents: 150000,
  },
  {
    id: "air_conditioner",
    section: "ST1",
    label: "Climatiseurs / déshumidificateurs",
    thresholdCents: 50000,
  },
  {
    id: "other_cooling",
    section: "ST1",
    label: "Autres équipements ST1",
    thresholdCents: 10000,
  },
  {
    id: "kitchen_hood",
    section: "ST2",
    label: "Hottes de cuisine",
    thresholdCents: 30000,
  },
  {
    id: "air_handler",
    section: "ST2",
    label: "Centrales de traitement d’air",
    thresholdCents: 30000,
  },
  {
    id: "other_ventilation",
    section: "ST2",
    label: "Autres équipements ST2",
    thresholdCents: 10000,
    requiresResolution: true,
  },
  {
    id: "pressure",
    section: "ST3",
    domain: "ESP",
    label: "Équipements sous pression",
    thresholdCents: 30000,
  },
]);

export function validatePricingProfile(
  input,
  { confirmed = false, now = Date.now() } = {},
) {
  if (
    !confirmed ||
    !String(input?.validatedBy || "").trim() ||
    !String(input?.reference || "").trim()
  )
    throw new Error(
      "Validez les règles tarifaires avec un responsable et une référence contractuelle.",
    );
  if (!["included", "billable"].includes(input.accessAboveThreshold))
    throw new Error(
      "Précisez le traitement des moyens de levage au-delà de la franchise.",
    );
  const coefficient = Number(input.coefficient);
  if (!Number.isFinite(coefficient) || coefficient <= 0 || coefficient > 100)
    throw new Error("Coefficient contractuel invalide.");
  return {
    id: "cctp_25_004",
    version: 1,
    reference: input.reference.trim(),
    validatedBy: input.validatedBy.trim(),
    validatedAt: now,
    coefficient,
    accessAboveThreshold: input.accessAboveThreshold,
    ventilationResolution: String(input.ventilationResolution || "").trim(),
    rules: CCTP_PRICING_RULES.map((rule) => ({ ...rule })),
    includedLaborHours: 8,
    travelIncluded: true,
  };
}

export function calculateContractQuote(input, profile, asset) {
  if (
    profile?.id !== "cctp_25_004" ||
    profile.version !== 1 ||
    !profile.validatedAt ||
    !profile.validatedBy
  )
    throw new Error("Le profil tarifaire du contrat doit être validé.");
  const rule = CCTP_PRICING_RULES.find(
    (item) => item.id === input.pricingCategory,
  );
  if (
    !rule ||
    !asset ||
    asset.technicalSection !== rule.section ||
    (rule.domain && asset.domainCode !== rule.domain)
  )
    throw new Error(
      "Choisissez une catégorie tarifaire correspondant à l’équipement.",
    );
  if (asset.domainCode === "REG")
    throw new Error("Utilisez le profil gaz validé pour cet équipement.");
  if (rule.requiresResolution && !profile.ventilationResolution)
    throw new Error(
      "La fiche ST2 indique > 100 € dans les deux branches. Enregistrez la clarification contractuelle avant de calculer ce devis.",
    );
  for (const key of ["partsCents", "laborCents", "travelCents", "accessCents"])
    if (!Number.isSafeInteger(input[key] ?? 0) || (input[key] ?? 0) < 0)
      throw new Error("Montants HT invalides.");
  const vatRate = Number(input.vatRate ?? 0);
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100)
    throw new Error("TVA invalide.");
  const parts = input.partsCents ?? 0,
    labor = input.laborCents ?? 0;
  const included = parts <= rule.thresholdCents;
  const hours = Number(input.laborHours);
  if (!included && labor && (!Number.isFinite(hours) || hours <= 0))
    throw new Error(
      "Renseignez les heures de main-d’œuvre pour appliquer la limite de 8 heures.",
    );
  const includedLaborCents = included
    ? labor
    : Math.round(labor * Math.min(1, 8 / (hours || 1)));
  const chargeablePartsCents = Math.max(0, parts - rule.thresholdCents);
  const partsAfterCoefficientCents = Math.round(
    chargeablePartsCents * profile.coefficient,
  );
  const access =
    profile.accessAboveThreshold === "billable" ? (input.accessCents ?? 0) : 0;
  const subtotalCents = included
    ? 0
    : partsAfterCoefficientCents + labor - includedLaborCents + access;
  const vatCents = Math.round((subtotalCents * vatRate) / 100);
  if (!Number.isSafeInteger(subtotalCents + vatCents))
    throw new Error("Montant hors limites.");
  return {
    ...input,
    coefficient: profile.coefficient,
    franchiseCents: rule.thresholdCents,
    chargeablePartsCents,
    partsAfterCoefficientCents,
    includedLaborCents,
    subtotalCents,
    vatRate,
    vatCents,
    totalCents: subtotalCents + vatCents,
    contractTerms: {
      ...rule,
      includedLaborHours: 8,
      travelIncluded: true,
      profileVersion: profile.version,
    },
    formula:
      "Pièces ≤ franchise : inclus ; sinon (pièces − franchise) × K + main-d’œuvre au-delà de 8 h + levage selon validation ; déplacement inclus.",
  };
}
